import type { ChapterTranslationRecord } from './chapterZip';
import type { MediaTarget } from './mediaTargets';
import { toggleImageDisplay } from './imageReplacer';

/** Current original/translated state for translated images on one page. */
export interface PageOriginalState {
  /** Whether the page has at least one finished translation. */
  hasTranslated: boolean;
  /** Whether every translated image is showing its original artwork. */
  showOriginal: boolean;
}

/** Result of toggling every translated image on one page. */
export interface PageOriginalToggleResult extends PageOriginalState {
  /** Number of translated registry entries affected by the toggle. */
  toggled: number;
}

/**
 * Reads whether all finished translations on the current page show original artwork.
 *
 * @param records - Chapter translation records, including records from earlier SPA pages.
 * @param sourcePage - Current document URL used to scope records to this page.
 * @returns Page-level transcript state.
 */
export function readPageOriginalState(
  records: Iterable<ChapterTranslationRecord>,
  sourcePage: string,
): PageOriginalState {
  let hasTranslated = false;
  let allOriginal = true;
  for (const record of records) {
    if (record.sourcePage !== sourcePage || !record.translatedUrl) continue;
    hasTranslated = true;
    if (!record.showOriginal) allOriginal = false;
  }
  return { hasTranslated, showOriginal: hasTranslated && allOriginal };
}

/**
 * Toggles every finished translation on the current page through the same display path used by
 * the per-image eye control, dispatching the shared `kites-image-display-changed` event.
 *
 * @param records - Chapter translation records, including records from earlier SPA pages.
 * @param sourcePage - Current document URL used to scope records to this page.
 * @param resolveTarget - Resolves an original URL to its live page surface.
 * @param showOriginal - Optional explicit target state; omitted flips the current page state.
 * @returns Resulting page state and the number of toggled records.
 */
export function togglePageOriginals(
  records: Iterable<ChapterTranslationRecord>,
  sourcePage: string,
  resolveTarget: (srcUrl: string) => MediaTarget | null,
  showOriginal?: boolean,
): PageOriginalToggleResult {
  const pageRecords = [...records].filter(
    (record) => record.sourcePage === sourcePage && Boolean(record.translatedUrl),
  );
  const current = readPageOriginalState(pageRecords, sourcePage);
  const nextShowOriginal = showOriginal ?? (current.hasTranslated && !current.showOriginal);

  for (const record of pageRecords) {
    const target = resolveTarget(record.originalUrl);
    if (target) {
      toggleImageDisplay(target, nextShowOriginal, record);
    } else {
      record.showOriginal = nextShowOriginal;
    }
  }

  return {
    hasTranslated: pageRecords.length > 0,
    showOriginal: nextShowOriginal,
    toggled: pageRecords.length,
  };
}
