import type { BubbleDetectionMode, PopupState } from './types';
import type { RenderFontPresetId } from './renderFontPresets';

/** Maximum number of user-editable pipeline presets retained in popup state. */
export const MAX_PIPELINE_PRESETS = 20;

/** Maximum number of characters accepted for a pipeline preset name. */
export const MAX_PRESET_NAME_LENGTH = 32;

/** Prefix used for generated pipeline preset identifiers. */
const PRESET_ID_PREFIX = 'preset';
/** Radix used by the fallback random identifier generator. */
const RANDOM_ID_RADIX = 36;
/** Index where random digits start after the leading `0.` in a base-36 fraction. */
const RANDOM_ID_START_INDEX = 2;

/** A complete, switchable translation pipeline configuration. */
export interface PipelinePreset {
  id: string;
  name: string;
  /** Translate Engine identifier. */
  activeEngineId: string;
  /** Image Cleaning identifier. */
  activeInpaintId: string;
  /** Manga Colorization identifier. */
  activeColorId: string;
  /** OCR Engine identifier. */
  activeOcrId: string;
  /** Layout & Bubble Fit mode. */
  bubbleMode: BubbleDetectionMode;
  /** Render Font preset identifier. */
  renderFontPresetId: RenderFontPresetId;
}

/**
 * Canonical normalizers supplied by the runtime boundary. Each normalizer returns a supported
 * value and its own canonical fallback, so pipeline preset sanitation never duplicates catalogs.
 */
export interface PipelinePresetValidators {
  /** @param value - Raw translate engine identifier. @returns Supported or fallback engine ID. */
  normalizeEngineId: (value: unknown) => string;
  /** @param value - Raw image cleaning identifier. @returns Supported or fallback ID. */
  normalizeInpaintId: (value: unknown) => string;
  /** @param value - Raw colorization identifier. @returns Supported or fallback ID. */
  normalizeColorId: (value: unknown) => string;
  /** @param value - Raw OCR identifier. @returns Supported or fallback OCR tier ID. */
  normalizeOcrId: (value: unknown) => string;
  /** @param value - Raw bubble detection mode. @returns Supported or fallback mode. */
  normalizeBubbleMode: (value: unknown) => BubbleDetectionMode;
  /** @param value - Raw render font preset identifier. @returns Supported or fallback ID. */
  normalizeRenderFontPresetId: (value: unknown) => RenderFontPresetId;
}

/**
 * Built-in starter presets. They are ordinary presets: users may edit or delete every entry.
 */
export const DEFAULT_PIPELINE_PRESETS: readonly PipelinePreset[] = [
  {
    id: 'mobile-fast',
    name: 'Mobile Fast',
    activeEngineId: 'gg-translate',
    activeInpaintId: 'simple',
    activeColorId: 'none',
    activeOcrId: 'v6-tiny',
    bubbleMode: 'heuristic',
    renderFontPresetId: 'comic',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    activeEngineId: 'gg-translate',
    activeInpaintId: 'telea',
    activeColorId: 'none',
    activeOcrId: 'v6-small',
    bubbleMode: 'heuristic',
    renderFontPresetId: 'comic',
  },
  {
    id: 'manga-quality',
    name: 'Manga Quality',
    activeEngineId: 'gg-translate',
    activeInpaintId: 'lama-manga',
    activeColorId: 'none',
    activeOcrId: 'v6-manga',
    bubbleMode: 'neural',
    renderFontPresetId: 'comic',
  },
];

/**
 * Creates independent copies of the built-in starter presets.
 *
 * @returns Fresh preset objects that callers may edit or delete independently.
 */
export function createDefaultPipelinePresets(): PipelinePreset[] {
  return DEFAULT_PIPELINE_PRESETS.map((preset) => ({ ...preset }));
}

/**
 * Trims and clamps an untrusted preset name.
 *
 * @param value - Raw name from storage or user input.
 * @returns Trimmed name bounded by {@link MAX_PRESET_NAME_LENGTH}, or an empty string.
 */
function normalizePresetName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_PRESET_NAME_LENGTH) : '';
}

/**
 * Creates a process-unique identifier for a newly captured preset.
 *
 * @returns Generated preset identifier.
 */
function createPresetId(): string {
  const randomId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(RANDOM_ID_RADIX).slice(RANDOM_ID_START_INDEX);
  return `${PRESET_ID_PREFIX}-${randomId}`;
}

/**
 * Sanitizes persisted pipeline presets at a storage boundary.
 *
 * A missing value means legacy state from before presets existed, so the starter presets are
 * returned. An explicit empty array is preserved because the user cleared every preset. Every
 * retained entry is field-normalized through the supplied validators, duplicate IDs are dropped,
 * and the result is capped at {@link MAX_PIPELINE_PRESETS}.
 *
 * @param raw - Untrusted persisted value.
 * @param validators - Runtime catalogs used to normalize each pipeline field.
 * @returns Clean presets safe to persist and render.
 */
export function normalizePipelinePresets(
  raw: unknown,
  validators: PipelinePresetValidators,
): PipelinePreset[] {
  if (raw === undefined) return createDefaultPipelinePresets();
  if (!Array.isArray(raw)) return createDefaultPipelinePresets();

  const presets: PipelinePreset[] = [];
  const seenIds = new Set<string>();

  for (const entry of raw) {
    if (presets.length >= MAX_PIPELINE_PRESETS) break;
    if (entry === null || typeof entry !== 'object') continue;

    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    presets.push({
      id,
      name: normalizePresetName(candidate.name),
      activeEngineId: validators.normalizeEngineId(candidate.activeEngineId),
      activeInpaintId: validators.normalizeInpaintId(candidate.activeInpaintId),
      activeColorId: validators.normalizeColorId(candidate.activeColorId),
      activeOcrId: validators.normalizeOcrId(candidate.activeOcrId),
      bubbleMode: validators.normalizeBubbleMode(candidate.bubbleMode),
      renderFontPresetId: validators.normalizeRenderFontPresetId(candidate.renderFontPresetId),
    });
  }

  return presets;
}

/**
 * Extracts the popup state fields controlled by a pipeline preset.
 *
 * @param preset - Preset to apply.
 * @returns The six pipeline fields to merge into popup state.
 */
export function applyPipelinePreset(
  preset: PipelinePreset,
): Pick<PopupState, 'activeEngineId' | 'activeInpaintId' | 'activeColorId' | 'activeOcrId' | 'bubbleMode' | 'renderFontPresetId'> {
  return {
    activeEngineId: preset.activeEngineId,
    activeInpaintId: preset.activeInpaintId,
    activeColorId: preset.activeColorId,
    activeOcrId: preset.activeOcrId,
    bubbleMode: preset.bubbleMode,
    renderFontPresetId: preset.renderFontPresetId,
  };
}

/**
 * Checks whether the current popup pipeline fields still match a preset.
 *
 * @param state - Current popup pipeline fields.
 * @param preset - Preset to compare.
 * @returns True when all six pipeline fields match exactly.
 */
export function matchesPipelinePreset(
  state: Pick<PopupState, 'activeEngineId' | 'activeInpaintId' | 'activeColorId' | 'activeOcrId' | 'bubbleMode' | 'renderFontPresetId'>,
  preset: PipelinePreset,
): boolean {
  return state.activeEngineId === preset.activeEngineId &&
    state.activeInpaintId === preset.activeInpaintId &&
    state.activeColorId === preset.activeColorId &&
    state.activeOcrId === preset.activeOcrId &&
    state.bubbleMode === preset.bubbleMode &&
    state.renderFontPresetId === preset.renderFontPresetId;
}

/**
 * Captures the current popup pipeline fields as an editable preset.
 *
 * @param name - User-provided preset name; trimmed and clamped.
 * @param state - Current popup pipeline fields.
 * @param id - Optional existing identifier to preserve when updating a preset.
 * @returns A new preset object.
 */
export function presetFromPopupState(
  name: string,
  state: Pick<PopupState, 'activeEngineId' | 'activeInpaintId' | 'activeColorId' | 'activeOcrId' | 'bubbleMode' | 'renderFontPresetId'>,
  id: string = createPresetId(),
): PipelinePreset {
  return {
    id,
    name: normalizePresetName(name),
    activeEngineId: state.activeEngineId,
    activeInpaintId: state.activeInpaintId,
    activeColorId: state.activeColorId ?? 'none',
    activeOcrId: state.activeOcrId,
    bubbleMode: state.bubbleMode,
    renderFontPresetId: state.renderFontPresetId,
  };
}
