import { db, deleteJobs } from '../../db';
import { createSyncId } from '../../shared/librarySync';
import { invalidateJobThumbnail } from '../canvas/thumbnailRenderer';

export { getProjectStats, type ProjectStats } from './projectStats';
export {
  clearLibrary,
  getLibraryStorageBreakdown,
  type ClearLibraryMode,
  type ClearLibraryOptions,
  type ClearLibraryResult,
  type ClearLibraryScope,
  type LibraryStorageBreakdown,
} from './libraryMaintenance';
export {
  getStorageQuota,
  requestPersistentStorage,
  HIGH_STORAGE_WARNING_THRESHOLD_PERCENT,
  type StorageQuotaInfo,
} from './storageQuota';

/** Default fallback name for newly created manga projects. */
export const DEFAULT_PROJECT_TITLE = 'Untitled Manga';

/**
 * Creates a new manga project folder.
 *
 * @param title - Optional custom project title. When omitted, generates an incremented title.
 * @param description - Optional notes or summary for the project.
 * @returns Resolves with the newly generated ProjectFolder primary key ID.
 */
export async function createProject(title?: string, description?: string): Promise<number> {
  const existingCount = await db.projectFolders.count();
  const safeTitle = (title && title.trim()) || `${DEFAULT_PROJECT_TITLE} ${existingCount + 1}`;
  const now = Date.now();

  const projectId = await db.projectFolders.add({
    title: safeTitle,
    timestamp: now,
    updatedAt: now,
    isFavorite: false,
    description: description?.trim() || '',
    customOrder: [],
    syncId: createSyncId(),
  });

  return Number(projectId);
}

/**
 * Renames an existing project and stamps its updatedAt timestamp.
 *
 * @param projectId - Primary key ID of the project to rename.
 * @param title - New non-empty title string.
 * @returns Resolves once the title update has been committed.
 */
export async function renameProject(projectId: number, title: string): Promise<void> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;

  await db.projectFolders.update(projectId, {
    title: cleanTitle,
    updatedAt: Date.now(),
  });
}

/**
 * Assigns a specific job ID as the cover thumbnail for a project.
 *
 * @param projectId - Target project ID.
 * @param jobId - Job ID to pin as the visual cover.
 * @returns Resolves once updated.
 */
export async function setProjectCover(projectId: number, jobId: number): Promise<void> {
  await db.projectFolders.update(projectId, {
    coverJobId: jobId,
    updatedAt: Date.now(),
  });
}

/**
 * Deletes a project atomically. Optionally cascades deletion to all member translation jobs.
 *
 * When the project carries a `syncId`, a project tombstone is written in the same transaction.
 * Cascaded jobs leave their own tombstones through {@link deleteJobs}, and their cached thumbnails
 * are invalidated after the database commit.
 *
 * @param projectId - Target project ID to delete.
 * @param cascadeDeleteJobs - When true, permanently deletes member images. When false, unlinks them to library.
 * @returns Resolves once database operations complete.
 */
export async function deleteProject(projectId: number, cascadeDeleteJobs = false): Promise<void> {
  let deletedJobIds: number[] = [];

  await db.transaction(
    'rw',
    db.translationJobs,
    db.images,
    db.textBlocks,
    db.projectFolders,
    db.syncTombstones,
    async () => {
      const project = await db.projectFolders.get(projectId);
      const memberJobs = await db.translationJobs.where('folderId').equals(projectId).toArray();
      const jobIds = memberJobs.flatMap((job) => (job.id !== undefined ? [job.id] : []));

      if (cascadeDeleteJobs && jobIds.length > 0) {
        await deleteJobs(jobIds);
        deletedJobIds = jobIds;
      } else if (jobIds.length > 0) {
        for (const id of jobIds) {
          await db.translationJobs.update(id, {
            folderId: undefined,
            projectOrder: undefined,
          });
        }
      }

      if (project?.syncId) {
        await db.syncTombstones.put({
          syncId: project.syncId,
          kind: 'project',
          deletedAt: Date.now(),
        });
      }
      await db.projectFolders.delete(projectId);
    }
  );

  for (const jobId of deletedJobIds) {
    invalidateJobThumbnail(jobId);
  }
}

/**
 * Associates an array of translation jobs with a project folder.
 *
 * @param projectId - Target project ID.
 * @param jobIds - Array of job primary keys to adopt into this project.
 * @returns Resolves once jobs are linked.
 */
export async function addJobsToProject(projectId: number, jobIds: number[]): Promise<void> {
  if (jobIds.length === 0) return;

  const project = await db.projectFolders.get(projectId);
  if (!project) return;

  const currentMembers = await db.translationJobs.where('folderId').equals(projectId).toArray();
  let nextOrder = currentMembers.length;

  await db.transaction('rw', db.translationJobs, db.projectFolders, async () => {
    for (const jobId of jobIds) {
      await db.translationJobs.update(jobId, {
        folderId: projectId,
        projectOrder: nextOrder++,
      });
    }

    const newOrder = [...(project.customOrder || currentMembers.map((member) => member.id!)), ...jobIds];
    await db.projectFolders.update(projectId, {
      customOrder: newOrder,
      updatedAt: Date.now(),
      coverJobId: project.coverJobId ?? jobIds[0],
    });
  });
}

/**
 * Removes one or more jobs from a project, unlinking them back to unassigned library status.
 *
 * @param jobIds - Job IDs to detach.
 * @returns Resolves once jobs are unlinked.
 */
export async function removeJobsFromProject(jobIds: number[]): Promise<void> {
  if (jobIds.length === 0) return;

  const jobs = await db.translationJobs.where('id').anyOf(jobIds).toArray();
  const affectedProjects = new Set(jobs.map((job) => job.folderId).filter((folderId): folderId is number => typeof folderId === 'number'));

  await db.transaction('rw', db.translationJobs, db.projectFolders, async () => {
    for (const jobId of jobIds) {
      await db.translationJobs.update(jobId, {
        folderId: undefined,
        projectOrder: undefined,
      });
    }

    for (const projectId of affectedProjects) {
      const project = await db.projectFolders.get(projectId);
      if (project && project.customOrder) {
        const filteredOrder = project.customOrder.filter((id) => !jobIds.includes(id));
        const newCover = project.coverJobId && jobIds.includes(project.coverJobId) ? filteredOrder[0] : project.coverJobId;
        await db.projectFolders.update(projectId, {
          customOrder: filteredOrder,
          coverJobId: newCover,
          updatedAt: Date.now(),
        });
      }
    }
  });
}

/**
 * Persists custom visual ordering for pages inside a project.
 *
 * @param projectId - Target project ID.
 * @param orderedJobIds - Complete list of member job IDs in their desired sequence.
 * @returns Resolves once sequence indices are updated.
 */
export async function reorderProjectPages(projectId: number, orderedJobIds: number[]): Promise<void> {
  await db.transaction('rw', db.translationJobs, db.projectFolders, async () => {
    for (let index = 0; index < orderedJobIds.length; index++) {
      await db.translationJobs.update(orderedJobIds[index], {
        projectOrder: index,
      });
    }

    await db.projectFolders.update(projectId, {
      customOrder: orderedJobIds,
      updatedAt: Date.now(),
    });
  });
}
