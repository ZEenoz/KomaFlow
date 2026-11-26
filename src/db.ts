import Dexie, { type EntityTable } from 'dexie';
import { createSyncId, type SyncTombstone } from './shared/librarySync';
import { STORAGE_KEYS } from './shared/constants';
import type { HistoryRetentionPeriod } from './shared/types';
import type {
  FontRecord,
  ImageRecord,
  ProjectFolder,
  TextBlock,
  TranslationJob,
} from './dbTypes';

export type {
  FontRecord,
  ImageRecord,
  JobStatus,
  ProjectFolder,
  TextBlock,
  TranslationJob,
} from './dbTypes';

// Retention presets use elapsed 24-hour days; a month is a fixed 30-day window.
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default history retention window in days. */
export const JOB_RETENTION_DAYS = 7;

/** Day counts for every user-selectable retention preset; null disables auto-deletion. */
export const RETENTION_PERIOD_DAYS: Readonly<Record<HistoryRetentionPeriod, number | null>> = {
  '1day': 1,
  '1week': JOB_RETENTION_DAYS,
  '1month': 30,
  'never': null,
};

/** Tombstone discriminator written when a translation job is permanently removed. */
const JOB_TOMBSTONE_KIND = 'job' as const;

/** Shared Dexie connection for jobs, projects, page assets, fonts, and sync tombstones. */
const db = new Dexie('KitesDatabase') as Dexie & {
  translationJobs: EntityTable<TranslationJob, 'id'>;
  projectFolders: EntityTable<ProjectFolder, 'id'>;
  images: EntityTable<ImageRecord, 'id'>;
  textBlocks: EntityTable<TextBlock, 'id'>;
  fonts: EntityTable<FontRecord, 'id'>;
  syncTombstones: EntityTable<SyncTombstone, 'syncId'>;
};

db.version(4).stores({
  translationJobs: '++id, timestamp, status, folderId, srcUrl',
  projectFolders: '++id, title, timestamp, isFavorite',
  images: '++id, jobId',
  textBlocks: '++id, imageId'
});

db.version(5).stores({
  translationJobs: '++id, timestamp, status, folderId, srcUrl, projectOrder',
  projectFolders: '++id, title, timestamp, updatedAt, isFavorite',
  images: '++id, jobId',
  textBlocks: '++id, imageId'
});

db.version(6).stores({
  translationJobs: '++id, timestamp, status, folderId, srcUrl, projectOrder',
  projectFolders: '++id, title, timestamp, updatedAt, isFavorite',
  images: '++id, jobId',
  textBlocks: '++id, imageId',
  fonts: 'id, family'
});

db.version(7).stores({
  translationJobs: '++id, timestamp, status, folderId, srcUrl, projectOrder, syncId',
  projectFolders: '++id, title, timestamp, updatedAt, isFavorite, syncId',
  images: '++id, jobId',
  textBlocks: '++id, imageId',
  fonts: 'id, family',
  syncTombstones: 'syncId, kind, deletedAt'
}).upgrade(async (transaction) => {
  await transaction.table('translationJobs').toCollection().modify((job: TranslationJob) => {
    if (!job.syncId) job.syncId = createSyncId();
    if (job.updatedAt === undefined || job.updatedAt === null) job.updatedAt = job.timestamp;
  });
  await transaction.table('projectFolders').toCollection().modify((project: ProjectFolder) => {
    if (!project.syncId) project.syncId = createSyncId();
  });
});

db.translationJobs.hook('creating', (_primKey, job) => {
  if (!job.syncId) job.syncId = createSyncId();
  if (job.updatedAt === undefined || job.updatedAt === null) {
    job.updatedAt = job.timestamp ?? Date.now();
  }
});

db.projectFolders.hook('creating', (_primKey, project) => {
  if (!project.syncId) project.syncId = createSyncId();
  if (project.updatedAt === undefined || project.updatedAt === null) {
    project.updatedAt = project.timestamp ?? Date.now();
  }
});

/**
 * Deletes jobs and all associated image and text records in one transaction.
 *
 * Project covers and custom orders that still reference a deleted job are cleared and stamped
 * with a fresh `updatedAt`. Jobs that carry a `syncId` leave a tombstone so a later sync can
 * propagate the deletion.
 *
 * @param jobIds - Translation job identifiers to remove.
 * @returns Resolves after every parent, child, project-reference, and tombstone write completes.
 */
export async function deleteJobs(jobIds: number[]): Promise<void> {
  if (jobIds.length === 0) return;
  const uniqueJobIds = Array.from(new Set(jobIds));

  await db.transaction(
    'rw',
    db.translationJobs,
    db.images,
    db.textBlocks,
    db.projectFolders,
    db.syncTombstones,
    async () => {
      const jobs = await db.translationJobs.where('id').anyOf(uniqueJobIds).toArray();
      const deletedJobIds = new Set(
        jobs.flatMap((job) => (job.id === undefined ? [] : [job.id]))
      );
      const deletedAt = Date.now();

      const tombstones = jobs.flatMap((job): SyncTombstone[] => (
        job.syncId
          ? [{ syncId: job.syncId, kind: JOB_TOMBSTONE_KIND, deletedAt }]
          : []
      ));
      if (tombstones.length > 0) {
        await db.syncTombstones.bulkPut(tombstones);
      }

      const affectedProjectIds = new Set(
        jobs.flatMap((job) => (typeof job.folderId === 'number' ? [job.folderId] : []))
      );
      for (const projectId of affectedProjectIds) {
        const project = await db.projectFolders.get(projectId);
        if (!project) continue;
        const changes: Partial<ProjectFolder> = { updatedAt: deletedAt };
        if (project.customOrder !== undefined) {
          changes.customOrder = project.customOrder.filter((id) => !deletedJobIds.has(id));
        }
        if (project.coverJobId !== undefined && deletedJobIds.has(project.coverJobId)) {
          const remainingOrder = changes.customOrder ?? project.customOrder ?? [];
          changes.coverJobId = remainingOrder[0];
        }
        await db.projectFolders.update(projectId, changes);
      }

      const images = deletedJobIds.size > 0
        ? await db.images.where('jobId').anyOf(Array.from(deletedJobIds)).toArray()
        : [];
      const imageIds = images.flatMap((image) => (image.id === undefined ? [] : [image.id]));

      if (imageIds.length > 0) {
        await db.textBlocks.where('imageId').anyOf(imageIds).delete();
      }
      if (deletedJobIds.size > 0) {
        const deletedIds = Array.from(deletedJobIds);
        await db.images.where('jobId').anyOf(deletedIds).delete();
        await db.translationJobs.bulkDelete(deletedIds);
      }
    }
  );
}

/**
 * Deletes inactive translation jobs older than the specified retention window.
 * Associated image and text records are removed in the same transaction.
 * Queued, downloading, and processing jobs are never eligible for auto-deletion.
 *
 * @param retentionOrDays - Retention preset or positive finite days. When omitted,
 * reads saved settings, defaulting to seven days only when no preference exists.
 * @returns Resolves after cleanup, or skips deletion for disabled/invalid retention
 * and settings read failures; database failures are logged.
 */
export async function cleanupOldJobs(
  retentionOrDays?: number | HistoryRetentionPeriod
): Promise<void> {
  let retention: unknown = retentionOrDays;
  if (retention === undefined && typeof chrome !== 'undefined') {
    try {
      if (!chrome.storage?.local) {
        console.error('[Database] Settings storage unavailable. Skipping cleanup.');
        return;
      }
      const data: Record<string, unknown> = await chrome.storage.local.get(STORAGE_KEYS.POPUP_STATE);
      const state = data[STORAGE_KEYS.POPUP_STATE];
      if (state !== undefined && (state === null || typeof state !== 'object' || Array.isArray(state))) {
        console.error('[Database] Invalid saved settings. Skipping cleanup.');
        return;
      }
      retention = (state as { historyRetention?: unknown } | undefined)?.historyRetention;
    } catch (error) {
      // A failed read must not override a possibly saved "never" preference.
      console.error('[Database] Failed to read retention settings. Skipping cleanup:', error);
      return;
    }
  }

  let daysToKeep: number | null;
  if (retention === undefined) {
    daysToKeep = JOB_RETENTION_DAYS;
  } else if (typeof retention === 'number' && retentionOrDays !== undefined) {
    daysToKeep = retention;
  } else if (typeof retention === 'string' && Object.prototype.hasOwnProperty.call(RETENTION_PERIOD_DAYS, retention)) {
    daysToKeep = RETENTION_PERIOD_DAYS[retention as HistoryRetentionPeriod];
  } else {
    console.error('[Database] Invalid retention setting. Skipping cleanup.');
    return;
  }

  if (daysToKeep === null) {
    console.log('[Database] Auto-delete disabled ("never"). Skipping cleanup.');
    return;
  }
  if (!Number.isFinite(daysToKeep) || daysToKeep <= 0) {
    console.error('[Database] Retention days must be positive and finite. Skipping cleanup.');
    return;
  }

  const cutoffTime = Date.now() - (daysToKeep * MILLISECONDS_PER_DAY);
  try {
    console.log(`[Database] Running cleanup for jobs older than ${daysToKeep} days...`);
    // Select and cascade under one write lock so an inactive job cannot become
    // active between the eligibility check and deletion in another context.
    await db.transaction(
      'rw',
      db.translationJobs,
      db.images,
      db.textBlocks,
      db.projectFolders,
      db.syncTombstones,
      async () => {
        const oldJobKeys = await db.translationJobs.where('timestamp').below(cutoffTime)
          .filter((job) => job.folderId === undefined && (job.status === undefined || job.status === 'completed' || job.status === 'error'))
          .primaryKeys();
        const oldJobs = oldJobKeys.filter((jobId): jobId is number => jobId !== undefined);
        if (oldJobs.length > 0) {
          await deleteJobs(oldJobs);
          console.log(`[Database] Cleaned up ${oldJobs.length} old jobs.`);
        } else {
          console.log('[Database] No old jobs to clean up.');
        }
      }
    );
  } catch (error) {
    console.error('[Database] Cleanup failed:', error);
  }
}

export { db };
export default db;
