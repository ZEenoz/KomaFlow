import { db, deleteJobs } from '../../db';
import type { ProjectFolder, TranslationJob } from '../../db';
import type { SyncTombstone } from '../../shared/librarySync';
import { clearThumbnailCache, invalidateJobThumbnail } from '../canvas/thumbnailRenderer';
import { imageBytes } from './libraryStorage';

export { getLibraryStorageBreakdown, type LibraryStorageBreakdown } from './libraryStorage';

/** Clear Library mode: wipe everything or only the records named in the options. */
export type ClearLibraryMode = 'all' | 'custom';

/** Which record families a Clear Library request may touch. */
export type ClearLibraryScope = 'all' | 'projects' | 'pages';

/** Input for {@link clearLibrary}. */
export interface ClearLibraryOptions {
  /** `all` ignores explicit ID lists; `custom` acts on the supplied IDs. */
  mode: ClearLibraryMode;
  /** Record family to clear; defaults to `all`. */
  scope?: ClearLibraryScope;
  /** Project IDs selected in custom mode. */
  projectIds?: number[];
  /** Job IDs selected in custom mode. */
  jobIds?: number[];
  /**
   * When a project is deleted, false unlinks its member jobs back to history.
   * True permanently deletes those jobs, deduplicating IDs also present in `jobIds`.
   */
  cascadeProjects?: boolean;
}

/** Counts and byte totals reported after a Clear Library operation. */
export interface ClearLibraryResult {
  /** Existing project records permanently deleted. */
  deletedProjects: number;
  /** Existing translation jobs permanently deleted. */
  deletedJobs: number;
  /** Member jobs detached from a deleted project and kept in history. */
  unlinkedJobs: number;
  /** Image records removed with their parent jobs. */
  deletedImages: number;
  /** Text block records removed with their parent images. */
  deletedTextBlocks: number;
  /** Total size of the removed image blobs, in bytes. */
  freedBytes: number;
}

/** Tombstone discriminator written when a project is permanently removed. */
const PROJECT_TOMBSTONE_KIND = 'project' as const;

/**
 * Filters and deduplicates optional numeric identifiers.
 *
 * @param ids - Identifier list supplied by a caller, if any.
 * @returns A set containing only finite numeric identifiers.
 */
function toIdSet(ids: number[] | undefined): Set<number> {
  return new Set((ids ?? []).filter((id) => Number.isFinite(id)));
}

/**
 * Resolves the existing project IDs a request is allowed to clear.
 *
 * @param mode - Wipe-everything or explicit-selection mode.
 * @param scope - Record family being cleared.
 * @param projects - Current project records.
 * @param requestedIds - Explicit IDs supplied for custom mode.
 * @returns Existing project IDs that should be deleted.
 */
function selectProjectIds(
  mode: ClearLibraryMode,
  scope: ClearLibraryScope,
  projects: ProjectFolder[],
  requestedIds: Set<number>
): Set<number> {
  if (scope === 'pages') return new Set();
  return new Set(projects.flatMap((project) => {
    if (project.id === undefined) return [];
    return mode === 'all' || requestedIds.has(project.id) ? [project.id] : [];
  }));
}

/**
 * Resolves the existing job IDs a request explicitly targets.
 *
 * @param mode - Wipe-everything or explicit-selection mode.
 * @param scope - Record family being cleared.
 * @param jobs - Current translation job records.
 * @param requestedIds - Explicit IDs supplied for custom mode.
 * @returns Existing job IDs that should be deleted before cascade handling.
 */
function selectJobIds(
  mode: ClearLibraryMode,
  scope: ClearLibraryScope,
  jobs: TranslationJob[],
  requestedIds: Set<number>
): Set<number> {
  if (scope === 'projects') return new Set();
  return new Set(jobs.flatMap((job) => {
    if (job.id === undefined) return [];
    return mode === 'all' || requestedIds.has(job.id) ? [job.id] : [];
  }));
}

/**
 * Deletes selected library records atomically and reports what was removed.
 *
 * Custom mode honours `projectIds` and `jobIds`; all mode ignores those lists. A deleted project
 * either unlinks its member jobs (the default) or deletes them with the project. Explicitly listed
 * jobs are always deleted once, even when a cascade would also reach them.
 *
 * @param options - Mode, scope, explicit IDs, and project-cascade preference.
 * @returns Counts of deleted and unlinked records plus freed image bytes.
 */
export async function clearLibrary(options: ClearLibraryOptions): Promise<ClearLibraryResult> {
  const mode = options.mode;
  const scope = options.scope ?? 'all';
  const cascadeProjects = options.cascadeProjects ?? false;
  const requestedProjectIds = toIdSet(options.projectIds);
  const requestedJobIds = toIdSet(options.jobIds);

  let deletedProjectIds: number[] = [];
  let deletedJobIds: number[] = [];
  let unlinkedJobs = 0;
  let deletedImages = 0;
  let deletedTextBlocks = 0;
  let freedBytes = 0;

  await db.transaction(
    'rw',
    db.translationJobs,
    db.images,
    db.textBlocks,
    db.projectFolders,
    db.syncTombstones,
    async () => {
      const [projects, jobs] = await Promise.all([
        db.projectFolders.toArray(),
        db.translationJobs.toArray(),
      ]);
      const targetProjectIds = selectProjectIds(mode, scope, projects, requestedProjectIds);
      const targetJobIds = selectJobIds(mode, scope, jobs, requestedJobIds);

      const memberJobs = jobs.filter((job) => (
        job.folderId !== undefined && targetProjectIds.has(job.folderId)
      ));
      if (cascadeProjects) {
        for (const job of memberJobs) {
          if (job.id !== undefined) targetJobIds.add(job.id);
        }
      }
      const unlinkTargets = memberJobs.filter((job) => (
        job.id !== undefined && !targetJobIds.has(job.id)
      ));
      const jobsToDelete = jobs.filter((job) => (
        job.id !== undefined && targetJobIds.has(job.id)
      ));

      deletedProjectIds = Array.from(targetProjectIds);
      deletedJobIds = jobsToDelete.flatMap((job) => (job.id === undefined ? [] : [job.id]));

      const images = deletedJobIds.length > 0
        ? await db.images.where('jobId').anyOf(deletedJobIds).toArray()
        : [];
      const imageIds = images.flatMap((image) => (image.id === undefined ? [] : [image.id]));
      deletedImages = images.length;
      freedBytes = images.reduce((total, image) => total + imageBytes(image), 0);
      deletedTextBlocks = imageIds.length > 0
        ? await db.textBlocks.where('imageId').anyOf(imageIds).count()
        : 0;

      await deleteJobs(deletedJobIds);

      for (const job of unlinkTargets) {
        if (job.id === undefined) continue;
        await db.translationJobs.update(job.id, {
          folderId: undefined,
          projectOrder: undefined,
        });
      }
      unlinkedJobs = unlinkTargets.length;

      const deletedAt = Date.now();
      const tombstones = projects.flatMap((project): SyncTombstone[] => (
        project.id !== undefined && targetProjectIds.has(project.id) && project.syncId
          ? [{ syncId: project.syncId, kind: PROJECT_TOMBSTONE_KIND, deletedAt }]
          : []
      ));
      if (tombstones.length > 0) {
        await db.syncTombstones.bulkPut(tombstones);
      }
      if (deletedProjectIds.length > 0) {
        await db.projectFolders.bulkDelete(deletedProjectIds);
      }
    }
  );

  if (mode === 'all' && scope === 'all') {
    clearThumbnailCache();
  } else {
    for (const jobId of deletedJobIds) invalidateJobThumbnail(jobId);
  }

  return {
    deletedProjects: deletedProjectIds.length,
    deletedJobs: deletedJobIds.length,
    unlinkedJobs,
    deletedImages,
    deletedTextBlocks,
    freedBytes,
  };
}
