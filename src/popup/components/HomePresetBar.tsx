import { useMemo, useState } from 'react';
import type { PopupState } from '../../shared/types';
import {
  applyPipelinePreset,
  createDefaultPipelinePresets,
  matchesPipelinePreset,
  MAX_PIPELINE_PRESETS,
  type PipelinePreset,
} from '../../shared/pipelinePresets';
import {
  CLOUD_ENGINE_ID,
  GOOGLE_ENGINE_ID,
  useHomeModelCatalog,
} from '../services/homeModelCatalog';
import { findMissingPresetModels } from '../services/homePresetModels';
import HomePresetEditor from './HomePresetEditor';

/** Compact header action sizing that stays tappable on mobile browsers. */
const HEADER_ACTION_CLASS =
  'inline-flex min-h-[36px] items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-editorial)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

interface HomePresetBarProps {
  state: PopupState;
  updateState: (updates: Partial<PopupState>) => void;
  onOpenSettings: () => void;
}

/** Which customizer form is open, if any. */
type EditorState =
  | { mode: 'new' }
  | { mode: 'edit'; preset: PipelinePreset };

/**
 * Renders the user-owned pipeline preset strip and its inline customizer.
 *
 * @param props - Live popup state, updater, and Settings navigation callback.
 * @returns The preset bar.
 */
export default function HomePresetBar({
  state,
  updateState,
  onOpenSettings,
}: HomePresetBarProps) {
  const presets = state.presets ?? [];
  const activePreset = presets.find((preset) => matchesPipelinePreset(state, preset));
  const { engines, statuses, statusesLoaded } = useHomeModelCatalog(state);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [cloudHint, setCloudHint] = useState(false);

  const missingModels = useMemo(
    () => activePreset && statusesLoaded
      ? findMissingPresetModels(activePreset, engines, statuses)
      : [],
    [activePreset, engines, statuses, statusesLoaded],
  );
  const activeCloudNeedsSignIn =
    activePreset?.activeEngineId === CLOUD_ENGINE_ID && !state.userAccount?.signedIn;

  /**
   * Applies all six pipeline fields from a preset, with a safe Google fallback for signed-out cloud.
   *
   * @param preset - Preset chosen by the user.
   * @returns Nothing.
   */
  const handleApplyPreset = (preset: PipelinePreset): void => {
    const needsCloudSignIn =
      preset.activeEngineId === CLOUD_ENGINE_ID && !state.userAccount?.signedIn;
    const updates = applyPipelinePreset(preset);
    if (needsCloudSignIn) {
      updateState({ ...updates, activeEngineId: GOOGLE_ENGINE_ID });
      setCloudHint(true);
    } else {
      updateState(updates);
      setCloudHint(false);
    }
    setEditor(null);
  };

  /** @returns Nothing; toggles a new-preset form. */
  const handleToggleNew = (): void => {
    setCloudHint(false);
    setEditor((previous) => previous?.mode === 'new' ? null : { mode: 'new' });
  };

  /** @returns Nothing; opens or closes the active preset for editing. */
  const handleToggleEdit = (): void => {
    if (!activePreset) return;
    setCloudHint(false);
    setEditor((previous) => previous?.mode === 'edit' && previous.preset.id === activePreset.id
      ? null
      : { mode: 'edit', preset: activePreset });
  };

  /**
   * Persists a new or updated preset.
   *
   * @param saved - Complete preset from the customizer.
   * @returns Nothing.
   */
  const handleSave = (saved: PipelinePreset): void => {
    if (!editor) return;
    const next = editor.mode === 'edit'
      ? presets.map((preset) => preset.id === editor.preset.id ? saved : preset)
      : [...presets, saved].slice(0, MAX_PIPELINE_PRESETS);
    updateState({ presets: next });
    setEditor(null);
  };

  /** @returns Nothing; deletes the preset currently being edited. */
  const handleDelete = (): void => {
    if (editor?.mode !== 'edit') return;
    updateState({ presets: presets.filter((preset) => preset.id !== editor.preset.id) });
    setEditor(null);
  };

  /** @returns Nothing; restores the three starter presets. */
  const handleResetDefaults = (): void => {
    updateState({ presets: createDefaultPipelinePresets() });
    setEditor(null);
    setCloudHint(false);
  };

  return (
    <section
      aria-label="Pipeline presets"
      className="flex flex-col gap-2 rounded-lg border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Presets</h2>
          {activePreset ? (
            <span className="truncate text-[10px] text-[var(--color-muted)]">{activePreset.name}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleToggleNew}
            disabled={presets.length >= MAX_PIPELINE_PRESETS}
            title={presets.length >= MAX_PIPELINE_PRESETS
              ? `Preset limit reached (${MAX_PIPELINE_PRESETS})`
              : 'Create a preset from any pipeline setup'}
            className={`${HEADER_ACTION_CLASS} text-[var(--color-editorial)] hover:bg-[var(--color-editorial)]/10`}
          >
            + New
          </button>
          <button
            type="button"
            onClick={handleToggleEdit}
            disabled={!activePreset}
            title={activePreset ? `Edit ${activePreset.name}` : 'Apply a preset to edit it'}
            className={`${HEADER_ACTION_CLASS} text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper)]`}
          >
            Edit
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Available presets"
        className="flex gap-1.5 overflow-x-auto pb-0.5"
      >
        {presets.length > 0 ? presets.map((preset) => {
          const isActive = preset.id === activePreset?.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleApplyPreset(preset)}
              title={`Apply ${preset.name}`}
              className={`min-h-[34px] shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-editorial)] cursor-pointer ${
                isActive
                  ? 'border-[var(--color-editorial)] bg-[var(--color-editorial)] text-[var(--color-paper)] shadow-sm'
                  : 'border-[var(--color-dust)] border-opacity-50 bg-[var(--color-paper)] text-[var(--color-ink)] hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)]'
              }`}
            >
              {preset.name || 'Untitled preset'}
            </button>
          );
        }) : (
          <p className="py-1 text-xs text-[var(--color-muted)]">
            No presets yet. Create one with + New.
          </p>
        )}
      </div>

      {cloudHint || activeCloudNeedsSignIn ? (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-[var(--color-ink)]"
        >
          <span>
            Sign in to use Cloud Shared Pool in Settings. Google Translate stays the fallback.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[36px] shrink-0 rounded-md px-1.5 font-semibold text-[var(--color-editorial)] underline-offset-2 hover:underline cursor-pointer"
          >
            Settings
          </button>
        </div>
      ) : null}

      {!editor && missingModels.length > 0 ? (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md border border-[var(--color-editorial)]/30 bg-[var(--color-editorial)]/10 px-2.5 py-2 text-[11px] leading-snug text-[var(--color-ink)]"
        >
          <span className="min-w-0">
            Needs download: {missingModels.map((model) => model.label).join(', ')}.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[36px] shrink-0 rounded-md px-1.5 font-semibold text-[var(--color-editorial)] underline-offset-2 hover:underline cursor-pointer"
          >
            Download in Settings
          </button>
        </div>
      ) : null}

      {editor ? (
        <HomePresetEditor
          key={editor.mode === 'edit' ? editor.preset.id : 'new-preset'}
          mode={editor.mode}
          state={state}
          initialPreset={editor.mode === 'edit' ? editor.preset : undefined}
          engines={engines}
          onSave={handleSave}
          onDelete={editor.mode === 'edit' ? handleDelete : undefined}
          onCancel={() => setEditor(null)}
          onResetDefaults={handleResetDefaults}
        />
      ) : null}
    </section>
  );
}
