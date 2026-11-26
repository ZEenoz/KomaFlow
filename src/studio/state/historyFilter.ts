import type { ProjectFolder, TranslationJob } from '../../db';

/** Date window options offered by the history toolbar. */
export type HistoryDatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

/** Chronological order for history cards. */
export type HistorySortOrder = 'newest' | 'oldest';

/** Whether to include project-assigned jobs or only unassigned history pages. */
export type HistoryScopeFilter = 'all' | 'unassigned';

/** Visual density for the history page. */
export type HistoryLayoutMode = 'strip' | 'grid';

/** Top-level library tab selected by the dashboard. */
export type LibraryViewTab = 'all' | 'projects' | 'pages';

/** Filter and sort input for translation-job history. */
export interface HistoryJobFilterOptions {
  /** Date window; defaults to `all`. */
  datePreset?: HistoryDatePreset;
  /** Local ISO date (`YYYY-MM-DD`) used when `datePreset` is `custom`. */
  customDate?: string;
  /** Chronological order; defaults to `newest`. */
  sortOrder?: HistorySortOrder;
  /** Assignment scope; defaults to `all`. */
  scope?: HistoryScopeFilter;
  /** Reference clock for deterministic date-window tests; defaults to `Date.now()`. */
  nowMs?: number;
}

/** Filter and sort input for project history. */
export interface HistoryProjectFilterOptions {
  /** Date window based on last project activity; defaults to `all`. */
  datePreset?: HistoryDatePreset;
  /** Local ISO date (`YYYY-MM-DD`) used when `datePreset` is `custom`. */
  customDate?: string;
  /** Chronological order; defaults to `newest`. */
  sortOrder?: HistorySortOrder;
  /** Reference clock for deterministic date-window tests; defaults to `Date.now()`. */
  nowMs?: number;
}

/** Milliseconds in one elapsed day. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days covered by the `7d` preset. */
const SEVEN_DAY_WINDOW = 7;

/** Days covered by the `30d` preset. */
const THIRTY_DAY_WINDOW = 30;

/** Matches a local calendar date in `YYYY-MM-DD` form. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Width used when zero-padding month and day components. */
const DATE_PART_WIDTH = 2;

/** Width used when zero-padding the year component. */
const YEAR_PART_WIDTH = 4;

/** Prefix for a job that has no page name or source URL. */
const PAGE_LABEL_PREFIX = 'Page #';

/** Display name used when a job has no identifying fields at all. */
const UNTITLED_PAGE_LABEL = 'Untitled page';

/** Separator used to extract the last segment of a URL path. */
const URL_PATH_SEPARATOR = '/';

/**
 * Formats an epoch timestamp as a local-date ISO string (`YYYY-MM-DD`).
 *
 * The conversion is local, not UTC, so a card's date matches the user's calendar.
 *
 * @param timestamp - Epoch milliseconds to format.
 * @returns Local ISO date, or an empty string for a non-finite timestamp.
 */
export function formatLocalIsoDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  if (!Number.isFinite(year)) return '';

  const month = String(date.getMonth() + 1).padStart(DATE_PART_WIDTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_WIDTH, '0');
  return `${String(year).padStart(YEAR_PART_WIDTH, '0')}-${month}-${day}`;
}

/**
 * Tests whether a timestamp falls inside the selected history date window.
 *
 * `today` and `custom` compare local calendar dates. `7d` and `30d` use rolling elapsed windows
 * ending at `nowMs`.
 *
 * @param timestamp - Epoch milliseconds to test.
 * @param preset - Date window to apply.
 * @param customDate - Local ISO date used by the `custom` preset.
 * @param nowMs - Reference clock; defaults to `Date.now()`.
 * @returns True when the timestamp is inside the requested window.
 */
export function matchesDateFilter(
  timestamp: number,
  preset: HistoryDatePreset,
  customDate?: string,
  nowMs?: number
): boolean {
  if (preset === 'all') return true;
  if (!Number.isFinite(timestamp)) return false;

  const now = nowMs ?? Date.now();
  switch (preset) {
    case 'today':
      return formatLocalIsoDate(timestamp) === formatLocalIsoDate(now);
    case '7d':
      return timestamp >= now - SEVEN_DAY_WINDOW * MILLISECONDS_PER_DAY;
    case '30d':
      return timestamp >= now - THIRTY_DAY_WINDOW * MILLISECONDS_PER_DAY;
    case 'custom': {
      const selectedDate = customDate?.trim() ?? '';
      return ISO_DATE_PATTERN.test(selectedDate)
        && formatLocalIsoDate(timestamp) === selectedDate;
    }
    default:
      return false;
  }
}

/**
 * Resolves the user-facing title for a history page.
 *
 * Prefers an explicit page name, then the source URL's final path segment, then the raw source
 * URL, and finally a page-number label.
 *
 * @param job - Translation job to name.
 * @returns Non-empty display label.
 */
export function getJobDisplayName(job: TranslationJob): string {
  const pageName = job.pageName?.trim();
  if (pageName) return pageName;

  const sourceUrl = job.srcUrl?.trim();
  if (sourceUrl) {
    if (sourceUrl.startsWith('data:') || sourceUrl.startsWith('blob:')) return sourceUrl;
    try {
      const pathname = new URL(sourceUrl).pathname;
      const basename = decodeURIComponent(pathname.split(URL_PATH_SEPARATOR).pop() ?? '');
      if (basename) return basename;
    } catch {
      // Malformed URLs are still useful as their original text.
    }
    return sourceUrl;
  }

  return job.id !== undefined ? `${PAGE_LABEL_PREFIX}${job.id}` : UNTITLED_PAGE_LABEL;
}

/**
 * Compares two jobs by their history timestamp and then by stable local ID.
 *
 * @param left - First job.
 * @param right - Second job.
 * @param sortOrder - Requested chronological direction.
 * @returns Negative when left should sort first, positive when right should.
 */
function compareJobs(left: TranslationJob, right: TranslationJob, sortOrder: HistorySortOrder): number {
  const direction = sortOrder === 'oldest' ? 1 : -1;
  const timestampDelta = (left.timestamp - right.timestamp) * direction;
  if (timestampDelta !== 0) return timestampDelta;
  return ((left.id ?? -1) - (right.id ?? -1)) * direction;
}

/**
 * Applies history date, assignment, and order filters to translation jobs.
 *
 * @param jobs - Jobs to filter without mutating the source array.
 * @param options - Date preset, custom date, sort order, assignment scope, and reference clock.
 * @returns A new array containing only matching jobs in the requested order.
 */
export function filterAndSortJobs(
  jobs: TranslationJob[],
  options: HistoryJobFilterOptions = {}
): TranslationJob[] {
  const datePreset = options.datePreset ?? 'all';
  const sortOrder = options.sortOrder ?? 'newest';
  const scope = options.scope ?? 'all';

  return jobs
    .filter((job) => matchesDateFilter(job.timestamp, datePreset, options.customDate, options.nowMs))
    .filter((job) => scope === 'all' || job.folderId === undefined)
    .slice()
    .sort((left, right) => compareJobs(left, right, sortOrder));
}

/**
 * Applies history date and order filters to project folders.
 *
 * A project's activity time is its newest `updatedAt`, falling back to its creation timestamp.
 *
 * @param projects - Projects to filter without mutating the source array.
 * @param options - Date preset, custom date, sort order, and reference clock.
 * @returns A new array containing only matching projects in the requested order.
 */
export function filterAndSortProjects(
  projects: ProjectFolder[],
  options: HistoryProjectFilterOptions = {}
): ProjectFolder[] {
  const datePreset = options.datePreset ?? 'all';
  const sortOrder = options.sortOrder ?? 'newest';
  const direction = sortOrder === 'oldest' ? 1 : -1;

  return projects
    .filter((project) => matchesDateFilter(
      project.updatedAt ?? project.timestamp,
      datePreset,
      options.customDate,
      options.nowMs
    ))
    .slice()
    .sort((left, right) => {
      const leftTime = left.updatedAt ?? left.timestamp;
      const rightTime = right.updatedAt ?? right.timestamp;
      const timestampDelta = (leftTime - rightTime) * direction;
      if (timestampDelta !== 0) return timestampDelta;
      return ((left.id ?? -1) - (right.id ?? -1)) * direction;
    });
}
