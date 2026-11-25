import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeQuickActions from './HomeQuickActions';

vi.hoisted(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

/** Installs mocked active-tab chrome messaging for HomeQuickActions tests. */
function installTabChrome(total: number, initialOriginal = false) {
  let showOriginal = initialOriginal;
  const sendMessage = vi.fn(async (_tabId: number, message: { type: string }) => {
    if (message.type === 'GET_CHAPTER_ZIP_STATUS') {
      return { total, busy: false, phase: 'idle', percent: 0 };
    }
    if (message.type === 'GET_PAGE_ORIGINAL_STATE') {
      return { status: 'success', hasTranslated: total > 0, showOriginal };
    }
    if (message.type === 'TOGGLE_PAGE_ORIGINALS') {
      showOriginal = !showOriginal;
      return { status: 'success', hasTranslated: total > 0, showOriginal };
    }
    return { status: 'success' };
  });

  (globalThis as any).chrome = {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 42 }]),
      sendMessage,
    },
  };
  return { sendMessage };
}

describe('HomeQuickActions', () => {
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
    vi.restoreAllMocks();
  });

  it('triggers Scan Chapter and Crop Area and hides Show Original when no pages are translated', async () => {
    const { sendMessage } = installTabChrome(0);
    const onOpenBatch = vi.fn();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    root = createRoot(container);
    await act(async () => {
      root!.render(<HomeQuickActions onOpenBatch={onOpenBatch} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const scanBtn = buttons.find((btn) => btn.textContent?.includes('Scan Chapter'));
    const cropBtn = buttons.find((btn) => btn.textContent?.includes('Crop Area'));

    expect(scanBtn).toBeDefined();
    expect(cropBtn).toBeDefined();
    expect(container.textContent).not.toContain('Show Original');

    await act(async () => { scanBtn!.click(); });
    expect(onOpenBatch).toHaveBeenCalledTimes(1);

    await act(async () => { cropBtn!.click(); });
    expect(sendMessage).toHaveBeenCalledWith(42, { type: 'START_AREA_SELECTION' });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('shows and toggles Show Original / Show Translated when translated pages exist', async () => {
    const { sendMessage } = installTabChrome(5, false);

    root = createRoot(container);
    await act(async () => {
      root!.render(<HomeQuickActions onOpenBatch={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const toggleBtn = () =>
      Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('Show Original') || btn.textContent?.includes('Show Translated'),
      );

    expect(toggleBtn()?.textContent).toContain('Show Original');
    await act(async () => { toggleBtn()!.click(); });
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ type: 'TOGGLE_PAGE_ORIGINALS' }),
      { frameId: 0 },
    );
    expect(toggleBtn()?.textContent).toContain('Show Translated');
  });
});
