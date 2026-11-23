import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POPUP_STATE, type PopupState } from '../../shared/types';
import EngineSelectionPanel, { orderChangedCatalog, type Engine } from './EngineSelectionPanel';

const WEB_LLM_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

vi.hoisted(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as any).mockImplementation((message: any, callback?: (response: any) => void) => {
    if (message.type === 'GET_ACTIVE_DOWNLOADS') {
      callback?.({ status: 'success', downloads: {} });
      return undefined;
    }
    if (message.type === 'GET_MODEL_STATUSES') {
      callback?.({ status: 'success', statuses: {}, downloads: {} });
      return undefined;
    }
    if (message.type === 'START_MODEL_DOWNLOAD') {
      return Promise.resolve({ status: 'error', error: 'network unavailable' });
    }
    return undefined;
  });
});

describe('orderChangedCatalog', () => {
  it('pins the default, then groups downloaded engines in lexical order', () => {
    const engines: Engine[] = [
      { id: 'pending', name: 'Beta', type: 'local', isDownloaded: false },
      { id: 'downloaded-z', name: 'Zulu', type: 'local', isDownloaded: true },
      { id: 'default', name: 'Google Translate', type: 'api', isDownloaded: true },
      { id: 'downloaded-a', name: 'Alpha', type: 'local', isDownloaded: true },
    ];

    expect(orderChangedCatalog(engines, 'default').map(engine => engine.id)).toEqual([
      'default',
      'downloaded-a',
      'downloaded-z',
      'pending',
    ]);
    expect(engines.map(engine => engine.id)).toEqual(['pending', 'downloaded-z', 'default', 'downloaded-a']);
  });

  it('orders translation catalog: defaults -> installed -> best-of-size -> other models', () => {
    const engines: Engine[] = [
      { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'gemma-2-2b', type: 'local', isDownloaded: false },
      { id: 'Qwen3.5-9B-q4f16_1-MLC', name: 'Qwen3.5-9B', type: 'local', isDownloaded: false },
      { id: 'custom-gpt', name: 'openai/gpt-4o', type: 'custom', isDownloaded: true },
      { id: 'cloudflare-translate', name: 'Cloud Shared Pool', type: 'api', isDownloaded: true },
      { id: 'Qwen3.5-0.8B-q4f16_1-MLC', name: 'Qwen3.5-0.8B', type: 'local', isDownloaded: false },
      { id: 'gg-translate', name: 'Google Translate', type: 'api', isDownloaded: true },
      { id: 'Llama-3.1-70B-Instruct-q3f16_1-MLC', name: 'Llama-3.1-70B', type: 'local', isDownloaded: false },
      { id: 'Qwen3.5-4B-q4f16_1-MLC', name: 'Qwen3.5-4B', type: 'local', isDownloaded: false },
      { id: 'Qwen3.5-2B-q4f16_1-MLC', name: 'Qwen3.5-2B', type: 'local', isDownloaded: false },
    ];

    const ordered = orderChangedCatalog(engines, 'gg-translate');
    expect(ordered.map(e => e.id)).toEqual([
      'gg-translate',
      'cloudflare-translate',
      'custom-gpt',
      'Qwen3.5-0.8B-q4f16_1-MLC',
      'Qwen3.5-4B-q4f16_1-MLC',
      'Qwen3.5-2B-q4f16_1-MLC',
      'Qwen3.5-9B-q4f16_1-MLC',
      'gemma-2-2b-it-q4f16_1-MLC',
      'Llama-3.1-70B-Instruct-q3f16_1-MLC',
    ]);
  });

  it('keeps non-translation drops in default -> installed -> alphabetical order', () => {
    const engines: Engine[] = [
      { id: 'lama-manga', name: 'LaMa Manga', type: 'local', isDownloaded: true },
      { id: 'aotgan', name: 'AOT-GAN', type: 'local', isDownloaded: false },
      { id: 'none', name: 'None (Bypass)', type: 'local', isDownloaded: true },
      { id: 'simple', name: 'Simple Fill', type: 'local', isDownloaded: true },
      { id: 'telea', name: 'Telea Diffusion', type: 'local', isDownloaded: true },
    ];

    expect(orderChangedCatalog(engines, 'simple').map((engine) => engine.id)).toEqual([
      'simple',
      'lama-manga',
      'none',
      'telea',
      'aotgan',
    ]);
  });
});

describe('WebLLM download control', () => {
  it('uses a clickable sibling button, routes once, and re-enables after rejected acknowledgement', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      webgpuSupported: true,
      webgpuMaster: true,
      webgpuOverrides: { ...DEFAULT_POPUP_STATE.webgpuOverrides, llm: true },
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={vi.fn()} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
    });

    const downloadButton = container.querySelector<HTMLButtonElement>(`button[aria-label="Download ${WEB_LLM_MODEL_ID}"]`);
    expect(downloadButton).not.toBeNull();
    const rowButton = downloadButton?.previousElementSibling as HTMLButtonElement | null;
    expect(rowButton?.tagName).toBe('BUTTON');
    expect(rowButton?.disabled).toBe(true);
    expect(rowButton?.contains(downloadButton ?? null)).toBe(false);
    expect(downloadButton?.disabled).toBe(false);

    await act(async () => {
      downloadButton?.click();
      await Promise.resolve();
    });

    const downloadCalls = (chrome.runtime.sendMessage as any).mock.calls.filter(([message]: [any]) => message.type === 'START_MODEL_DOWNLOAD');
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0][0]).toEqual({
      type: 'START_MODEL_DOWNLOAD',
      target: 'background',
      source: 'popup',
      request: true,
      payload: { modelId: WEB_LLM_MODEL_ID, category: 'translation' },
    });
    expect(downloadButton?.disabled).toBe(false);
    expect(container.textContent).toContain('Failed: network unavailable');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('deletes an installed WebGPU model and resets the selection to Google Translate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();
    (chrome.runtime.sendMessage as any).mockImplementation((message: any, callback?: (response: any) => void) => {
      if (message.type === 'GET_ACTIVE_DOWNLOADS') {
        callback?.({ status: 'success', downloads: {} });
        return undefined;
      }
      if (message.type === 'GET_MODEL_STATUSES') {
        callback?.({ status: 'success', statuses: { [WEB_LLM_MODEL_ID]: true }, downloads: {} });
        return undefined;
      }
      if (message.type === 'DELETE_MODEL') {
        return Promise.resolve({ status: 'success', removedEntries: 7, alsoRemoved: [] });
      }
      return undefined;
    });

    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      activeEngineId: WEB_LLM_MODEL_ID,
      fallbackChain: [WEB_LLM_MODEL_ID, 'gg-translate'],
      webgpuSupported: true,
      webgpuMaster: true,
      webgpuOverrides: { ...DEFAULT_POPUP_STATE.webgpuOverrides, llm: true },
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
    });

    const deleteButton = container.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${WEB_LLM_MODEL_ID}"]`);
    expect(deleteButton).not.toBeNull();

    await act(async () => {
      deleteButton?.click();
    });
    const confirmDelete = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Delete');
    expect(confirmDelete).toBeDefined();

    await act(async () => {
      confirmDelete?.click();
      await Promise.resolve();
    });

    const deleteCalls = (chrome.runtime.sendMessage as any).mock.calls.filter(([message]: [any]) => message.type === 'DELETE_MODEL');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0]).toEqual({
      type: 'DELETE_MODEL',
      target: 'background',
      source: 'popup',
      request: true,
      payload: { modelId: WEB_LLM_MODEL_ID },
    });
    // A deleted model must not stay selected, or the next browser start would download it again.
    expect(updateState).toHaveBeenCalledWith({ activeEngineId: 'gg-translate', fallbackChain: ['gg-translate'] });
    expect(container.textContent).toContain('Download it again to use it.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Layout & Bubble Fit selector and updates bubbleMode state', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();

    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      bubbleMode: 'heuristic',
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
    });

    const bubbleButton = container.querySelector<HTMLButtonElement>('button[aria-label="Layout and Bubble Fit"]');
    expect(bubbleButton).not.toBeNull();
    expect(bubbleButton?.textContent).toContain('Heuristic');

    await act(async () => {
      bubbleButton?.click();
    });

    const bubbleDropdown = bubbleButton?.closest('.relative');
    const offButton = Array.from(bubbleDropdown?.querySelectorAll('button') || []).find((b) => b.textContent?.includes('Disabled'));
    expect(offButton).toBeDefined();

    await act(async () => {
      offButton?.click();
    });

    expect(updateState).toHaveBeenCalledWith({ bubbleMode: 'off' });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('triggers on-demand download for Neural YOLO when uninstalled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();

    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      bubbleMode: 'heuristic',
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
    });

    const bubbleButton = container.querySelector<HTMLButtonElement>('button[aria-label="Layout and Bubble Fit"]');
    await act(async () => {
      bubbleButton?.click();
    });

    const downloadButton = container.querySelector<HTMLElement>('div[title="Download model"]');
    expect(downloadButton).not.toBeNull();

    await act(async () => {
      downloadButton?.click();
      await Promise.resolve();
    });

    const downloadCalls = (chrome.runtime.sendMessage as any).mock.calls.filter(([message]: [any]) =>
      message.type === 'START_MODEL_DOWNLOAD' && message.payload?.modelId === 'bubble-yolo'
    );
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0][0].payload).toEqual({
      modelId: 'bubble-yolo',
      category: 'bubble',
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders unified YOLO (AI) option in dropdown', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();

    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      bubbleMode: 'off',
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
    });

    const bubbleButton = container.querySelector<HTMLButtonElement>('button[aria-label="Layout and Bubble Fit"]');
    await act(async () => {
      bubbleButton?.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const yoloBtn = buttons.find((b) => b.textContent?.includes('YOLO (AI)'));

    expect(yoloBtn).toBeDefined();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Manga Colorization selector and queues download when uninstalled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();

    const state: PopupState = {
      ...DEFAULT_POPUP_STATE,
      activeColorId: 'none',
    };

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
    });

    const colorHeading = Array.from(container.querySelectorAll('h2')).find(h => h.textContent === 'Manga Colorization');
    expect(colorHeading).toBeDefined();

    const colorContainer = colorHeading?.closest('.flex.flex-col');
    const colorDropdownButton = colorContainer?.querySelector<HTMLButtonElement>('button');
    expect(colorDropdownButton).not.toBeNull();
    expect(colorDropdownButton?.textContent).toContain('Disabled');

    await act(async () => {
      colorDropdownButton?.click();
    });

    const menu = colorContainer?.querySelector('.shadow-sm');
    const colorButtons = Array.from(menu?.querySelectorAll('button') || []);
    const neuralColorBtn = colorButtons.find((b) => b.textContent?.includes('Manga Colorizer (AI)'));
    expect(neuralColorBtn).toBeDefined();

    const downloadIcon = neuralColorBtn?.querySelector('svg');
    const downloadButton = downloadIcon?.closest('div');
    expect(downloadButton).not.toBeNull();

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const downloadCalls = (chrome.runtime.sendMessage as any).mock.calls.filter(([message]: [any]) => message.type === 'START_MODEL_DOWNLOAD');
    expect(downloadCalls.some(([message]: [any]) =>
      message.payload?.modelId === 'manga-colorization-v2' && message.payload?.category === 'color'
    )).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe('Text Rendering Options min font size', () => {
  /**
   * Renders the panel, opens the Text Rendering Options section and returns its handles.
   *
   * @param state - Popup state to render.
   * @returns Container, React root, updateState spy and the section's inputs.
   */
  async function renderFontOptions(state: PopupState) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const updateState = vi.fn();

    await act(async () => {
      root.render(<EngineSelectionPanel state={state} updateState={updateState} />);
    });

    const optionsButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('Text Rendering Options')
    );
    expect(optionsButton).toBeDefined();
    await act(async () => {
      optionsButton?.click();
    });

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
    const numberInput = container.querySelector<HTMLInputElement>('input[type="number"]');
    return { container, root, updateState, slider, numberInput };
  }

  /**
   * Writes a value into a controlled input through the native setter so React sees the change.
   *
   * @param input - Target input element.
   * @param value - Raw text to place in the input.
   * @returns A promise resolved after React flushed the change.
   */
  async function typeIntoInput(input: HTMLInputElement, value: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Removes a rendered panel from the document. */
  async function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }

  it('derives slider bounds from the shared range and defaults to 6px', async () => {
    const { container, root, slider, numberInput } = await renderFontOptions({ ...DEFAULT_POPUP_STATE });

    expect(slider?.min).toBe('4');
    expect(slider?.max).toBe('48');
    expect(slider?.value).toBe('6');
    expect(numberInput?.value).toBe('6');
    expect(numberInput?.min).toBe('4');
    expect(numberInput?.max).toBe('48');
    const customBadge = Array.from(container.querySelectorAll('span')).find((span) => span.textContent === 'Custom');
    expect(customBadge).toBeUndefined();

    await cleanup(root, container);
  });

  it('commits an exact px typed into the numeric input', async () => {
    const { root, container, updateState, numberInput } = await renderFontOptions({ ...DEFAULT_POPUP_STATE });
    expect(numberInput).not.toBeNull();

    await typeIntoInput(numberInput as HTMLInputElement, '40');

    expect(updateState).toHaveBeenCalledWith({ renderFontMinSize: 40 });

    await cleanup(root, container);
  });

  it('clamps a typed value above the shared max on blur', async () => {
    const { root, container, updateState, numberInput } = await renderFontOptions({ ...DEFAULT_POPUP_STATE });
    expect(numberInput).not.toBeNull();

    await typeIntoInput(numberInput as HTMLInputElement, '99');
    expect(updateState).not.toHaveBeenCalled();

    await act(async () => {
      numberInput?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(updateState).toHaveBeenCalledWith({ renderFontMinSize: 48 });

    await cleanup(root, container);
  });

  it('shows the Custom badge for a non-default floor', async () => {
    const { root, container } = await renderFontOptions({ ...DEFAULT_POPUP_STATE, renderFontMinSize: 40 });

    const customBadge = Array.from(container.querySelectorAll('span')).find((span) => span.textContent === 'Custom');
    expect(customBadge).toBeDefined();

    await cleanup(root, container);
  });
});
