import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePresetBar from './HomePresetBar';
import { DEFAULT_POPUP_STATE, type PopupState } from '../../shared/types';
import {
  applyPipelinePreset,
  createDefaultPipelinePresets,
  type PipelinePreset,
} from '../../shared/pipelinePresets';

type StateUpdater = (updates: Partial<PopupState>) => void;

vi.hoisted(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

/** Installs the successful model-status RPC. @param statuses - Download states. @returns Nothing. */
function installChrome(statuses: Record<string, boolean> = {}): void {
  (globalThis as any).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn((message: any, callback?: (response: any) => void) => {
        if (message.type === 'GET_MODEL_STATUSES') {
          callback?.({ status: 'success', statuses, downloads: {} });
        }
        return Promise.resolve();
      }),
    },
  };
}

/** Builds complete state with independent defaults. @param overrides - Field overrides. @returns State. */
function makeState(overrides: Partial<PopupState> = {}): PopupState {
  return {
    ...DEFAULT_POPUP_STATE,
    presets: createDefaultPipelinePresets(),
    ...overrides,
  };
}

describe('HomePresetBar', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
    installChrome();
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  /** Renders the bar and flushes the catalog. @param state - State. @param updateState - Spy. @param onOpenSettings - Spy. @returns Nothing. */
  async function renderBar(
    state: PopupState,
    updateState: StateUpdater,
    onOpenSettings = vi.fn(),
  ): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <HomePresetBar
          state={state}
          updateState={updateState}
          onOpenSettings={onOpenSettings}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /** Finds a button by its trimmed label. @param text - Exact label. @returns Matching button. */
  function buttonByText(text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === text);
  }

  /** Types through React's native value setter. @param input - Target input. @param value - Next value. @returns Nothing. */
  async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Changes a controlled select. @param selector - Accessible label. @param value - Next value. @returns Nothing. */
  async function selectValue(selector: string, value: string): Promise<void> {
    const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${selector}"]`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      if (!select) return;
      setter?.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /** Reads presets from the last update. @param updateState - Spy. @returns Last preset list. */
  function updatedPresets(updateState: StateUpdater): PipelinePreset[] | undefined {
    const calls = (updateState as unknown as { mock: { calls: Array<[Partial<PopupState>]> } })
      .mock.calls;
    return [...calls].reverse().find(([update]) => update.presets) ?.[0].presets;
  }

  it('applies all six pipeline fields when a preset chip is tapped', async () => {
    const updateState = vi.fn();
    const state = makeState();
    const mangaQuality = (state.presets ?? []).find((preset) => preset.name === 'Manga Quality');
    expect(mangaQuality).toBeDefined();

    await renderBar(state, updateState);
    await act(async () => { buttonByText('Manga Quality')?.click(); });

    expect(updateState).toHaveBeenCalledWith(applyPipelinePreset(mangaQuality!));
  });

  it('falls back to Google and explains the cloud sign-in requirement', async () => {
    const updateState = vi.fn();
    const cloudPreset = {
      ...createDefaultPipelinePresets()[0],
      id: 'cloud-preset',
      name: 'Cloud',
      activeEngineId: 'cloudflare-translate',
    };
    await renderBar(makeState({ presets: [cloudPreset] }), updateState);

    await act(async () => { buttonByText('Cloud')?.click(); });

    expect(updateState).toHaveBeenCalledWith({
      ...applyPipelinePreset(cloudPreset),
      activeEngineId: 'gg-translate',
    });
    expect(container.textContent).toContain('Sign in to use Cloud Shared Pool in Settings');
  });

  it('creates a new custom preset from the current pipeline fields', async () => {
    const updateState = vi.fn();
    await renderBar(makeState(), updateState);

    await act(async () => { buttonByText('+ New')?.click(); });
    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Preset Name"]');
    expect(nameInput).not.toBeNull();
    await typeInto(nameInput!, 'Night Reading');
    await act(async () => { buttonByText('Save')?.click(); });

    const presets = updatedPresets(updateState);
    const created = presets?.find((preset) => preset.name === 'Night Reading');
    expect(created).toBeDefined();
    expect(created).toMatchObject({
      activeEngineId: DEFAULT_POPUP_STATE.activeEngineId,
      activeInpaintId: DEFAULT_POPUP_STATE.activeInpaintId,
      activeColorId: DEFAULT_POPUP_STATE.activeColorId,
      activeOcrId: DEFAULT_POPUP_STATE.activeOcrId,
      bubbleMode: DEFAULT_POPUP_STATE.bubbleMode,
      renderFontPresetId: DEFAULT_POPUP_STATE.renderFontPresetId,
    });
  });

  it('edits the active preset in place', async () => {
    const balanced = createDefaultPipelinePresets()[1];
    const updateState = vi.fn();
    const state = makeState({ ...applyPipelinePreset(balanced) });

    await renderBar(state, updateState);
    await act(async () => { buttonByText('Edit')?.click(); });
    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Preset Name"]');
    await typeInto(nameInput!, 'Balanced Tuned');
    await selectValue('Preset Manga Colorization', 'manga-colorization-v2');
    await act(async () => { buttonByText('Save')?.click(); });

    const updated = updatedPresets(updateState)?.find((preset) => preset.id === balanced.id);
    expect(updated).toMatchObject({
      id: balanced.id,
      name: 'Balanced Tuned',
      activeColorId: 'manga-colorization-v2',
      activeInpaintId: balanced.activeInpaintId,
    });
  });

  it('captures every live field, including a custom library font', async () => {
    const state = makeState({
      activeEngineId: 'cloudflare-translate',
      activeInpaintId: 'simple',
      activeColorId: 'manga-colorization-v2',
      activeOcrId: 'v6-tiny',
      bubbleMode: 'neural',
      renderFontPresetId: 'font:Hand Lettering',
      userAccount: {
        provider: 'google',
        email: 'reader@example.com',
        sub: 'reader',
        signedIn: true,
        quotaRemaining: 84,
      },
    });

    await renderBar(state, vi.fn());
    await act(async () => { buttonByText('+ New')?.click(); });
    await act(async () => { buttonByText('Use Current')?.click(); });

    const valueOf = (label: string): string | undefined =>
      container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)?.value;
    expect(valueOf('Preset Translate Engine')).toBe('cloudflare-translate');
    expect(valueOf('Preset Image Cleaning')).toBe('simple');
    expect(valueOf('Preset Manga Colorization')).toBe('manga-colorization-v2');
    expect(valueOf('Preset OCR Engine')).toBe('v6-tiny');
    expect(valueOf('Preset Layout and Bubble Fit')).toBe('neural');
    expect(valueOf('Preset Render Font')).toBe('font:Hand Lettering');
  });

  it('deletes the preset being edited', async () => {
    const balanced = createDefaultPipelinePresets()[1];
    const updateState = vi.fn();
    await renderBar(makeState({ ...applyPipelinePreset(balanced) }), updateState);

    await act(async () => { buttonByText('Edit')?.click(); });
    await act(async () => { buttonByText('Delete')?.click(); });

    const presets = updatedPresets(updateState);
    expect(presets).toHaveLength(createDefaultPipelinePresets().length - 1);
    expect(presets?.some((preset) => preset.id === balanced.id)).toBe(false);
  });

  it('restores the starter presets from the customizer', async () => {
    const updateState = vi.fn();
    const custom = { ...createDefaultPipelinePresets()[0], id: 'custom-only', name: 'Custom Only' };
    await renderBar(makeState({ presets: [custom] }), updateState);

    await act(async () => { buttonByText('+ New')?.click(); });
    await act(async () => { buttonByText('Reset Defaults')?.click(); });

    expect(updatedPresets(updateState)).toEqual(createDefaultPipelinePresets());
  });

  it('shows a download notice when active preset models are missing, but stays quiet if status RPC fails', async () => {
    const quality = createDefaultPipelinePresets()[2];
    installChrome({ 'lama-manga': false, 'v6-manga': true, 'bubble-yolo': false });
    await renderBar(makeState({ ...applyPipelinePreset(quality) }), vi.fn());

    expect(container.textContent).toContain('Needs download:');
    expect(container.textContent).toContain('LaMa Manga');
    expect(container.textContent).not.toContain('PaddleOCR v6 Manga');

    // Simulate failed status RPC: must not falsely flag models as missing.
    (globalThis as any).chrome.runtime.sendMessage = vi.fn((_msg: any, callback?: (res: any) => void) => {
      callback?.({ status: 'error', error: 'offscreen unavailable' });
      return Promise.resolve();
    });
    await act(async () => { root?.unmount(); root = null; });
    await renderBar(makeState({ ...applyPipelinePreset(quality) }), vi.fn());

    expect(container.textContent).not.toContain('Needs download:');
  });
});
