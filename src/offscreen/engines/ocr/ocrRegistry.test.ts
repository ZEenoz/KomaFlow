import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OCR_TIER_ID,
  OCR_TIER_CATALOG,
  SUPPORTED_OCR_IDS,
} from '../../../shared/ocrTiers';
import { ocrRegistry, resolveOcrTier } from './ocrRegistry';

describe('OCR tier catalog', () => {
  it('registers exactly one registry entry per catalog tier', () => {
    expect(Object.keys(ocrRegistry).sort()).toEqual(
      OCR_TIER_CATALOG.map((tier) => tier.id).sort(),
    );
  });

  it('exposes every catalog id through SUPPORTED_OCR_IDS', () => {
    for (const tier of OCR_TIER_CATALOG) {
      expect(SUPPORTED_OCR_IDS.has(tier.id)).toBe(true);
    }
  });

  it('does not retain legacy v3/v4 tiers', () => {
    for (const legacyId of ['v4-mobile', 'v4-server', 'v3-mobile', 'v3-japanese-mobile']) {
      expect(SUPPORTED_OCR_IDS.has(legacyId)).toBe(false);
    }
  });
});

describe('resolveOcrTier', () => {
  it('preserves the new v6-manga tier', () => {
    expect(resolveOcrTier('v6-manga')).toBe('v6-manga');
  });

  it('preserves the Korean and Thai v5 tiers', () => {
    expect(resolveOcrTier('v5-ko-mobile')).toBe('v5-ko-mobile');
    expect(resolveOcrTier('v5-th-mobile')).toBe('v5-th-mobile');
  });

  it('falls back to the default for removed legacy tiers', () => {
    expect(resolveOcrTier('v4-mobile')).toBe(DEFAULT_OCR_TIER_ID);
    expect(resolveOcrTier('v3-japanese-mobile')).toBe(DEFAULT_OCR_TIER_ID);
    expect(resolveOcrTier('paddle-dbnet')).toBe(DEFAULT_OCR_TIER_ID);
  });

  it('falls back to the default for missing and unknown values', () => {
    expect(resolveOcrTier()).toBe(DEFAULT_OCR_TIER_ID);
    expect(resolveOcrTier('not-a-tier')).toBe(DEFAULT_OCR_TIER_ID);
  });
});

describe('v6-manga registry entry', () => {
  it('uses literal HuggingFace weights and manga DB post-processing', () => {
    expect(ocrRegistry['v6-manga']).toMatchObject({
      detectionUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/det/manga_det.onnx',
      recognitionUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/rec/manga_rec.onnx',
      charactersDictionaryUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/ppocrv6_dict.txt',
      detectionThreshold: 0.15,
      unclipRatio: 1.5,
      boxThreshold: 0.25,
    });
  });
});

describe('v5 language registry entries', () => {
  it('points Korean weights at the korean v5 paths', () => {
    expect(ocrRegistry['v5-ko-mobile'].recognitionUrl).toContain(
      '/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx',
    );
    expect(ocrRegistry['v5-ko-mobile'].charactersDictionaryUrl).toContain(
      '/recognition/multi/korean/v5/ppocrv5_korean_dict.txt',
    );
  });

  it('points Thai weights at the th v5 paths', () => {
    expect(ocrRegistry['v5-th-mobile'].recognitionUrl).toContain(
      '/recognition/multi/th/v5/th_PP-OCRv5_mobile_rec_infer.onnx',
    );
    expect(ocrRegistry['v5-th-mobile'].charactersDictionaryUrl).toContain(
      '/recognition/multi/th/v5/ppocrv5_th_dict.txt',
    );
  });
});
