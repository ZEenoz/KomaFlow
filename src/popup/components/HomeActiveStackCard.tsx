import type { PopupState } from '../../shared/types';
import { BUBBLE_MODE_OPTIONS } from '../../shared/bubbleModes';
import { COLOR_TIER_CATALOG } from '../../shared/colorTiers';
import { INPAINT_TIER_CATALOG } from '../../shared/inpaintTiers';
import { DEFAULT_OCR_TIER_ID, OCR_TIER_CATALOG } from '../../shared/ocrTiers';
import {
  CLOUD_ENGINE_ID,
  formatCloudQuota,
  useHomeModelCatalog,
} from '../services/homeModelCatalog';

interface HomeActiveStackCardProps {
  state: PopupState;
  updateState: (updates: Partial<PopupState>) => void;
  onOpenSettings: () => void;
}

interface StatusPillProps {
  label: string;
  onClick: () => void;
}

/**
 * Renders one tappable pipeline status pill.
 *
 * @param props - Pill label and click handler.
 * @returns The status pill button.
 */
function StatusPill({ label, onClick }: StatusPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} — open Settings`}
      className="inline-flex min-h-[36px] items-center rounded-full border border-[var(--color-dust)] border-opacity-40 bg-[var(--color-paper)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-editorial)] cursor-pointer"
    >
      {label}
    </button>
  );
}

/**
 * Shows the active pipeline and lets the user switch translation engines without leaving Home.
 *
 * @param props - Live popup state, its updater, and the Settings navigation callback.
 * @returns The active-stack card.
 */
export default function HomeActiveStackCard({
  state,
  updateState,
  onOpenSettings,
}: HomeActiveStackCardProps) {
  const { engines } = useHomeModelCatalog(state);
  const cloudQuota = formatCloudQuota(state.userAccount?.quotaRemaining);
  const isCloudActive = state.activeEngineId === CLOUD_ENGINE_ID;

  const selectable = engines.filter((engine) => engine.kind !== 'local' || engine.isDownloaded);
  if (!selectable.some((engine) => engine.id === state.activeEngineId)) {
    const current = engines.find((engine) => engine.id === state.activeEngineId);
    const isSignedOutCloud = state.activeEngineId === CLOUD_ENGINE_ID;
    selectable.push(current ?? {
      id: state.activeEngineId,
      name: isSignedOutCloud ? 'Cloud Shared Pool (sign in)' : state.activeEngineId,
      kind: isSignedOutCloud ? 'cloud' : 'local',
      isDownloaded: isSignedOutCloud,
    });
  }

  const ocrLabel = OCR_TIER_CATALOG.find(
    (tier) => tier.id === (state.activeOcrId || DEFAULT_OCR_TIER_ID),
  )?.name ?? state.activeOcrId;
  const inpaintLabel = INPAINT_TIER_CATALOG.find(
    (tier) => tier.id === state.activeInpaintId,
  )?.name ?? state.activeInpaintId;
  const bubbleLabel = BUBBLE_MODE_OPTIONS.find(
    (mode) => mode.id === state.bubbleMode,
  )?.shortName ?? state.bubbleMode;
  const colorId = state.activeColorId ?? 'none';
  const colorLabel = COLOR_TIER_CATALOG.find((tier) => tier.id === colorId)?.name;
  const gpuLabel = state.webgpuSupported === true ? 'WebGPU' : 'WASM';

  return (
    <section
      aria-label="Active translation stack"
      className="flex flex-col gap-2.5 rounded-lg border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Active Stack</h2>
        {isCloudActive ? (
          <span className="rounded-full border border-[var(--color-editorial)]/30 bg-[var(--color-editorial)]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-editorial)]">
            {cloudQuota} left
          </span>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Translate Engine
        </span>
        <select
          aria-label="Translate Engine"
          value={state.activeEngineId}
          onChange={(event) => updateState({ activeEngineId: event.target.value })}
          className="min-h-[36px] w-full rounded-md border border-[var(--color-dust)] border-opacity-50 bg-[var(--color-paper)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-ink)] focus:border-[var(--color-editorial)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-editorial)]/30 cursor-pointer"
        >
          {selectable.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.kind === 'cloud' && state.userAccount?.signedIn
                ? `${engine.name} · ${cloudQuota}`
                : engine.name}
              {engine.kind === 'local' && !engine.isDownloaded ? ' · Not downloaded' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-dust)] border-opacity-20 pt-2.5">
        <StatusPill label={`OCR · ${ocrLabel}`} onClick={onOpenSettings} />
        <StatusPill label={`Inpaint · ${inpaintLabel}`} onClick={onOpenSettings} />
        <StatusPill
          label={`Layout · ${bubbleLabel}`}
          onClick={onOpenSettings}
        />
        {colorId !== 'none' ? (
          <StatusPill label={`Color · ${colorLabel ?? colorId}`} onClick={onOpenSettings} />
        ) : null}
        <StatusPill label={gpuLabel} onClick={onOpenSettings} />
      </div>
    </section>
  );
}
