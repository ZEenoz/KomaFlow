import type { ProjectFolder, TranslationJob } from '../../db';
import type { ClearLibraryScope, LibraryStorageBreakdown } from '../state/projectStore';

/** Bytes in one mebibyte, matching the storage quota math. */
const BYTES_PER_MB = 1024 * 1024;

/** Live deletion totals shown above the confirm button. */
export interface ClearLibrarySummary {
  /** Number of project folders that will be removed. */
  projectCount: number;
  /** Number of translation pages that will be removed. */
  pageCount: number;
  /** Approximate size of the selected records, in mebibytes. */
  megabytes: number;
}

/**
 * Resolves the project and page IDs a clear request will target.
 *
 * Cascade projects add every linked member page, while scopes omit the
 * record family they do not own.
 *
 * @param projects - Known project folders.
 * @param jobs - Known translation jobs.
 * @param scope - Record family selected by the user.
 * @param mode - Wipe-all or explicit-selection mode.
 * @param selectedProjectIds - Explicit project selection used by custom mode.
 * @param selectedJobIds - Explicit page selection used by custom mode.
 * @param cascadeProjects - Whether member pages follow their project.
 * @returns Sets of targeted project and job IDs.
 */
export function resolveClearTargets(
  projects: ProjectFolder[],
  jobs: TranslationJob[],
  scope: ClearLibraryScope,
  mode: 'all' | 'custom',
  selectedProjectIds: Set<number>,
  selectedJobIds: Set<number>,
  cascadeProjects: boolean
): { projectIds: Set<number>; jobIds: Set<number> } {
  const projectIds = scope === 'pages'
    ? new Set<number>()
    : new Set(projects.flatMap((project) => {
      if (project.id === undefined) return [];
      return mode === 'all' || selectedProjectIds.has(project.id) ? [project.id] : [];
    }));
  const jobIds = scope === 'projects'
    ? new Set<number>()
    : new Set(jobs.flatMap((job) => {
      if (job.id === undefined) return [];
      return mode === 'all' || selectedJobIds.has(job.id) ? [job.id] : [];
    }));

  if (cascadeProjects && scope !== 'pages') {
    for (const job of jobs) {
      if (job.id !== undefined && job.folderId !== undefined && projectIds.has(job.folderId)) {
        jobIds.add(job.id);
      }
    }
  }

  return { projectIds, jobIds };
}

/**
 * Calculates the live project/page counts and selected storage size.
 *
 * @param projects - Known project folders.
 * @param jobs - Known translation jobs.
 * @param targets - Resolved project and page targets.
 * @param breakdown - Stored image bytes, or null while loading.
 * @returns Counts and a one-decimal megabyte total.
 */
export function summarizeClearTargets(
  projects: ProjectFolder[],
  jobs: TranslationJob[],
  targets: { projectIds: Set<number>; jobIds: Set<number> },
  breakdown: LibraryStorageBreakdown | null
): ClearLibrarySummary {
  let bytes = 0;
  const projectJobIds = new Set<number>();

  for (const project of projects) {
    if (project.id === undefined || !targets.projectIds.has(project.id)) continue;
    bytes += breakdown?.projectBytesById[project.id] ?? 0;
    for (const job of jobs) {
      if (job.id !== undefined && job.folderId === project.id) projectJobIds.add(job.id);
    }
  }

  for (const job of jobs) {
    if (job.id === undefined || !targets.jobIds.has(job.id)) continue;
    if (!projectJobIds.has(job.id)) bytes += breakdown?.jobBytesById[job.id] ?? 0;
  }

  return {
    projectCount: targets.projectIds.size,
    pageCount: targets.jobIds.size,
    megabytes: bytes / BYTES_PER_MB,
  };
}

/**
 * Formats the deletion summary line shown above the confirm action.
 *
 * @param summary - Counts and byte total to render.
 * @returns Human-readable summary such as `1 projects, 3 pages · 2.4 MB`.
 */
export function formatClearSummary(summary: ClearLibrarySummary): string {
  return `${summary.projectCount} projects, ${summary.pageCount} pages · ${summary.megabytes.toFixed(1)} MB`;
}
