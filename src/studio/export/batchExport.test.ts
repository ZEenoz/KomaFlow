import { describe, expect, it } from 'vitest';
import type { ImageRecord, TextBlock } from '../../dbTypes';
import { resolveExportPageBlob, resolveExportRasterBlob } from './batchExport';

const rawImageBlob = new Blob(['raw'], { type: 'image/png' });
const cleanPlateBlob = new Blob(['clean'], { type: 'image/png' });
const bakedPageBlob = new Blob(['baked'], { type: 'image/png' });

const page: ImageRecord = {
  jobId: 1,
  rawImageBlob,
  translatedImageBlob: cleanPlateBlob,
};

const textBlock: TextBlock = {
  imageId: 1,
  originalText: '原文',
  translatedText: 'Translated',
  posX: 0,
  posY: 0,
  width: 100,
  height: 60,
  fontSize: 16,
  fontFamily: 'sans-serif',
  color: '#000',
  lines: ['Translated'],
};

describe('batch export raster selection', () => {
  it('prefers the baked translated page over the clean plate and raw scan', async () => {
    const bakedPage: ImageRecord = { ...page, bakedImageBlob: bakedPageBlob };
    expect(resolveExportRasterBlob(bakedPage)).toBe(bakedPageBlob);
    expect(await resolveExportPageBlob(bakedPage, [textBlock])).toBe(bakedPageBlob);
  });

  it('falls back to the clean plate then the raw scan when no baked page exists', () => {
    expect(resolveExportRasterBlob(page)).toBe(cleanPlateBlob);
    expect(resolveExportRasterBlob({ ...page, translatedImageBlob: undefined })).toBe(rawImageBlob);
  });

  it('keeps the clean plate when there are no text rows to composite', async () => {
    expect(await resolveExportPageBlob(page, [])).toBe(cleanPlateBlob);
  });
});
