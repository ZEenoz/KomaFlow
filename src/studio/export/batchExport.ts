import { db } from '../../db';
import type { ImageRecord, TextBlock } from '../../dbTypes';
import { triggerBrowserDownload } from '../../shared/utils/download';

export { triggerBrowserDownload };

/**
 * Picks the best stored raster for an exported page.
 * The baked page is the exact delivered output (typography, warp, stickers), so it wins over
 * the clean inpainted plate and the raw scan.
 *
 * @param imageRecord - Persisted page record.
 * @returns Baked page when present, otherwise the clean plate, otherwise the original scan.
 */
export function resolveExportRasterBlob(imageRecord: ImageRecord): Blob {
  return imageRecord.bakedImageBlob || imageRecord.translatedImageBlob || imageRecord.rawImageBlob;
}

/**
 * Resolves the raster an archive page should ship with.
 * Older records saved before baked pages existed are composited from the clean plate plus
 * their persisted text rows; any compositing failure falls back to the clean plate so one
 * bad page never aborts a batch.
 *
 * @param imageRecord - Persisted page record.
 * @param textBlocks - Persisted dialogue rows for that page.
 * @returns Blob to write into the archive.
 */
export async function resolveExportPageBlob(
  imageRecord: ImageRecord,
  textBlocks: TextBlock[]
): Promise<Blob> {
  if (imageRecord.bakedImageBlob) return imageRecord.bakedImageBlob;
  const cleanPlate = imageRecord.translatedImageBlob;
  if (!cleanPlate || textBlocks.length === 0 || typeof document === 'undefined') {
    return resolveExportRasterBlob(imageRecord);
  }
  try {
    const [{ renderFullCompositeCanvas }, { loadImageFromBlob }, { restoreTextObject }] =
      await Promise.all([
        import('../canvas/compositeExport'),
        import('../canvas/thumbnailRenderer'),
        import('../state/persistedTextObjects'),
      ]);
    const plate = await loadImageFromBlob(cleanPlate);
    const width = plate.naturalWidth || plate.width;
    const height = plate.naturalHeight || plate.height;
    if (!width || !height) return cleanPlate;
    const background = document.createElement('canvas');
    background.width = width;
    background.height = height;
    const backgroundCtx = background.getContext('2d');
    if (!backgroundCtx) return cleanPlate;
    backgroundCtx.drawImage(plate, 0, 0);
    const composite = renderFullCompositeCanvas(
      width,
      height,
      background,
      null,
      'translated',
      [],
      textBlocks.map((block) => restoreTextObject(block))
    );
    const compositedBlob = await new Promise<Blob | null>((resolve) =>
      composite.toBlob(resolve, 'image/png'));
    return compositedBlob ?? cleanPlate;
  } catch (err) {
    console.warn('[batchExport] Failed compositing page, using clean plate:', err);
    return cleanPlate;
  }
}

/** Supported batch archive export variants. */
export type BatchExportFormat = 'images' | 'cbz' | 'psd';

/** Callback progress function reporting completed page count and total. */
export type BatchExportProgressCallback = (current: number, total: number, statusText: string) => void;

/**
 * Formats a sequential page index into a 3-digit zero-padded number (e.g. 001, 002).
 *
 * @param index - 1-based page number.
 * @returns Zero-padded string.
 */
export function formatPageNumber(index: number): string {
  return String(index).padStart(3, '0');
}

/**
 * Builds standard ComicInfo.xml metadata for CBZ comic archives.
 *
 * @param seriesTitle - Name of the comic or project.
 * @param pageCount - Total number of pages included.
 * @returns XML string.
 */
export function generateComicInfoXml(seriesTitle: string, pageCount: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>${seriesTitle}</Title>
  <Series>${seriesTitle}</Series>
  <PageCount>${pageCount}</PageCount>
  <Manga>Yes</Manga>
</ComicInfo>`;
}

/**
 * Compiles and downloads an entire manga project as a ZIP, CBZ, or layered PSD bundle.
 *
 * @param projectId - Primary key ID of the project to export.
 * @param format - Export format: 'images' (ZIP of PNGs), 'cbz' (Comic Book ZIP), or 'psd' (ZIP of PSDs).
 * @param onProgress - Optional callback for updating download progress UI.
 * @returns Resolves once download is triggered.
 */
export async function exportProjectBundle(
  projectId: number,
  format: BatchExportFormat = 'images',
  onProgress?: BatchExportProgressCallback
): Promise<void> {
  const project = await db.projectFolders.get(projectId);
  const projectTitle = project?.title || 'manga-project';

  // Read member jobs ordered by projectOrder or timestamp
  const jobs = await db.translationJobs.where('folderId').equals(projectId).sortBy('projectOrder');
  if (jobs.length === 0) {
    throw new Error('Project contains no pages to export.');
  }

  const [{ default: JSZip }, { exportPageToPsdBlob }] = await Promise.all([
    import('jszip'),
    import('./psdExport'),
  ]);

  const zip = new JSZip();
  const total = jobs.length;

  for (let i = 0; i < total; i++) {
    const job = jobs[i];
    const pageNum = formatPageNumber(i + 1);
    const progressLabel = `Processing page ${i + 1} of ${total}`;
    if (onProgress) onProgress(i + 1, total, progressLabel);

    if (!job.id) continue;
    const imageRecord = await db.images.where({ jobId: job.id }).first();
    if (!imageRecord) continue;

    if (format === 'psd') {
      const textBlocks = imageRecord.id
        ? await db.textBlocks.where({ imageId: imageRecord.id }).toArray()
        : [];
      const psdBlob = await exportPageToPsdBlob(
        imageRecord.rawImageBlob,
        imageRecord.translatedImageBlob || null,
        textBlocks
      );
      zip.file(`${pageNum}.psd`, psdBlob);
    } else {
      // images or cbz: baked page wins, then a composited clean plate, then the raw scan.
      const needsComposite = !imageRecord.bakedImageBlob
        && Boolean(imageRecord.translatedImageBlob)
        && Boolean(imageRecord.id);
      const textBlocks = needsComposite && imageRecord.id
        ? await db.textBlocks.where({ imageId: imageRecord.id }).toArray()
        : [];
      const rasterBlob = await resolveExportPageBlob(imageRecord, textBlocks);
      const extension = rasterBlob.type.includes('jpeg') ? 'jpg' : 'png';
      zip.file(`${pageNum}.${extension}`, rasterBlob);
    }
  }

  // Include ComicInfo.xml for CBZ packages
  if (format === 'cbz') {
    zip.file('ComicInfo.xml', generateComicInfoXml(projectTitle, total));
  }

  if (onProgress) onProgress(total, total, 'Compressing archive...');

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeFilename = projectTitle.replace(/[/\\?%*:|"<>]/g, '_');
  const extension = format === 'cbz' ? 'cbz' : 'zip';
  triggerBrowserDownload(zipBlob, `${safeFilename}.${extension}`);
}
