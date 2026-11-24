// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BatchScanPanel from './BatchScanPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
      root.render(<BatchScanPanel />);
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
        payload: { urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'] },
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
      root.render(<BatchScanPanel />);
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
      root.render(<BatchScanPanel />);
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
      root.render(<BatchScanPanel />);
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
      root.render(<BatchScanPanel />);
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
      root.render(<BatchScanPanel />);
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
      root.render(<BatchScanPanel />);
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
});
