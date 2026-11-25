/**
 * Single Source of Truth for PaddleOCR tiers across Kites.
 *
 * Consumed by:
 * - Frontend UI: Popup (EngineSelectionPanel) & Studio Canvas (StudioEngineSelector)
 * - Background: normalizePopupState OCR fallback
 * - Offscreen: OCR registry exhaustiveness, cache checks and engine lifecycle
 */

export interface OcrTierDescriptor {
  /** Canonical tier ID persisted in popup state and stored jobs. */
  readonly id: string;
  /** Human-readable model name shown in every selector. */
  readonly name: string;
  /** Short capability badge shown beside the name. */
  readonly tag: string;
  /** True when the tier downloads ONNX weights instead of running in pure JS. */
  readonly isModel?: boolean;
  /** Combined detection, recognition and dictionary download size. */
  readonly sizeEstimate?: string;
}

export const OCR_TIER_CATALOG = [
  { id: 'v6-small', name: 'PaddleOCR v6 Small (Default)', tag: 'Recommended', isModel: true, sizeEstimate: '~30 MB' },
  { id: 'v6-manga', name: 'PaddleOCR v6 Manga (JA/ZH)', tag: 'Manga CJK', isModel: true, sizeEstimate: '~23 MB' },
  { id: 'v6-medium', name: 'PaddleOCR v6 Medium', tag: 'Higher Accuracy', isModel: true, sizeEstimate: '~132 MB' },
  { id: 'v6-tiny', name: 'PaddleOCR v6 Tiny', tag: 'Ultra Fast', isModel: true, sizeEstimate: '~6 MB' },
  { id: 'v5-mobile', name: 'PaddleOCR v5 Mobile', tag: 'General v5', isModel: true, sizeEstimate: '~20 MB' },
  { id: 'v5-server', name: 'PaddleOCR v5 Server', tag: 'Server Grade', isModel: true, sizeEstimate: '~164 MB' },
  { id: 'v5-en-mobile', name: 'PaddleOCR v5 English', tag: 'English Tuned', isModel: true, sizeEstimate: '~12 MB' },
  { id: 'v5-ko-mobile', name: 'PaddleOCR v5 Korean', tag: 'Korean Tuned', isModel: true, sizeEstimate: '~17 MB' },
  { id: 'v5-th-mobile', name: 'PaddleOCR v5 Thai', tag: 'Thai Tuned', isModel: true, sizeEstimate: '~12 MB' },
] as const satisfies readonly OcrTierDescriptor[];

export type OcrTierId = (typeof OCR_TIER_CATALOG)[number]['id'];

/** Tier selected when stored state is empty, unknown, or holds a removed legacy ID. */
export const DEFAULT_OCR_TIER_ID: OcrTierId = 'v6-small';

/** Set of all supported OCR tier IDs, derived from the catalog. */
export const SUPPORTED_OCR_IDS = new Set<string>(
  OCR_TIER_CATALOG.map((tier) => tier.id),
);
