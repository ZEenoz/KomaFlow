import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupOldJobs, db, deleteJobs, JOB_RETENTION_DAYS, type TranslationJob } from './db';
import { STORAGE_KEYS } from './shared/constants';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-07T12:00:00.000Z').getTime();

/**
 * Clears every Kites table so each database test starts in isolation.
 *
 * @returns Resolves after all table records are removed.
 */
async function clearDatabase(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({}) } } });
  await clearDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearDatabase();
});

describe('translation job cleanup', () => {
  it('deletes jobs older than seven days and preserves newer jobs', async () => {
    const expiredJobId = await db.translationJobs.add({
      timestamp: NOW - (JOB_RETENTION_DAYS + 1) * MILLISECONDS_PER_DAY,
      status: 'completed'
    });
    const retainedJobId = await db.translationJobs.add({
      timestamp: NOW - (JOB_RETENTION_DAYS - 1) * MILLISECONDS_PER_DAY,
      status: 'completed'
    });

    await cleanupOldJobs();

    expect(await db.translationJobs.get(expiredJobId)).toBeUndefined();
    expect(await db.translationJobs.get(retainedJobId)).toBeDefined();
  });

  it('cascades expired job deletion without touching unrelated records', async () => {
    const expiredJobId = (await db.translationJobs.add({
      timestamp: NOW - (JOB_RETENTION_DAYS + 1) * MILLISECONDS_PER_DAY,
      status: 'completed'
    }))!;
    const retainedJobId = (await db.translationJobs.add({
      timestamp: NOW,
      status: 'completed'
    }))!;
    const expiredImageId = (await db.images.add({
      jobId: expiredJobId,
      rawImageBlob: new Blob(['expired-raw']),
      translatedImageBlob: new Blob(['expired-translated'])
    }))!;
    const retainedImageId = (await db.images.add({
      jobId: retainedJobId,
      rawImageBlob: new Blob(['retained'])
    }))!;
    await db.textBlocks.bulkAdd([
      {
        imageId: expiredImageId,
        originalText: 'old',
        translatedText: 'expired',
        posX: 0,
        posY: 0,
        width: 10,
        height: 10,
        fontSize: 12,
        fontFamily: 'sans-serif',
        color: '#000000'
      },
      {
        imageId: retainedImageId,
        originalText: 'new',
        translatedText: 'retained',
        posX: 0,
        posY: 0,
        width: 10,
        height: 10,
        fontSize: 12,
        fontFamily: 'sans-serif',
        color: '#000000'
      }
    ]);

    await cleanupOldJobs();

    expect(await db.images.get(expiredImageId)).toBeUndefined();
    expect(await db.textBlocks.where({ imageId: expiredImageId }).count()).toBe(0);
    expect(await db.images.get(retainedImageId)).toBeDefined();
    expect(await db.textBlocks.where({ imageId: retainedImageId }).count()).toBe(1);
  });

  it('supports configurable retention periods including 1day, 1month, and never', async () => {
    // Job 2 days old
    const twoDayOldJobId = (await db.translationJobs.add({
      timestamp: NOW - 2 * MILLISECONDS_PER_DAY,
      status: 'completed'
    }))!;
    // Job 15 days old
    const fifteenDayOldJobId = (await db.translationJobs.add({
      timestamp: NOW - 15 * MILLISECONDS_PER_DAY,
      status: 'completed'
    }))!;
    // Job 100 days old
    const ancientJobId = (await db.translationJobs.add({
      timestamp: NOW - 100 * MILLISECONDS_PER_DAY,
      status: 'completed'
    }))!;

    // Test 'never': must not delete any jobs
    await cleanupOldJobs('never');
    expect(await db.translationJobs.get(ancientJobId)).toBeDefined();

    // Test '1month' (30 days): must delete 100-day old job, but preserve 15-day and 2-day old jobs
    await cleanupOldJobs('1month');
    expect(await db.translationJobs.get(ancientJobId)).toBeUndefined();
    expect(await db.translationJobs.get(fifteenDayOldJobId)).toBeDefined();
    expect(await db.translationJobs.get(twoDayOldJobId)).toBeDefined();

    // Test '1day': must delete 15-day and 2-day old jobs
    await cleanupOldJobs('1day');
    expect(await db.translationJobs.get(fifteenDayOldJobId)).toBeUndefined();
    expect(await db.translationJobs.get(twoDayOldJobId)).toBeUndefined();
  });

  it('never deletes queued, downloading, or processing jobs regardless of age', async () => {
    const activeStatuses: TranslationJob['status'][] = ['queued', 'downloading', 'processing'];
    const insertedIds: number[] = [];
    for (const status of activeStatuses) {
      const id = await db.translationJobs.add({
        timestamp: NOW - 365 * MILLISECONDS_PER_DAY,
        status,
      });
      insertedIds.push(id as number);
    }

    await cleanupOldJobs('1day');

    for (const id of insertedIds) {
      expect(await db.translationJobs.get(id)).toBeDefined();
    }
  });

  it('deletes only completed and error jobs that exceed the retention window', async () => {
    const oldCompleted = (await db.translationJobs.add({
      timestamp: NOW - 50 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;
    const oldError = (await db.translationJobs.add({
      timestamp: NOW - 50 * MILLISECONDS_PER_DAY,
      status: 'error',
    }))!;
    const oldProcessing = (await db.translationJobs.add({
      timestamp: NOW - 50 * MILLISECONDS_PER_DAY,
      status: 'processing',
    }))!;

    await cleanupOldJobs('1week');

    expect(await db.translationJobs.get(oldCompleted)).toBeUndefined();
    expect(await db.translationJobs.get(oldError)).toBeUndefined();
    expect(await db.translationJobs.get(oldProcessing)).toBeDefined();
  });

  it('never deletes completed jobs assigned to a project folder regardless of age', async () => {
    const projectFolderId = 42;
    const oldProjectJob = (await db.translationJobs.add({
      timestamp: NOW - 50 * MILLISECONDS_PER_DAY,
      status: 'completed',
      folderId: projectFolderId,
    }))!;
    const oldUnassignedJob = (await db.translationJobs.add({
      timestamp: NOW - 50 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;

    await cleanupOldJobs('1week');

    // Unassigned job should be deleted, project job must be preserved permanently
    expect(await db.translationJobs.get(oldUnassignedJob)).toBeUndefined();
    expect(await db.translationJobs.get(oldProjectJob)).toBeDefined();
    expect((await db.translationJobs.get(oldProjectJob))?.folderId).toBe(projectFolderId);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid numeric retention %s and deletes nothing', async (days) => {
    const jobId = (await db.translationJobs.add({
      timestamp: NOW - 365 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;

    await cleanupOldJobs(days);

    expect(await db.translationJobs.get(jobId)).toBeDefined();
  });

  it('skips deletion when chrome.storage.local.get throws (fail-closed)', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockRejectedValue(new Error('storage locked')) } },
    });

    const jobId = (await db.translationJobs.add({
      timestamp: NOW - 365 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;

    await cleanupOldJobs();

    expect(await db.translationJobs.get(jobId)).toBeDefined();
  });

  it('reads saved retention from chrome.storage when no argument given', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.POPUP_STATE]: { historyRetention: '1month' },
        }),
      }},
    });

    const recentJob = (await db.translationJobs.add({
      timestamp: NOW - 10 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;
    const oldJob = (await db.translationJobs.add({
      timestamp: NOW - 45 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;

    await cleanupOldJobs();

    expect(await db.translationJobs.get(recentJob)).toBeDefined();
    expect(await db.translationJobs.get(oldJob)).toBeUndefined();
  });

  it('defaults to seven-day retention when no argument given and storage returns empty state', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    });

    const sixDayOld = (await db.translationJobs.add({
      timestamp: NOW - 6 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;
    const eightDayOld = (await db.translationJobs.add({
      timestamp: NOW - 8 * MILLISECONDS_PER_DAY,
      status: 'completed',
    }))!;

    await cleanupOldJobs();

    expect(await db.translationJobs.get(sixDayOld)).toBeDefined();
    expect(await db.translationJobs.get(eightDayOld)).toBeUndefined();
  });
});

describe('job deletion tombstones and project references', () => {
  it('exposes the v7 syncId indexes and tombstone table', () => {
    expect(db.translationJobs.schema.indexes.some((index) => index.name === 'syncId')).toBe(true);
    expect(db.projectFolders.schema.indexes.some((index) => index.name === 'syncId')).toBe(true);
    expect(db.table('syncTombstones').schema.primKey.keyPath).toBe('syncId');
  });

  it('records tombstones and clears stale project cover and order in one pass', async () => {
    const projectId = (await db.projectFolders.add({
      title: 'Chapter 1',
      timestamp: NOW,
      isFavorite: false,
      syncId: 'project-sync',
    }))!;
    const deletedJob = (await db.translationJobs.add({
      timestamp: NOW,
      status: 'completed',
      folderId: projectId,
      syncId: 'job-sync-deleted',
    }))!;
    const keptJob = (await db.translationJobs.add({
      timestamp: NOW,
      status: 'completed',
      folderId: projectId,
      syncId: 'job-sync-kept',
    }))!;
    await db.projectFolders.update(projectId, {
      coverJobId: deletedJob,
      customOrder: [deletedJob, keptJob],
    });
    const imageId = (await db.images.add({
      jobId: deletedJob,
      rawImageBlob: new Blob(['deleted']),
    }))!;
    await db.textBlocks.add({
      imageId,
      originalText: 'old',
      translatedText: 'new',
      posX: 0,
      posY: 0,
      width: 10,
      height: 10,
      fontSize: 12,
      fontFamily: 'sans-serif',
      color: '#000000',
    });

    await deleteJobs([deletedJob]);

    expect(await db.translationJobs.get(deletedJob)).toBeUndefined();
    expect(await db.images.get(imageId)).toBeUndefined();
    expect(await db.textBlocks.where('imageId').equals(imageId).count()).toBe(0);
    expect(await db.syncTombstones.get('job-sync-deleted')).toEqual({
      syncId: 'job-sync-deleted',
      kind: 'job',
      deletedAt: NOW,
    });

    const project = await db.projectFolders.get(projectId);
    expect(project?.coverJobId).toBe(keptJob);
    expect(project?.customOrder).toEqual([keptJob]);
    expect(project?.updatedAt).toBe(NOW);
  });

  it('auto-stamps syncId and updatedAt on new jobs and tombstones them on delete', async () => {
    const jobId = (await db.translationJobs.add({
      timestamp: NOW,
      status: 'completed',
    }))!;
    const created = await db.translationJobs.get(jobId);
    expect(created?.syncId).toBeTruthy();
    expect(created?.updatedAt).toBe(NOW);

    await deleteJobs([jobId, 9999]);

    expect(await db.translationJobs.get(jobId)).toBeUndefined();
    expect(await db.syncTombstones.get(created!.syncId!)).toEqual({
      syncId: created!.syncId!,
      kind: 'job',
      deletedAt: NOW,
    });
    expect(await db.syncTombstones.count()).toBe(1);
  });

  it('skips tombstones for unknown IDs or rows missing syncId', async () => {
    const jobId = (await db.translationJobs.add({
      timestamp: NOW,
      status: 'completed',
    }))!;
    await db.translationJobs.update(jobId, { syncId: undefined });

    await deleteJobs([jobId, 9999]);

    expect(await db.translationJobs.get(jobId)).toBeUndefined();
    expect(await db.syncTombstones.count()).toBe(0);
  });
});
