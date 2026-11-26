import { db } from '../../db';
import type { ImageRecord } from '../../db';

/** Per-project and per-job byte totals calculated from stored image blobs. */
export interface LibraryStorageBreakdown {
  /** Sum of every stored raw, translated, and baked image blob. */
  totalBytes: number;
  /** Image bytes attributed to each project through its member jobs. */
  projectBytesById: Record<number, number>;
  /** Image bytes attributed to each job. */
  jobBytesById: Record<number, number>;
}

/** Image blob fields that count toward stored page data. */
const IMAGE_BLOB_FIELDS = ['rawImageBlob', 'translatedImageBlob', 'bakedImageBlob'] as const;

/**
 * Sums the raw, translated, and baked blob sizes stored on an image record.
 *
 * @param image - Image record to measure.
 * @returns Byte total for the three persisted page representations.
 */
export function imageBytes(image: ImageRecord): number {
  let total = 0;
  for (const field of IMAGE_BLOB_FIELDS) {
    const blob = image[field];
    if (blob && typeof blob.size === 'number') total += blob.size;
  }
  return total;
}

/**
 * Calculates how many stored image bytes belong to each project and job.
 *
 * @returns Total page bytes plus per-project and per-job attribution maps.
 */
export async function getLibraryStorageBreakdown(): Promise<LibraryStorageBreakdown> {
  const [images, jobs] = await Promise.all([
    db.images.toArray(),
    db.translationJobs.toArray(),
  ]);
  const projectIdByJobId = new Map<number, number>();
  for (const job of jobs) {
    if (job.id !== undefined && job.folderId !== undefined) {
      projectIdByJobId.set(job.id, job.folderId);
    }
  }

  const projectBytesById: Record<number, number> = {};
  const jobBytesById: Record<number, number> = {};
  let totalBytes = 0;

  for (const image of images) {
    const bytes = imageBytes(image);
    totalBytes += bytes;
    jobBytesById[image.jobId] = (jobBytesById[image.jobId] ?? 0) + bytes;
    const projectId = projectIdByJobId.get(image.jobId);
    if (projectId !== undefined) {
      projectBytesById[projectId] = (projectBytesById[projectId] ?? 0) + bytes;
    }
  }

  return { totalBytes, projectBytesById, jobBytesById };
}
