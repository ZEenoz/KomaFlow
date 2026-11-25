import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeActiveStackCard from './HomeActiveStackCard';
import { DEFAULT_POPUP_STATE, type PopupState } from '../../shared/types';

const WEB_LLM_MODEL_ID = 'Qwen3.5-0.8B-q4f16_1-MLC';

vi.hoisted(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('HomeActiveStackCard', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  /**
   * Installs the model-status RPC used by the shared Home catalog.
   *
   * @param downloadedIds - Model ids reported as cached.
   * @returns Nothing.
   */
  function installChrome(downloadedIds: readonly string[] = []): void {
    const statuses = Object.fromEntries(downloadedIds.map((id) => [id, true]));
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

  /**
   * Renders the active-stack card and pauses for the async engine catalog.
   *
   * @param state - Popup state used for the render.
   * @param updateState - State updater spy.
   * @param onOpenSettings - Settings navigation spy.
   * @returns Nothing.
   */
  async function renderCard(
    state: PopupState,
    updateState: (updates: Partial<PopupState>) => void,
    onOpenSettings: () => void,
  ): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <HomeActiveStackCard
          state={state}
          updateState={updateState}
          onOpenSettings={onOpenSettings}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('shows cloud quota and active pipeline pills, and opens Settings from a pill', async () => {
    installChrome();
    const onOpenSettings = vi.fn();
    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      activeEngineId: 'cloudflare-translate',
      userAccount: {
        provider: 'google',
        email: 'reader@example.com',
        sub: 'reader',
        signedIn: true,
        quotaRemaining: 84,
      },
      activeOcrId: 'v6-manga',
      activeInpaintId: 'lama-manga',
      activeColorId: 'manga-colorization-v2',
      bubbleMode: 'neural',
      webgpuSupported: true,
    };

    await renderCard(state, vi.fn(), onOpenSettings);

    expect(container.textContent).toContain('84/100');
    expect(container.textContent).toContain('PaddleOCR v6 Manga (JA/ZH)');
    expect(container.textContent).toContain('LaMa Manga');
    expect(container.textContent).toContain('Layout · YOLO');
    expect(container.textContent).toContain('Manga Colorizer (AI)');
    expect(container.textContent).toContain('WebGPU');

    const cloudOption = container.querySelector<HTMLOptionElement>(
      'option[value="cloudflare-translate"]',
    );
    expect(cloudOption?.textContent).toContain('84/100');

    const ocrPill = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.startsWith('OCR ·'));
    await act(async () => { ocrPill?.click(); });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('switches the translate engine directly from Home', async () => {
    installChrome([WEB_LLM_MODEL_ID]);
    const updateState = vi.fn();
    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      customApis: [{
        id: 'custom-gpt',
        provider: 'openai',
        modelName: 'gpt-4o-mini',
        apiKey: 'test-key',
      }],
    };

    await renderCard(state, updateState, vi.fn());

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Translate Engine"]');
    expect(select).not.toBeNull();
    expect(select?.value).toBe('gg-translate');
    expect(select?.textContent).toContain('openai/gpt-4o-mini');
    expect(select?.textContent).toContain(WEB_LLM_MODEL_ID);

    await act(async () => {
      if (!select) return;
      select.value = 'custom-gpt';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateState).toHaveBeenCalledWith({ activeEngineId: 'custom-gpt' });
  });
});
