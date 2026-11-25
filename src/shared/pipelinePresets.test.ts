import { describe, expect, it } from 'vitest';
import {
  applyPipelinePreset,
  createDefaultPipelinePresets,
  DEFAULT_PIPELINE_PRESETS,
  MAX_PIPELINE_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  matchesPipelinePreset,
  normalizePipelinePresets,
  presetFromPopupState,
  type PipelinePreset,
  type PipelinePresetValidators,
} from './pipelinePresets';
import type { BubbleDetectionMode } from './types';

const SUPPORTED_ENGINES = new Set(['gg-translate', 'webllm-test']);
const SUPPORTED_INPAINTS = new Set(['none', 'simple', 'telea', 'lama-manga']);
const SUPPORTED_COLORS = new Set(['none', 'manga-colorization-v2']);
const SUPPORTED_OCR = new Set(['v6-small', 'v6-tiny', 'v6-manga']);
const SUPPORTED_BUBBLE_MODES = new Set<BubbleDetectionMode>(['off', 'heuristic', 'neural']);
const SUPPORTED_FONTS = new Set(['standard', 'comic']);

const validators: PipelinePresetValidators = {
  normalizeEngineId: (value) => typeof value === 'string' && SUPPORTED_ENGINES.has(value)
    ? value
    : 'gg-translate',
  normalizeInpaintId: (value) => typeof value === 'string' && SUPPORTED_INPAINTS.has(value)
    ? value
    : 'telea',
  normalizeColorId: (value) => typeof value === 'string' && SUPPORTED_COLORS.has(value)
    ? value
    : 'none',
  normalizeOcrId: (value) => typeof value === 'string' && SUPPORTED_OCR.has(value)
    ? value
    : 'v6-small',
  normalizeBubbleMode: (value) => SUPPORTED_BUBBLE_MODES.has(value as BubbleDetectionMode)
    ? value as BubbleDetectionMode
    : 'off',
  normalizeRenderFontPresetId: (value) => typeof value === 'string' && SUPPORTED_FONTS.has(value)
    ? value
    : 'standard',
};

describe('pipeline preset defaults', () => {
  it('exports the documented limits and three starter presets', () => {
    expect(MAX_PIPELINE_PRESETS).toBe(20);
    expect(MAX_PRESET_NAME_LENGTH).toBe(32);
    expect(DEFAULT_PIPELINE_PRESETS).toEqual([
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
    ]);
  });

  it('creates independent copies so editing a starter preset never mutates defaults', () => {
    const first = createDefaultPipelinePresets();
    const second = createDefaultPipelinePresets();

    first[0].name = 'Edited';
    first[0].activeOcrId = 'v6-medium';

    expect(first[0]).not.toBe(DEFAULT_PIPELINE_PRESETS[0]);
    expect(second[0]).not.toBe(first[0]);
    expect(DEFAULT_PIPELINE_PRESETS[0].name).toBe('Mobile Fast');
    expect(DEFAULT_PIPELINE_PRESETS[0].activeOcrId).toBe('v6-tiny');
  });
});

describe('normalizePipelinePresets', () => {
  it('returns fresh defaults for legacy state before presets existed', () => {
    const result = normalizePipelinePresets(undefined, validators);

    expect(result).toEqual(DEFAULT_PIPELINE_PRESETS);
    expect(result[0]).not.toBe(DEFAULT_PIPELINE_PRESETS[0]);
  });

  it('preserves an explicit empty array when the user cleared every preset', () => {
    expect(normalizePipelinePresets([], validators)).toEqual([]);
  });

  it('falls back to defaults for non-array malformed values', () => {
    expect(normalizePipelinePresets({ presets: [] }, validators)).toEqual(DEFAULT_PIPELINE_PRESETS);
    expect(normalizePipelinePresets('invalid', validators)).toEqual(DEFAULT_PIPELINE_PRESETS);
    expect(normalizePipelinePresets(null, validators)).toEqual(DEFAULT_PIPELINE_PRESETS);
  });

  it('trims and clamps names while normalizing every invalid field to its canonical fallback', () => {
    const result = normalizePipelinePresets([
      {
        id: '  custom  ',
        name: `  ${'x'.repeat(MAX_PRESET_NAME_LENGTH + 10)}  `,
        activeEngineId: 'removed-engine',
        activeInpaintId: 'removed-inpaint',
        activeColorId: 'removed-color',
        activeOcrId: 'removed-ocr',
        bubbleMode: 'removed-bubble',
        renderFontPresetId: 'removed-font',
      },
    ], validators);

    expect(result).toEqual([{
      id: 'custom',
      name: 'x'.repeat(MAX_PRESET_NAME_LENGTH),
      activeEngineId: 'gg-translate',
      activeInpaintId: 'telea',
      activeColorId: 'none',
      activeOcrId: 'v6-small',
      bubbleMode: 'off',
      renderFontPresetId: 'standard',
    }]);
  });

  it('keeps valid fields intact', () => {
    const result = normalizePipelinePresets([{
      ...DEFAULT_PIPELINE_PRESETS[2],
      name: '  Favorite  ',
    }], validators);

    expect(result).toEqual([{ ...DEFAULT_PIPELINE_PRESETS[2], name: 'Favorite' }]);
  });

  it('drops malformed entries and duplicate ids, keeping the first occurrence', () => {
    const result = normalizePipelinePresets([
      null,
      'invalid',
      { name: 'Missing id' },
      { ...DEFAULT_PIPELINE_PRESETS[0], id: '  duplicate  ', name: 'First' },
      { ...DEFAULT_PIPELINE_PRESETS[1], id: 'duplicate', name: 'Second' },
    ], validators);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('duplicate');
    expect(result[0].name).toBe('First');
  });

  it('caps retained presets at MAX_PIPELINE_PRESETS', () => {
    const entries: PipelinePreset[] = Array.from(
      { length: MAX_PIPELINE_PRESETS + 5 },
      (_, index) => ({
        ...DEFAULT_PIPELINE_PRESETS[0],
        id: `preset-${index}`,
        name: `Preset ${index}`,
      }),
    );

    const result = normalizePipelinePresets(entries, validators);

    expect(result).toHaveLength(MAX_PIPELINE_PRESETS);
    expect(result.at(-1)?.id).toBe(`preset-${MAX_PIPELINE_PRESETS - 1}`);
  });
});

describe('pipeline preset state helpers', () => {
  const preset = DEFAULT_PIPELINE_PRESETS[2];

  it('applies only the six pipeline fields from a preset', () => {
    expect(applyPipelinePreset(preset)).toEqual({
      activeEngineId: preset.activeEngineId,
      activeInpaintId: preset.activeInpaintId,
      activeColorId: preset.activeColorId,
      activeOcrId: preset.activeOcrId,
      bubbleMode: preset.bubbleMode,
      renderFontPresetId: preset.renderFontPresetId,
    });
  });

  it('matches only when all six pipeline fields still equal the preset', () => {
    const state = applyPipelinePreset(preset);

    expect(matchesPipelinePreset(state, preset)).toBe(true);
    expect(matchesPipelinePreset({ ...state, activeEngineId: 'other' }, preset)).toBe(false);
    expect(matchesPipelinePreset({ ...state, activeInpaintId: 'none' }, preset)).toBe(false);
    expect(matchesPipelinePreset({ ...state, activeColorId: 'manga-colorization-v2' }, preset)).toBe(false);
    expect(matchesPipelinePreset({ ...state, activeOcrId: 'v6-small' }, preset)).toBe(false);
    expect(matchesPipelinePreset({ ...state, bubbleMode: 'off' }, preset)).toBe(false);
    expect(matchesPipelinePreset({ ...state, renderFontPresetId: 'standard' }, preset)).toBe(false);
  });

  it('captures current state with a preserved or generated id and clamped name', () => {
    const state = applyPipelinePreset(preset);

    const preserved = presetFromPopupState('  My Preset  ', state, 'existing-id');
    expect(preserved).toEqual({ ...preset, id: 'existing-id', name: 'My Preset' });

    const first = presetFromPopupState('First', state);
    const second = presetFromPopupState('Second', state);
    expect(first.id).not.toBe(second.id);
    expect(first.id.startsWith('preset-')).toBe(true);
  });
});
