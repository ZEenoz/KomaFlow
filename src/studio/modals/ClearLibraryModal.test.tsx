import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { ClearLibraryModal } from './ClearLibraryModal';
import {
  buttonByText,
  click,
  flush,
  seedLibrary,
} from './clearLibraryModalTestUtils';

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
});

describe('ClearLibraryModal', () => {
  it('clears every project and page in Clear All mode and reports the result', async () => {
    const seed = await seedLibrary();
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={onClose}
          projects={seed.projects}
          jobs={seed.jobs}
          onCleared={onCleared}
        />
      );
    });
    await flush();

    expect(container.querySelector('[data-testid="clear-library-summary"]')?.textContent)
      .toContain('2 projects, 3 pages');

    await click(container.querySelector('[data-testid="clear-library-confirm"]'));

    expect(await db.projectFolders.count()).toBe(0);
    expect(await db.translationJobs.count()).toBe(0);
    expect(await db.images.count()).toBe(0);
    expect(onCleared).toHaveBeenCalledWith(expect.objectContaining({
      deletedProjects: 2,
      deletedJobs: 3,
      deletedImages: 3,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears only selected records in Custom Select mode', async () => {
    const seed = await seedLibrary();
    const onCleared = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={() => {}}
          projects={seed.projects}
          jobs={seed.jobs}
          initialMode="custom"
          onCleared={onCleared}
        />
      );
    });
    await flush();

    await click(container.querySelector('[aria-label="Select project Beta"]'));
    expect(container.querySelector('[data-testid="clear-library-summary"]')?.textContent)
      .toContain('1 projects, 0 pages');

    await click(container.querySelector('[aria-label="Select page History Page"]'));
    expect(container.querySelector('[data-testid="clear-library-summary"]')?.textContent)
      .toContain('1 projects, 1 pages');

    await click(container.querySelector('[data-testid="clear-library-confirm"]'));

    expect(await db.projectFolders.get(seed.projectB)).toBeUndefined();
    expect(await db.projectFolders.get(seed.projectA)).toBeDefined();
    expect(await db.translationJobs.get(seed.unassigned)).toBeUndefined();
    expect(await db.translationJobs.get(seed.jobB)).toBeDefined();
    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it('honours the Pages scope while keeping project folders', async () => {
    const seed = await seedLibrary();

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={() => {}}
          projects={seed.projects}
          jobs={seed.jobs}
          onCleared={() => {}}
        />
      );
    });
    await flush();

    await click(Array.from(container.querySelectorAll('[role="tab"]'))
      .find((tab) => tab.textContent?.trim() === 'Pages') ?? null);
    expect(container.querySelector('[data-testid="clear-library-summary"]')?.textContent)
      .toContain('0 projects, 3 pages');

    await click(container.querySelector('[data-testid="clear-library-confirm"]'));

    expect(await db.projectFolders.count()).toBe(2);
    expect(await db.translationJobs.count()).toBe(0);
  });

  it('unlinks project pages by default and cascades them when requested', async () => {
    const first = await seedLibrary();

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={() => {}}
          projects={first.projects}
          jobs={first.jobs}
          initialMode="custom"
          initialSelectedProjectIds={[first.projectA]}
          onCleared={() => {}}
        />
      );
    });
    await flush();
    await click(container.querySelector('[data-testid="clear-library-confirm"]'));

    expect(await db.projectFolders.get(first.projectA)).toBeUndefined();
    expect((await db.translationJobs.get(first.jobA))?.folderId).toBeUndefined();

    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()));
    });
    const second = await seedLibrary();

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen={false}
          onClose={() => {}}
          projects={second.projects}
          jobs={second.jobs}
          onCleared={() => {}}
        />
      );
    });
    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={() => {}}
          projects={second.projects}
          jobs={second.jobs}
          initialMode="custom"
          initialSelectedProjectIds={[second.projectA]}
          onCleared={() => {}}
        />
      );
    });
    await flush();

    await click(buttonByText(container, 'Delete projects and all their linked pages'));
    await click(container.querySelector('[data-testid="clear-library-confirm"]'));

    expect(await db.projectFolders.get(second.projectA)).toBeUndefined();
    expect(await db.translationJobs.get(second.jobA)).toBeUndefined();
    expect(await db.translationJobs.get(second.jobB)).toBeDefined();
  });

  it('warns when the active project or page is targeted', async () => {
    const seed = await seedLibrary();

    await act(async () => {
      root.render(
        <ClearLibraryModal
          isOpen
          onClose={() => {}}
          projects={seed.projects}
          jobs={seed.jobs}
          activeProjectId={seed.projectA}
          activeJobId={seed.jobA}
          initialMode="custom"
          initialSelectedProjectIds={[seed.projectA]}
          onCleared={() => {}}
        />
      );
    });
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Active project');

    await click(buttonByText(container, 'Delete projects and all their linked pages'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Active translated page');
  });
});
