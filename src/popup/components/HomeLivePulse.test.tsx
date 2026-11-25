import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeLivePulse from './HomeLivePulse';
import type { ChapterZipStatus } from '../../content/chapterZip';

vi.hoisted(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

const ACTIVE_TAB_ID = 42;

/** Builds a chapter-ZIP status with the supplied page total. */
function zipStatus(total: number, overrides: Partial<ChapterZipStatus> = {}): ChapterZipStatus {
  return {
    phase: 'idle',
    busy: false,
    total,
    processed: 0,
    included: 0,
    failed: 0,
    percent: 0,
    message: '',
    errors: [],
    ...overrides,
  };
}

describe('HomeLivePulse', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Installs active-tab content messaging and the background queue response.
   *
   * @param chapterStatus - Current chapter ZIP readiness.
   * @param jobs - Queue rows returned by the background.
   * @returns The tab messaging spy.
   */
  function installChrome(
    chapterStatus: ChapterZipStatus,
    jobs: Array<Record<string, unknown>>,
  ): ReturnType<typeof vi.fn> {
    const tabsSendMessage = vi.fn().mockImplementation((_tabId: number, message: any) => {
      if (message.type === 'GET_CHAPTER_ZIP_STATUS') return Promise.resolve(chapterStatus);
      if (message.type === 'OPEN_CHAPTER_READER') return Promise.resolve({ status: 'success' });
      if (message.type === 'EXPORT_CHAPTER_ZIP') {
        return Promise.resolve(zipStatus(chapterStatus.total, { phase: 'success', percent: 100 }));
      }
      return Promise.resolve(null);
    });
    (globalThis as any).chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn().mockResolvedValue({ status: 'success', jobs }),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: ACTIVE_TAB_ID }]),
        sendMessage: tabsSendMessage,
      },
    };
    return tabsSendMessage;
  }

  /**
   * Renders the pulse and flushes the initial queue and chapter reads.
   *
   * @param onOpenBatch - Batch navigation spy.
   * @returns Nothing.
   */
  async function renderPulse(onOpenBatch = vi.fn()): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(<HomeLivePulse onOpenBatch={onOpenBatch} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('renders nothing when no queue job is active and the tab has no translations', async () => {
    installChrome(zipStatus(0), [
      { id: 1, srcUrl: 'https://example.com/page-1', status: 'completed' },
    ]);
    await renderPulse();
    expect(container.textContent).toBe('');
  });

  it('shows processing/queued/done counts for active queue work and opens Batch', async () => {
    installChrome(zipStatus(0), [
      { id: 1, srcUrl: 'a', status: 'processing' },
      { id: 2, srcUrl: 'b', status: 'processing' },
      { id: 3, srcUrl: 'c', status: 'queued' },
      { id: 4, srcUrl: 'd', status: 'completed' },
      { id: 5, srcUrl: 'e', status: 'completed' },
      { id: 6, srcUrl: 'f', status: 'completed' },
    ]);
    const onOpenBatch = vi.fn();
    await renderPulse(onOpenBatch);

    expect(container.textContent).toContain('Processing 2 · Queued 1 · Done 3');
    const queueButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Processing 2'));
    await act(async () => { queueButton?.click(); });
    expect(onOpenBatch).toHaveBeenCalledTimes(1);
  });

  it('shows Reader and ZIP actions when the active tab has translated pages', async () => {
    const tabsSendMessage = installChrome(zipStatus(12), []);
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    await renderPulse();

    expect(container.textContent).toContain('Reader (12)');
    expect(container.textContent).toContain('ZIP');

    const readerButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Reader (12)'));
    await act(async () => { readerButton?.click(); });
    expect(tabsSendMessage).toHaveBeenCalledWith(
      ACTIVE_TAB_ID,
      expect.objectContaining({ type: 'OPEN_CHAPTER_READER' }),
      { frameId: 0 },
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const zipButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'ZIP');
    await act(async () => {
      zipButton?.click();
      await Promise.resolve();
    });
    expect(tabsSendMessage).toHaveBeenCalledWith(
      ACTIVE_TAB_ID,
      expect.objectContaining({ type: 'EXPORT_CHAPTER_ZIP' }),
      { frameId: 0 },
    );

    closeSpy.mockRestore();
  });
});
