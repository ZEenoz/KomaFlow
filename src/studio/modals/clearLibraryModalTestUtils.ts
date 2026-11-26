import { act } from 'react';
import { db, type ProjectFolder, type TranslationJob } from '../../db';
import { createProject } from '../state/projectStore';

/** Fixture IDs and loaded records for one seeded library. */
export interface SeedResult {
  projectA: number;
  projectB: number;
  jobA: number;
  jobB: number;
  unassigned: number;
  projects: ProjectFolder[];
  jobs: TranslationJob[];
}

/**
 * Seeds two projects and three pages with measurable image bytes.
 *
 * @returns Project/job IDs plus the records passed to the modal.
 */
export async function seedLibrary(): Promise<SeedResult> {
  const now = Date.now();
  const projectA = await createProject('Alpha');
  const projectB = await createProject('Beta');
  const jobA = (await db.translationJobs.add({
    timestamp: now,
    status: 'completed',
    folderId: projectA,
    pageName: 'Alpha Page',
    targetLang: 'VI',
    srcUrl: 'https://example.com/alpha.png',
  }))!;
  const jobB = (await db.translationJobs.add({
    timestamp: now - 1000,
    status: 'completed',
    folderId: projectB,
    pageName: 'Beta Page',
    targetLang: 'EN',
  }))!;
  const unassigned = (await db.translationJobs.add({
    timestamp: now - 2000,
    status: 'completed',
    pageName: 'History Page',
  }))!;
  await db.images.add({ jobId: jobA, rawImageBlob: new Blob([new Uint8Array(2 * 1024 * 1024)]) });
  await db.images.add({ jobId: jobB, rawImageBlob: new Blob([new Uint8Array(1024 * 1024)]) });
  await db.images.add({ jobId: unassigned, rawImageBlob: new Blob([new Uint8Array(1024 * 1024)]) });

  return {
    projectA,
    projectB,
    jobA,
    jobB,
    unassigned,
    projects: await db.projectFolders.toArray(),
    jobs: await db.translationJobs.toArray(),
  };
}

/**
 * Flushes pending IndexedDB promises and React effects.
 *
 * @returns Resolves after the event loop and state updates settle.
 */
export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/**
 * Finds a button by its exact trimmed text.
 *
 * @param container - Rendered test container.
 * @param text - Button label to match.
 * @returns Matching button element.
 */
export function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((element) => element.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

/**
 * Clicks an element inside React's act boundary.
 *
 * @param element - Element to click.
 * @returns Resolves after React processes the update.
 */
export async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('Target element not found');
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
}
