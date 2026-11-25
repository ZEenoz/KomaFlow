// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BatchScanPanel from './BatchScanPanel';
import { DEFAULT_POPUP_STATE } from '../../shared/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Popup state updater stub: the panel only writes through it when the language pair changes. */
const updateStateStub = () => {};

/**
 * Renders the panel with the props the popup now passes in.
 *
 * @param targetLang - Target language the panel queues pages into.
 * @returns The panel element.
 */
const renderPanel = (targetLang = 'en') => (
  <BatchScanPanel
    state={{ ...DEFAULT_POPUP_STATE, sourceLang: 'en', targetLang }}
    updateState={updateStateStub}
  />
);

/**
 * Reads each gallery card's text, including its overlay badge and footer status.
 *
 * @param container - Rendered panel root.
 * @returns One text blob per card, in page order.
 */
const galleryCardTexts = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('div.grid.grid-cols-2 > div')).map(
    (card) => card.textContent ?? ''
  );

describe('BatchScanPanel UI & Controls', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // The panel closes the popup after launching the reader or the ZIP export; jsdom tears the whole
    // document down on close, which left every later test in this file without a DOM.
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });

  it('renders scanned chapter pages, allows selection, and dispatches batch queue', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
      { id: '3', url: 'https://example.com/3.jpg', width: 800, height: 1200, top: 2400, left: 0, isTranslated: true, translatedUrl: 'blob:3' },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        return Promise.resolve({ status: 'success', queuedCount: msg.payload?.urls?.length || 0 });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    // Allow state transitions
    await act(async () => {
      await Promise.resolve();
    });

    // Expect 3 total pages detected
    expect(container.textContent).toContain('3 pages');
    // Pre-select untranslated (pages 1 and 2 = 2 pages)
    expect(container.textContent).toContain('Translate 2 Selected Pages');

    // Click Translate button
    const translateBtn = container.querySelector('button.bg-\\[var\\(--color-accent-fill\\)\\]') as HTMLButtonElement;
    expect(translateBtn).not.toBeNull();
    await act(async () => {
      translateBtn.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BATCH_QUEUE_TRANSLATIONS',
        payload: {
          urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
          targetLang: 'en',
          force: false,
        },
      })
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('does not claim Done for a page whose only completed job came from an earlier visit', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({
          status: 'success',
          jobs: [{ id: 7, srcUrl: 'https://example.com/1.jpg', status: 'completed' }],
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The page reloaded, so the stored job row no longer describes what the artwork shows. Claiming
    // Done here is what left the user with an English page and a disabled Translate button.
    expect(container.textContent).not.toContain('Done');
    expect(container.textContent).toContain('Translate 2 Selected Pages');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Done for pages the background restored from storage', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        // The background hands page 1 back from storage and pays only for page 2.
        return Promise.resolve({
          status: 'success',
          queuedCount: 1,
          rejectedUrls: [],
          restoredUrls: ['https://example.com/1.jpg'],
          capacity: 100,
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Queue both pages, then assert the restored one is reported honestly.
    const button = Array.from(container.querySelectorAll('button')).find((element) =>
      element.textContent?.includes('Translate 2 Selected Pages')
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Restored 1 already translated pages');
    expect(container.textContent).toContain('Done');
    // The restored page must leave the pending count: a stale selection copy would still offer it.
    expect(container.textContent).toContain('Translate 1 Pages (1 already done)');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Ready on idle untranslated cards instead of a job label', async () => {
    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: 'https://example.com/idle.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
          ],
        });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const [card] = galleryCardTexts(container);
    expect(card).toContain('Ready');
    expect(card).not.toContain('Processing');
    expect(card).not.toContain('Translate');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('separates Processing, Queued, Done, and Ready across one batch', async () => {
    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
            { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
            { id: '3', url: 'https://example.com/3.jpg', width: 800, height: 1200, top: 2400, left: 0, isTranslated: true, translatedUrl: 'blob:3' },
            { id: '4', url: 'https://example.com/4.jpg', width: 800, height: 1200, top: 3600, left: 0, isTranslated: false },
          ],
        });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({
          status: 'success',
          jobs: [
            { id: 30, srcUrl: 'https://example.com/1.jpg', status: 'processing' },
            { id: 31, srcUrl: 'https://example.com/2.jpg', status: 'queued' },
            { id: 32, srcUrl: 'https://example.com/3.jpg', status: 'completed' },
          ],
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const cards = galleryCardTexts(container);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toContain('Processing');
    expect(cards[0]).toContain('Translating');
    expect(cards[1]).toContain('Queued');
    expect(cards[1]).not.toContain('Processing');
    expect(cards[1]).not.toContain('Translating');
    expect(cards[2]).toContain('Done');
    expect(cards[2]).toContain('Translated');
    expect(cards[3]).toContain('Ready');
    expect(cards[3]).not.toContain('Processing');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('moves cards from Queued to Processing to Done as the queue advances', async () => {
    const pageOne = 'https://example.com/1.jpg';
    const pageTwo = 'https://example.com/2.jpg';
    let statusCalls = 0;
    let resolveImmediatePoll: ((response: unknown) => void) | undefined;
    const completedJobs = [
      { id: 13, srcUrl: pageOne, status: 'completed' },
      { id: 14, srcUrl: pageTwo, status: 'completed' },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: pageOne, width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
            { id: '2', url: pageTwo, width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
          ],
        });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        statusCalls += 1;
        // First poll is the mount-time one; the poll the panel fires right after a successful
        // dispatch stays open so the test can inspect the queued state before work starts.
        if (statusCalls === 1) return Promise.resolve({ status: 'success', jobs: [] });
        if (statusCalls === 2) {
          return new Promise((resolve) => {
            resolveImmediatePoll = resolve;
          });
        }
        return Promise.resolve({ status: 'success', jobs: completedJobs });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        return Promise.resolve({ status: 'success', queuedCount: 2, targetLang: 'en' });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const translateBtn = container.querySelector('button.bg-\\[var\\(--color-accent-fill\\)\\]') as HTMLButtonElement;
    await act(async () => {
      translateBtn.click();
    });

    // The dispatch response marks both pages queued; the immediate poll has not answered yet.
    let cards = galleryCardTexts(container);
    expect(cards[0]).toContain('Queued');
    expect(cards[0]).not.toContain('Processing');
    expect(cards[1]).toContain('Queued');

    await act(async () => {
      resolveImmediatePoll?.({
        status: 'success',
        jobs: [
          { id: 11, srcUrl: pageOne, status: 'processing' },
          { id: 12, srcUrl: pageTwo, status: 'queued' },
        ],
      });
      await Promise.resolve();
    });

    cards = galleryCardTexts(container);
    expect(cards[0]).toContain('Processing');
    expect(cards[0]).toContain('Translating');
    expect(cards[1]).toContain('Queued');
    expect(cards[1]).not.toContain('Processing');
    expect(cards[1]).not.toContain('Translating');

    // The next interval poll reports the finished batch.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2300));
    });

    cards = galleryCardTexts(container);
    expect(cards[0]).toContain('Done');
    expect(cards[0]).toContain('Translated');
    expect(cards[1]).toContain('Done');
    expect(cards[1]).toContain('Translated');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('lets a newer completed job outrank an abandoned older queued row', async () => {
    const pageUrl = 'https://example.com/1.jpg';
    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: pageUrl, width: 800, height: 1200, top: 0, left: 0, isTranslated: true, translatedUrl: 'blob:1' },
          ],
        });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({
          status: 'success',
          jobs: [
            { id: 5, srcUrl: pageUrl, status: 'queued', timestamp: Date.now() - 60_000 },
            { id: 6, srcUrl: pageUrl, status: 'completed', timestamp: Date.now() - 1_000 },
          ],
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const [card] = galleryCardTexts(container);
    expect(card).toContain('Done');
    expect(card).toContain('Translated');
    expect(card).not.toContain('Queued');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('triggers FAST_SCROLL_PRELOAD when Fast Scan button is clicked', async () => {
    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: [] });
      }
      if (msg.type === 'FAST_SCROLL_PRELOAD') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: 'https://example.com/lazy1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
          ],
        });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await Promise.resolve();
    });

    const fastScanBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Fast Scan'
    ) as HTMLButtonElement | undefined;
    expect(fastScanBtn).toBeDefined();

    await act(async () => {
      fastScanBtn?.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ type: 'FAST_SCROLL_PRELOAD' }),
      { frameId: 0 }
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  // Declared before the chapter-reader test: that test leaves the jsdom environment unusable for later tests.
  it('stops a running fast scan through the frame it started on', async () => {
    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({
          status: 'success',
          pages: [
            { id: '1', url: 'https://example.com/lazy1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
          ],
        });
      }
      if (msg.type === 'FAST_SCROLL_PRELOAD') {
        return new Promise(() => {}); // never settles until cancelled
      }
      return Promise.resolve({ status: 'success', jobs: [] });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await Promise.resolve();
    });

    const findButton = (label: string) =>
      Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent?.trim() === label);

    await act(async () => {
      findButton('Fast Scan')?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const stopButton = findButton('Stop');
    expect(stopButton).toBeDefined();
    await act(async () => {
      stopButton?.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ type: 'FAST_SCAN_CANCEL' }),
      { frameId: 0 }
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('smartly skips already-translated pages and dispatches custom pages to chapter reader', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: true, translatedUrl: 'blob:2' },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        return Promise.resolve({ status: 'success', queuedCount: msg.payload?.urls?.length || 0 });
      }
      if (msg.type === 'OPEN_CHAPTER_READER') {
        return Promise.resolve({ status: 'success' });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Select all items (both page 1 and page 2)
    const selectAllCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      selectAllCheckbox.click();
    });

    // Should indicate 1 page to translate, 1 already done
    expect(container.textContent).toContain('Translate 1 Pages (1 already done)');

    // Open reader for selected button should exist
    const readerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reader') && b.textContent?.includes('2')
    );
    expect(readerBtn).toBeDefined();

    await act(async () => {
      readerBtn?.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        type: 'OPEN_CHAPTER_READER',
        payload: expect.objectContaining({
          pages: expect.arrayContaining([
            expect.objectContaining({ url: 'https://example.com/1.jpg' }),
            expect.objectContaining({ url: 'https://example.com/2.jpg' }),
          ]),
        }),
      }),
      { frameId: 0 }
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('marks the pages a full batch queue refused so they can be retried', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: false },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: false },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        return Promise.resolve({
          status: 'success',
          queuedCount: 1,
          rejectedUrls: ['https://example.com/2.jpg'],
          capacity: 100,
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel());
    });
    await act(async () => {
      await Promise.resolve();
    });

    const translateBtn = container.querySelector('button.bg-\\[var\\(--color-accent-fill\\)\\]') as HTMLButtonElement;
    await act(async () => {
      translateBtn.click();
    });

    expect(container.textContent).toContain('Queued 1 of 2 pages');
    expect(container.textContent).toContain('limit 100');
    expect(container.textContent).toContain('Retry');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('re-translates a selection the panel already counts as done, ignoring stored pages', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: true, translatedUrl: 'blob:1' },
      { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: true, translatedUrl: 'blob:2' },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        return Promise.resolve({ status: 'success', jobs: [] });
      }
      if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
        return Promise.resolve({ status: 'success', queuedCount: 2, targetLang: msg.payload?.targetLang });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel('th'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Everything is done, so the smart button has nothing left to do…
    expect(container.textContent).toContain('All 2 Selected Pages Done');

    // …and Retranslate must still queue both pages, forcing a fresh run in the panel's language.
    const retranslateBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Retranslate')
    ) as HTMLButtonElement;
    expect(retranslateBtn).toBeDefined();
    await act(async () => {
      retranslateBtn.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BATCH_QUEUE_TRANSLATIONS',
        payload: {
          urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
          targetLang: 'th',
          force: true,
        },
      })
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Processing on a page whose retranslate job is running even though it was translated before', async () => {
    const mockPages = [
      { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: true, translatedUrl: 'blob:1' },
    ];

    const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
      const msg = maybeMsg || tabIdOrMsg;
      if (msg.type === 'SCAN_CHAPTER_PAGES') {
        return Promise.resolve({ status: 'success', pages: mockPages });
      }
      if (msg.type === 'GET_QUEUE_STATUS') {
        // The previous run's completed row is still in the table; the fresh row must win.
        return Promise.resolve({
          status: 'success',
          jobs: [
            // Reverse order on purpose: proves recency by id beats array order.
            { id: 2, srcUrl: 'https://example.com/1.jpg', status: 'processing', targetLang: 'th' },
            { id: 1, srcUrl: 'https://example.com/1.jpg', status: 'completed', targetLang: 'en' },
          ],
        });
      }
      return Promise.resolve({ status: 'success' });
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
        sendMessage: sendMessageMock,
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(renderPanel('th'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Processing');
    expect(container.textContent).toContain('Translating');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it(
    'reports success and turns the Retranslate button green once every re-queued page finishes',
    async () => {
      const mockPages = [
        { id: '1', url: 'https://example.com/1.jpg', width: 800, height: 1200, top: 0, left: 0, isTranslated: true, translatedUrl: 'blob:1' },
        { id: '2', url: 'https://example.com/2.jpg', width: 800, height: 1200, top: 1200, left: 0, isTranslated: true, translatedUrl: 'blob:2' },
      ];

      // Rows the poll sees: the English run this page still shows, replaced once the retranslate lands.
      type JobRow = { id: number; srcUrl: string; status: string; targetLang?: string };
      const englishJobs: JobRow[] = [
        { id: 1, srcUrl: 'https://example.com/1.jpg', status: 'completed', targetLang: 'en' },
        { id: 2, srcUrl: 'https://example.com/2.jpg', status: 'completed', targetLang: 'en' },
      ];
      const queuedJobs: JobRow[] = [
        { id: 3, srcUrl: 'https://example.com/1.jpg', status: 'queued', targetLang: 'th' },
        { id: 4, srcUrl: 'https://example.com/2.jpg', status: 'queued', targetLang: 'th' },
      ];
      const finishedJobs: JobRow[] = [
        { id: 5, srcUrl: 'https://example.com/1.jpg', status: 'completed', targetLang: 'th' },
        { id: 6, srcUrl: 'https://example.com/2.jpg', status: 'completed', targetLang: 'th' },
      ];
      let retranslateDispatched = false;
      let queuedPollServed = false;

      const sendMessageMock = vi.fn().mockImplementation((tabIdOrMsg: any, maybeMsg?: any) => {
        const msg = maybeMsg || tabIdOrMsg;
        if (msg.type === 'SCAN_CHAPTER_PAGES') {
          return Promise.resolve({ status: 'success', pages: mockPages });
        }
        if (msg.type === 'GET_QUEUE_STATUS') {
          // The immediate poll after dispatch sees the fresh queued rows; the next one sees them done.
          if (retranslateDispatched && !queuedPollServed) {
            queuedPollServed = true;
            return Promise.resolve({ status: 'success', jobs: [...queuedJobs, ...englishJobs] });
          }
          return Promise.resolve({
            status: 'success',
            jobs: retranslateDispatched ? finishedJobs : englishJobs,
          });
        }
        if (msg.type === 'BATCH_QUEUE_TRANSLATIONS') {
          retranslateDispatched = true;
          return Promise.resolve({
            status: 'success',
            queuedCount: 2,
            restoredUrls: [],
            rejectedUrls: [],
            capacity: 100,
            total: 2,
            targetLang: 'th',
          });
        }
        return Promise.resolve({ status: 'success' });
      });

      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://mangadex.org/chapter/1' }]),
          sendMessage: sendMessageMock,
        },
        runtime: {
          sendMessage: sendMessageMock,
        },
      };

      const root = createRoot(container);
      await act(async () => {
        root.render(renderPanel('th'));
      });
      await act(async () => {
        await Promise.resolve();
      });

      const retranslateBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Retranslate')
      ) as HTMLButtonElement;
      expect(retranslateBtn).toBeDefined();
      await act(async () => {
        retranslateBtn.click();
      });

      // Running state: the button spins instead of claiming the pages are already done.
      expect(container.textContent).toContain('Retranslating…');

      // The queue has no completion callback; one poll after the run is enough to see both pages done.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2300));
      });

      expect(container.textContent).toContain('Successfully translated 2 pages → Thai');
      expect(retranslateBtn.className).toContain('border-emerald-500');
      expect(retranslateBtn.textContent).toContain('Successfully translated');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
    15000
  );
});
