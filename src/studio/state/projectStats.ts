import { db } from '../../db';

/** Aggregated progress and byte usage for one project folder. */
export interface ProjectStats {
  /** Number of member translation jobs. */
  pageCount: number;
  /** Jobs whose status is completed. */
  translatedCount: number;
  /** Jobs still queued or processing. */
  pendingCount: number;
  /** Jobs whose status is error. */
  errorCount: number;
  /** Sum of raw, translated, and baked image blob sizes. */
  totalBytes: number;
  /** Number of persisted text blocks across the project's images. */
  totalTextBlocks: number;
  /** Distinct target languages represented by member jobs. */
  languages: string[];
}

/**
 * Aggregates high-level translation metrics for a project.
 *
 * @param projectId - Primary key ID of the project.
 * @returns Aggregated progress counts, bubble statistics, and languages.
 */
export async function getProjectStats(projectId: number): Promise<ProjectStats> {
  const jobs = await db.translationJobs.where('folderId').equals(projectId).toArray();
  const jobIds = jobs.flatMap((job) => (job.id !== undefined ? [job.id] : []));

  let translatedCount = 0;
  let pendingCount = 0;
  let errorCount = 0;
  const langSet = new Set<string>();

  for (const job of jobs) {
    if (job.status === 'completed') translatedCount++;
    else if (job.status === 'error') errorCount++;
    else pendingCount++;

    if (job.targetLang) langSet.add(job.targetLang);
  }

  const images = jobIds.length > 0 ? await db.images.where('jobId').anyOf(jobIds).toArray() : [];
  let totalBytes = 0;
  const imageIds: number[] = [];

  for (const img of images) {
    if (img.id !== undefined) imageIds.push(img.id);
    if (img.rawImageBlob && typeof img.rawImageBlob.size === 'number') {
      totalBytes += img.rawImageBlob.size;
    }
    if (img.translatedImageBlob && typeof img.translatedImageBlob.size === 'number') {
      totalBytes += img.translatedImageBlob.size;
    }
    // The page delivered to the content script is stored too, and it is usually the largest of the
    // three because it is a lossless PNG of the whole page. Leaving it out made the meter report a
    // user's usage as roughly a third lower than it is.
    if (img.bakedImageBlob && typeof img.bakedImageBlob.size === 'number') {
      totalBytes += img.bakedImageBlob.size;
    }
  }

  const textBlockCount = imageIds.length > 0 ? await db.textBlocks.where('imageId').anyOf(imageIds).count() : 0;

  return {
    pageCount: jobs.length,
    translatedCount,
    pendingCount,
    errorCount,
    totalBytes,
    totalTextBlocks: textBlockCount,
    languages: Array.from(langSet),
  };
}
