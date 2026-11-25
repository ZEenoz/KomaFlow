import { useState } from 'react';
import type { PopupState } from '../../shared/types';
import { BUBBLE_MODE_OPTIONS } from '../../shared/bubbleModes';
import {
  MAX_PRESET_NAME_LENGTH,
  presetFromPopupState,
  type PipelinePreset,
} from '../../shared/pipelinePresets';
import { INPAINT_TIER_CATALOG } from '../../shared/inpaintTiers';
import { COLOR_TIER_CATALOG } from '../../shared/colorTiers';
import { OCR_TIER_CATALOG } from '../../shared/ocrTiers';
import { CUSTOM_FONT_PREFIX, RENDER_FONT_PRESETS } from '../../shared/renderFontPresets';
import {
  CLOUD_ENGINE_ID,
  formatCloudQuota,
  type HomeEngineOption,
} from '../services/homeModelCatalog';

/** Shared height/contrast contract for every customizer control. */
const CONTROL_CLASS =
  'min-h-[38px] w-full rounded-md border border-[var(--color-dust)] border-opacity-50 bg-[var(--color-vellum)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-editorial)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-editorial)]/30';
/** Primary customizer action styling. */
const PRIMARY_ACTION_CLASS =
  'min-h-[38px] w-full rounded-md bg-[var(--color-editorial)] px-3 py-1.5 text-sm font-semibold text-[var(--color-paper)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';
/** Secondary customizer action styling. */
const SECONDARY_ACTION_CLASS =
  'min-h-[38px] rounded-md border border-[var(--color-dust)] border-opacity-40 bg-[var(--color-vellum)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] cursor-pointer';

interface HomePresetEditorProps {
  mode: 'new' | 'edit';
  state: PopupState;
  initialPreset?: PipelinePreset;
  engines: readonly HomeEngineOption[];
  onSave: (preset: PipelinePreset) => void;
  onDelete?: () => void;
  onCancel: () => void;
  onResetDefaults: () => void;
}

/** Pipeline fields covered by the customizer. */
type PresetField =
  | 'activeEngineId'
  | 'activeInpaintId'
  | 'activeColorId'
  | 'activeOcrId'
  | 'bubbleMode'
  | 'renderFontPresetId';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectField {
  key: PresetField;
  label: string;
  ariaLabel: string;
  options: readonly SelectOption[];
}

const PRESET_BUBBLE_OPTIONS: readonly SelectOption[] = BUBBLE_MODE_OPTIONS.map((mode) => ({
  value: mode.id,
  label: mode.name,
}));

/**
 * Builds the label for a preset engine missing from the current catalog.
 *
 * @param engineId - Engine id stored by the preset.
 * @returns A readable fallback label.
 */
function fallbackEngineLabel(engineId: string): string {
  return engineId === CLOUD_ENGINE_ID ? 'Cloud Shared Pool (sign in)' : engineId;
}

/**
 * Inline editor for creating or changing a complete pipeline preset.
 *
 * @param props - Starting preset, live state, engine catalog, and action callbacks.
 * @returns The preset customizer form.
 */
export default function HomePresetEditor(props: HomePresetEditorProps) {
  const { mode, state, initialPreset, engines, onSave, onDelete, onCancel, onResetDefaults } = props;
  const [draft, setDraft] = useState<PipelinePreset>(
    () => initialPreset ?? presetFromPopupState('', state),
  );

  const cloudQuota = formatCloudQuota(state.userAccount?.quotaRemaining);
  const engineOptions: SelectOption[] = engines.map((engine) => ({
    value: engine.id,
    label: engine.kind === 'cloud' ? `${engine.name} · ${cloudQuota}` : engine.name,
  }));
  for (const engineId of [draft.activeEngineId, state.activeEngineId]) {
    if (engineId && !engineOptions.some((option) => option.value === engineId)) {
      engineOptions.push({ value: engineId, label: fallbackEngineLabel(engineId) });
    }
  }

  const customFontIds = new Set(
    [draft.renderFontPresetId, initialPreset?.renderFontPresetId, state.renderFontPresetId]
      .filter((fontId): fontId is string => Boolean(fontId?.startsWith(CUSTOM_FONT_PREFIX))),
  );
  const fontOptions: SelectOption[] = [
    ...RENDER_FONT_PRESETS.map((font) => ({ value: font.id, label: font.label })),
    ...[...customFontIds].map((fontId) => ({ value: fontId, label: `Library: ${fontId.slice(CUSTOM_FONT_PREFIX.length)}` })),
  ];

  const fields: SelectField[] = [
    { key: 'activeEngineId', label: 'Translate Engine', ariaLabel: 'Preset Translate Engine', options: engineOptions },
    {
      key: 'activeInpaintId', label: 'Image Cleaning', ariaLabel: 'Preset Image Cleaning',
      options: INPAINT_TIER_CATALOG.map((tier) => ({ value: tier.id, label: tier.sizeEstimate ? `${tier.name} · ${tier.sizeEstimate}` : tier.name })),
    },
    {
      key: 'activeColorId', label: 'Manga Colorization', ariaLabel: 'Preset Manga Colorization',
      options: COLOR_TIER_CATALOG.map((tier) => ({ value: tier.id, label: tier.sizeEstimate ? `${tier.name} · ${tier.sizeEstimate}` : tier.name })),
    },
    {
      key: 'activeOcrId', label: 'OCR Engine', ariaLabel: 'Preset OCR Engine',
      options: OCR_TIER_CATALOG.map((tier) => ({ value: tier.id, label: `${tier.name} · ${tier.tag}` })),
    },
    { key: 'bubbleMode', label: 'Layout & Bubble Fit', ariaLabel: 'Preset Layout and Bubble Fit', options: PRESET_BUBBLE_OPTIONS },
    { key: 'renderFontPresetId', label: 'Render Font', ariaLabel: 'Preset Render Font', options: fontOptions },
  ];

  /**
   * Updates one select-backed pipeline field.
   *
   * @param field - Pipeline field key.
   * @param value - Selected catalog value.
   * @returns Nothing.
   */
  const handleSelect = (field: PresetField, value: string): void => {
    setDraft((previous) => ({ ...previous, [field]: value } as PipelinePreset));
  };

  /** @returns Nothing; copies every live pipeline field while keeping the typed name. */
  const handleUseCurrent = (): void => {
    setDraft((previous) => presetFromPopupState(previous.name, state, previous.id));
  };

  /** @returns Nothing; saves the validated draft through the parent. */
  const handleSave = (): void => {
    if (!draft.name.trim()) return;
    onSave(presetFromPopupState(draft.name, draft, draft.id));
  };

  return (
    <div className="mt-1 flex flex-col gap-3 rounded-md border border-[var(--color-editorial)]/30 bg-[var(--color-paper)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          {mode === 'edit' ? 'Edit Preset' : 'New Preset'}
        </h3>
        <span className="font-mono text-[10px] text-[var(--color-muted)]">
          {draft.name.length}/{MAX_PRESET_NAME_LENGTH}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Preset Name
        </span>
        <input
          type="text"
          aria-label="Preset Name"
          maxLength={MAX_PRESET_NAME_LENGTH}
          value={draft.name}
          onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
          placeholder="My manga setup"
          className={CONTROL_CLASS}
        />
      </label>

      <div className="flex flex-col gap-2.5">
        {fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {field.label}
            </span>
            <select
              aria-label={field.ariaLabel}
              value={draft[field.key]}
              onChange={(event) => handleSelect(field.key, event.target.value)}
              className={`${CONTROL_CLASS} cursor-pointer`}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <button type="button" onClick={handleUseCurrent} className={SECONDARY_ACTION_CLASS}>
        Use Current
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!draft.name.trim()}
          className={PRIMARY_ACTION_CLASS}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_ACTION_CLASS}>
          Cancel
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {mode === 'edit' && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-[36px] rounded-md px-2 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 cursor-pointer"
          >
            Delete
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={onResetDefaults}
          className="min-h-[36px] rounded-md px-2 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-editorial)] cursor-pointer"
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
}
