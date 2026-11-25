// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterTranslationRecord } from './chapterZip';
import type { MediaTarget } from './mediaTargets';
import { IMAGE_DISPLAY_CHANGED_EVENT } from './imageReplacer';
import { readPageOriginalState, togglePageOriginals } from './pageOriginalToggle';

const SOURCE_PAGE = 'https://example.com/chapter/1';
const ORIGINAL_URL = 'https://example.com/page-1.jpg';
const TRANSLATED_URL = 'blob:https://example.com/page-1';

describe('page original toggle', () => {
  let image: HTMLImageElement;
  let surface: HTMLDivElement;
  let target: MediaTarget;
  let record: ChapterTranslationRecord;

  beforeEach(() => {
    document.body.innerHTML = '';
    surface = document.createElement('div');
    image = document.createElement('img');
    image.setAttribute('data-kites-orig-src', ORIGINAL_URL);
    image.setAttribute('data-kites-applied-src', TRANSLATED_URL);
    image.src = TRANSLATED_URL;
    surface.appendChild(image);
    document.body.appendChild(surface);

    target = {
      kind: 'img',
      imgElement: image,
      sourceElement: image,
      surfaceElement: surface,
      anchorElement: surface,
      srcUrl: ORIGINAL_URL,
      hiddenBacking: false,
    };
    record = {
      originalUrl: ORIGINAL_URL,
      translatedUrl: TRANSLATED_URL,
      showOriginal: false,
      sourcePage: SOURCE_PAGE,
      documentPath: null,
      documentY: 0,
      sequence: 1,
    };
  });

  it('reports whether the page has translations and whether all are showing originals', () => {
    expect(readPageOriginalState([], SOURCE_PAGE)).toEqual({ hasTranslated: false, showOriginal: false });
    expect(readPageOriginalState([record], SOURCE_PAGE)).toEqual({ hasTranslated: true, showOriginal: false });

    record.showOriginal = true;
    expect(readPageOriginalState([record], SOURCE_PAGE)).toEqual({ hasTranslated: true, showOriginal: true });
  });

  it('ignores records from other pages and unfinished entries', () => {
    const otherPage = { ...record, sourcePage: 'https://example.com/chapter/2' };
    const unfinished = { ...record, translatedUrl: '' };

    expect(readPageOriginalState([otherPage, unfinished], SOURCE_PAGE))
      .toEqual({ hasTranslated: false, showOriginal: false });
  });

  it('flips every current-page translation and dispatches the shared display event', () => {
    const eventSpy = vi.fn();
    document.addEventListener(IMAGE_DISPLAY_CHANGED_EVENT, eventSpy);

    const result = togglePageOriginals([record], SOURCE_PAGE, () => target);

    expect(result).toEqual({ hasTranslated: true, showOriginal: true, toggled: 1 });
    expect(record.showOriginal).toBe(true);
    expect(image.getAttribute('data-kites-show-original')).toBe('true');
    expect(image.src).toBe(ORIGINAL_URL);
    expect(eventSpy).toHaveBeenCalledTimes(1);

    const second = togglePageOriginals([record], SOURCE_PAGE, () => target);
    expect(second).toEqual({ hasTranslated: true, showOriginal: false, toggled: 1 });
    expect(record.showOriginal).toBe(false);
    expect(image.src).toBe(TRANSLATED_URL);
  });

  it('updates detached records without a DOM target', () => {
    const eventSpy = vi.fn();
    document.addEventListener(IMAGE_DISPLAY_CHANGED_EVENT, eventSpy);

    const result = togglePageOriginals([record], SOURCE_PAGE, () => null);

    expect(result).toEqual({ hasTranslated: true, showOriginal: true, toggled: 1 });
    expect(record.showOriginal).toBe(true);
    expect(eventSpy).not.toHaveBeenCalled();
  });
});
