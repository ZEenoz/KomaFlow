import { describe, expect, it } from 'vitest';
import type { ProjectFolder, TranslationJob } from '../../db';
import {
  filterAndSortJobs,
  filterAndSortProjects,
  formatLocalIsoDate,
  getJobDisplayName,
  matchesDateFilter,
} from './historyFilter';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime();

/**
 * Builds a minimal translation job for filter tests.
 *
 * @param id - Local job ID.
 * @param timestamp - Creation time.
 * @param overrides - Optional fields to override.
 * @returns Test job.
 */
function job(id: number, timestamp: number, overrides: Partial<TranslationJob> = {}): TranslationJob {
  return { id, timestamp, status: 'completed', ...overrides };
}

/**
 * Builds a minimal project folder for filter tests.
 *
 * @param id - Local project ID.
 * @param timestamp - Creation time.
 * @param overrides - Optional fields to override.
 * @returns Test project.
 */
function project(id: number, timestamp: number, overrides: Partial<ProjectFolder> = {}): ProjectFolder {
  return { id, title: `Project ${id}`, timestamp, isFavorite: false, ...overrides };
}

describe('history date helpers', () => {
  it('formats local dates with zero-padded components', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(formatLocalIsoDate(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31');
  });

  it('returns an empty string for a non-finite timestamp', () => {
    expect(formatLocalIsoDate(Number.NaN)).toBe('');
  });

  it('treats all as unfiltered and today by local calendar day', () => {
    expect(matchesDateFilter(NOW - 1000, 'all', undefined, NOW)).toBe(true);
    expect(matchesDateFilter(new Date(2026, 8, 7, 0, 1).getTime(), 'today', undefined, NOW)).toBe(true);
    expect(matchesDateFilter(new Date(2026, 8, 6, 23, 59).getTime(), 'today', undefined, NOW)).toBe(false);
  });

  it('uses rolling seven- and thirty-day windows', () => {
    expect(matchesDateFilter(NOW - 7 * DAY_MS, '7d', undefined, NOW)).toBe(true);
    expect(matchesDateFilter(NOW - 7 * DAY_MS - 1, '7d', undefined, NOW)).toBe(false);
    expect(matchesDateFilter(NOW - 30 * DAY_MS, '30d', undefined, NOW)).toBe(true);
    expect(matchesDateFilter(NOW - 30 * DAY_MS - 1, '30d', undefined, NOW)).toBe(false);
  });

  it('matches custom dates and rejects malformed custom values', () => {
    expect(matchesDateFilter(NOW, 'custom', '2026-09-07', NOW)).toBe(true);
    expect(matchesDateFilter(NOW, 'custom', '2026-09-06', NOW)).toBe(false);
    expect(matchesDateFilter(NOW, 'custom', '09/07/2026', NOW)).toBe(false);
    expect(matchesDateFilter(NOW, 'custom', undefined, NOW)).toBe(false);
  });
});

describe('getJobDisplayName', () => {
  it('prefers an explicit page name', () => {
    expect(getJobDisplayName(job(1, NOW, { pageName: 'Cover', srcUrl: 'https://site.test/a.png' }))).toBe('Cover');
  });

  it('falls back through the source URL basename and raw URL', () => {
    expect(getJobDisplayName(job(2, NOW, { srcUrl: 'https://site.test/chapter/page-03.png?token=1' }))).toBe('page-03.png');
    expect(getJobDisplayName(job(3, NOW, { srcUrl: 'not a URL' }))).toBe('not a URL');
  });

  it('labels jobs without a name or URL', () => {
    expect(getJobDisplayName(job(7, NOW))).toBe('Page #7');
    expect(getJobDisplayName({ timestamp: NOW })).toBe('Untitled page');
  });
});

describe('filterAndSortJobs', () => {
  const jobs = [
    job(1, NOW - 40 * DAY_MS, { folderId: 10 }),
    job(2, NOW - 2 * DAY_MS, { folderId: 10 }),
    job(3, NOW - 1000),
    job(4, NOW - 20 * DAY_MS),
  ];

  it('filters by date and assignment scope without mutating the input', () => {
    const snapshot = jobs.map((entry) => entry.id);
    const result = filterAndSortJobs(jobs, {
      datePreset: '30d',
      scope: 'unassigned',
      sortOrder: 'newest',
      nowMs: NOW,
    });

    expect(result.map((entry) => entry.id)).toEqual([3, 4]);
    expect(jobs.map((entry) => entry.id)).toEqual(snapshot);
  });

  it('sorts oldest first with ID tie-breakers', () => {
    const result = filterAndSortJobs(
      [job(9, NOW), job(2, NOW), job(4, NOW - DAY_MS)],
      { sortOrder: 'oldest', nowMs: NOW }
    );

    expect(result.map((entry) => entry.id)).toEqual([4, 2, 9]);
  });

  it('supports a custom local date', () => {
    const result = filterAndSortJobs(jobs, {
      datePreset: 'custom',
      customDate: formatLocalIsoDate(NOW - 2 * DAY_MS),
      nowMs: NOW,
    });

    expect(result.map((entry) => entry.id)).toEqual([2]);
  });
});

describe('filterAndSortProjects', () => {
  const projects = [
    project(1, NOW - 40 * DAY_MS, { updatedAt: NOW - 40 * DAY_MS }),
    project(2, NOW - 10 * DAY_MS, { updatedAt: NOW - DAY_MS }),
    project(3, NOW - 2 * DAY_MS),
  ];

  it('filters by last activity date', () => {
    const result = filterAndSortProjects(projects, {
      datePreset: '7d',
      sortOrder: 'newest',
      nowMs: NOW,
    });

    expect(result.map((entry) => entry.id)).toEqual([2, 3]);
  });

  it('sorts by updatedAt when present and supports oldest first', () => {
    const result = filterAndSortProjects(projects, { sortOrder: 'oldest', nowMs: NOW });

    expect(result.map((entry) => entry.id)).toEqual([1, 3, 2]);
  });
});
