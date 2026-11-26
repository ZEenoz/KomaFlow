import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationJob } from '../../db';
import { PageRail } from './PageRail';

vi.mock('../canvas/thumbnailRenderer', () => ({
  getTranslatedPageThumbnailUrl: vi.fn(() => Promise.resolve(null)),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const JOBS: TranslationJob[] = [
  { id: 1, timestamp: NOW - 60_000, status: 'completed', pageName: 'Newest Page' },
  { id: 2, timestamp: NOW - 2 * DAY_MS, status: 'completed', pageName: 'Middle Page' },
  { id: 3, timestamp: NOW - 40 * DAY_MS, status: 'error', pageName: 'Old Page' },
];

let root: Root;
let container: HTMLDivElement;

/**
 * Flushes pending React effects and IndexedDB promises.
 *
 * @returns Resolves after state updates settle.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/**
 * Renders the rail with the shared history fixture.
 *
 * @param onSelectPage - Spy invoked when a page is opened.
 * @returns The page-open spy.
 */
async function renderRail(onSelectPage = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
  await act(async () => {
    root.render(<PageRail allJobs={JOBS} activeJobId={1} onSelectPage={onSelectPage} />);
  });
  await flush();
  return onSelectPage;
}

/**
 * Clicks one element inside React's act boundary.
 *
 * @param element - Target element.
 * @returns Resolves after React processes the update.
 */
async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('Target element not found');
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
}

/**
 * Changes a controlled select value and fires its change event.
 *
 * @param selector - Selector for the select element.
 * @param value - New option value.
 * @returns Resolves after React processes the update.
 */
async function selectValue(selector: string, value: string): Promise<void> {
  const select = container.querySelector(selector) as HTMLSelectElement | null;
  if (!select) throw new Error(`Select not found: ${selector}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

/**
 * Reads visible history card IDs in DOM order.
 *
 * @returns Job IDs in render order.
 */
function visibleJobIds(): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="rail-history-page-"]'))
    .map((element) => element.getAttribute('data-job-id') ?? '');
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('PageRail', () => {
  it('defaults to the History tab when no project is active', async () => {
    await renderRail();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const historyTab = tabs.find((tab) => tab.textContent?.trim() === 'History');
    const projectTab = tabs.find((tab) => tab.textContent?.trim() === 'Project');

    expect(historyTab?.getAttribute('aria-selected')).toBe('true');
    expect(projectTab?.getAttribute('aria-selected')).toBe('false');
    expect(visibleJobIds()).toEqual(['1', '2', '3']);
  });

  it('filters by date and toggles chronological order', async () => {
    await renderRail();

    await selectValue('select[aria-label="Date filter"]', '7d');
    expect(visibleJobIds()).toEqual(['1', '2']);

    expect(visibleJobIds()).toEqual(['1', '2']);
    await click(container.querySelector('button[aria-label="Sort: Latest → Oldest"]'));
    expect(visibleJobIds()).toEqual(['2', '1']);

    await click(container.querySelector('button[aria-label="Sort: Oldest → Latest"]'));
    expect(visibleJobIds()).toEqual(['1', '2']);
  });

  it('toggles the flex grid and single-column strip layouts', async () => {
    await renderRail();

    const list = container.querySelector('[data-testid="rail-history-list"]');
    expect(list?.getAttribute('data-layout')).toBe('strip');
    expect(list?.className).toContain('flex-col');

    await click(container.querySelector('button[aria-label="Grid layout"]'));
    expect(list?.getAttribute('data-layout')).toBe('grid');
    expect(list?.className).toContain('flex-wrap');

    await click(container.querySelector('button[aria-label="Strip layout"]'));
    expect(list?.getAttribute('data-layout')).toBe('strip');
    expect(list?.className).toContain('flex-col');
  });

  it('opens a history page immediately when its card is clicked', async () => {
    const onSelectPage = await renderRail();

    await click(container.querySelector('[data-testid="rail-history-page-2"]'));
    expect(onSelectPage).toHaveBeenCalledWith(2);
  });
});
