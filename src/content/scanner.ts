import {
  discoverMediaTargets,
  isPlaceholderSource,
  normalizeMediaUrl,
  resolveImageSource,
} from './mediaTargets';
import { AD_NOISE_CONTAINER_SELECTORS, MANGA_READER_CONTAINER_SELECTORS } from '../shared/siteRules';

export interface ScannedPageImage {
  id: string;
  url: string;
  width: number;
  height: number;
  top: number;
  left: number;
  isTranslated: boolean;
  translatedUrl?: string;
  domOrder?: number;
}

const LAZY_IMAGE_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-original-src',
  'data-url',
  'data-lazy-src',
  'data-actual-src',
  'data-full-image',
  'data-real-src',
  'data-origin',
  'data-cfsrc',
  'data-echo',
  'data-hi-res-src',
  'data-img',
];

const LAZY_SRCSET_ATTRIBUTES = ['data-srcset', 'data-lazy-srcset'];
const UI_NOISE_ASSET_RE = /(?:^|\/|_|-)(?:avatar|favicon|logo|icon|badge|emoji|spinner|loading)(?:[-_.]|$)/i;
const AD_NOISE_SELECTOR = AD_NOISE_CONTAINER_SELECTORS.join(', ');
const READER_CONTAINER_SELECTOR = MANGA_READER_CONTAINER_SELECTORS.join(', ');

/**
 * Filter outlier thumbnails (such as recommendation widget covers or thumbnails)
 * when the manga strip has full-sized comic panels.
 * Ported from XianScan sorter.ts.
 *
 * @param images - Scanned image candidates.
 * @returns Filtered array without thumbnail noise.
 */
export function filterOutlierThumbnails(images: ScannedPageImage[]): ScannedPageImage[] {
  if (images.length < 3) return images;

  const largePanelsCount = images.filter((i) => i.height >= 600 || i.width >= 500).length;
  const smallThumbnailsCount = images.filter(
    (img) => img.width > 0 && img.height > 0 && img.width <= 320 && img.height <= 450
  ).length;

  // Only filter out small thumbnails if large manga panels predominate (e.g. reader mode with footer recommendations)
  if (largePanelsCount >= 3 && largePanelsCount > smallThumbnailsCount) {
    return images.filter((img) => {
      if (img.height >= 600 || img.width >= 500) return true;
      if (img.width > 0 && img.height > 0 && img.width <= 320 && img.height <= 450) {
        return false;
      }
      return true;
    });
  }
  return images;
}

/**
 * Filters out extreme aspect-ratio resolution outliers (e.g. short horizontal banner ads).
 * Ported from XianScan sorter.ts.
 *
 * @param images - Scanned image candidates.
 * @returns Filtered array without banner ads.
 */
export function filterResolutionOutliers(images: ScannedPageImage[]): ScannedPageImage[] {
  if (images.length < 3) return images;

  return images.filter((img) => {
    if (img.height >= 600) return true;
    if (img.width > 0 && img.height > 0) {
      const ratio = img.width / img.height;
      if (ratio >= 2.5 && img.height <= 260) return false;
      if (img.height <= 50) return false;
    }
    return true;
  });
}

/**
 * Sorts scanned images spatially from top-to-bottom primary, left-to-right secondary,
 * with natural alphanumeric tiebreaker.
 * Ported from XianScan sorter.ts.
 *
 * @param images - Scanned image candidates.
 * @returns Spatially sorted images.
 */
export function sortScannedImages(images: ScannedPageImage[]): ScannedPageImage[] {
  return [...images].sort((first, second) => {
    const topDiff = first.top - second.top;
    if (Math.abs(topDiff) > 20) {
      return topDiff;
    }
    const leftDiff = first.left - second.left;
    if (Math.abs(leftDiff) > 20) {
      return leftDiff;
    }
    if (first.domOrder !== undefined && second.domOrder !== undefined && first.domOrder !== second.domOrder) {
      return first.domOrder - second.domOrder;
    }
    return first.url.localeCompare(second.url, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Finds a scrollable container inside the manga reading area (if one exists).
 *
 * @param root - Document or root element.
 * @returns Scrollable container HTMLElement or null.
 */
function findScrollableReaderContainer(root: Document = document): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[class*="reader"], [id*="reader"], [class*="viewport"], [class*="scroll-container"], main'
    )
  );
  for (const el of candidates) {
    const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (!style) continue;
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      if (el.scrollHeight > el.clientHeight + 1) {
        return el;
      }
    }
  }
  return null;
}

/**
 * Promotes known lazy-load attributes directly on reader images to trigger instant preloading.
 *
 * @param root - Document or container to promote in.
 * @returns Number of promoted attributes.
 */
export function forcePromoteLazyAttributes(root: Document | Element = document): number {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img, picture img'));
  let promoted = 0;

  for (const img of imgs) {
    try {
      if ('loading' in img && img.loading !== 'eager') {
        img.loading = 'eager';
      }
    } catch {}
    if (!img.getAttribute('srcset')) {
      for (const attr of LAZY_SRCSET_ATTRIBUTES) {
        const srcsetVal = img.getAttribute(attr);
        if (srcsetVal && !isPlaceholderSource(srcsetVal)) {
          img.setAttribute('srcset', srcsetVal);
          promoted++;
          break;
        }
      }
    }
    for (const attr of LAZY_IMAGE_ATTRIBUTES) {
      const val = img.getAttribute(attr);
      if (val && !isPlaceholderSource(val) && (!img.src || isPlaceholderSource(img.src))) {
        try {
          const base = typeof window !== 'undefined' && window.location?.href ? window.location.href : 'http://localhost/';
          const absolute = new URL(val, base).href;
          img.src = absolute;
          promoted++;
          break;
        } catch {}
      }
    }
  }
  return promoted;
}

/**
 * Programmatically scrolls down the page in small increments to trigger lazy-loads
 * and then restores the user's scroll position.
 * Ported from XianScan fastScrollPreload.
 *
 * @param root - Document to scroll.
 * @param customSelector - Optional custom selector override.
 * @param isTranslatedCheck - Optional check if a URL is translated.
 * @returns Scanned images after fast scroll.
 */
export async function fastScrollPreload(
  root: Document = document,
  customSelector?: string,
  isTranslatedCheck?: (url: string) => { isTranslated: boolean; translatedUrl?: string }
): Promise<ScannedPageImage[]> {
  forcePromoteLazyAttributes(root);

  const viewportH = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 1200;
  const step = Math.max(800, Math.round(viewportH * 0.85));
  const delay = 15;
  const maxDurationMs = 6000;
  const startedAt = Date.now();
  const initScrollY = typeof window !== 'undefined' ? window.scrollY : 0;

  type ScrollTarget = {
    getMax: () => number;
    init: number;
    set: (y: number) => void;
  };
  const targets: ScrollTarget[] = [];

  if (typeof window !== 'undefined') {
    targets.push({
      getMax: () => Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0),
      init: initScrollY,
      set: (y) => {
        window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
      },
    });
  }

  const inner = findScrollableReaderContainer(root);
  if (inner) {
    targets.push({
      getMax: () => inner.scrollHeight,
      init: inner.scrollTop,
      set: (y) => {
        inner.scrollTop = y;
        inner.dispatchEvent(new Event('scroll', { bubbles: true }));
      },
    });
  }

  for (const target of targets) {
    let currentY = 0;
    let maxCycles = 180;
    try {
      while (currentY < target.getMax() && maxCycles > 0 && Date.now() - startedAt < maxDurationMs) {
        currentY += step;
        target.set(currentY);
        maxCycles--;

        forcePromoteLazyAttributes(root);
        await new Promise((r) => setTimeout(r, delay));
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('scroll'));
      }
      await new Promise((r) => setTimeout(r, 40));
    } finally {
      target.set(target.init);
    }
  }

  return scanChapterPages(root, customSelector, isTranslatedCheck);
}

/**
 * Checks whether an unmeasured/unloaded image looks like a legitimate pending chapter page
 * rather than small site UI chrome (avatar/logo/header/nav/ad).
 */
function isPendingChapterImage(img: HTMLImageElement, rawUrl: string, matchedCustomSelector: boolean): boolean {
  if (!matchedCustomSelector) {
    if (AD_NOISE_SELECTOR && img.closest(AD_NOISE_SELECTOR)) return false;
    if (img.closest('nav, header, footer, aside')) return false;
    if (UI_NOISE_ASSET_RE.test(rawUrl)) return false;
  }
  const rect = img.getBoundingClientRect();
  const attrW = Number(img.getAttribute('width')) || 0;
  const attrH = Number(img.getAttribute('height')) || 0;
  const loadedTooSmall = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 &&
    (img.naturalWidth < 150 || img.naturalHeight < 150);
  if (loadedTooSmall && !matchedCustomSelector) return false;
  const measuredTooSmall = rect.width > 0 && rect.height > 0 && (rect.width < 150 || rect.height < 150) &&
    attrW < 150 && attrH < 150;
  if (measuredTooSmall && !matchedCustomSelector) return false;
  const hasLazyAttr = LAZY_IMAGE_ATTRIBUTES.some((a) => Boolean(img.getAttribute(a))) ||
    LAZY_SRCSET_ATTRIBUTES.some((a) => Boolean(img.getAttribute(a)));
  const inReaderContainer = Boolean(READER_CONTAINER_SELECTOR && img.closest(READER_CONTAINER_SELECTOR));
  return matchedCustomSelector || hasLazyAttr || inReaderContainer || !img.complete || img.naturalWidth === 0 || (attrW >= 150 && attrH >= 150);
}

/**
 * Scans the active page DOM for eligible manga/comic images, computes their
 * document coordinates, and returns a clean, deduplicated, sorted list.
 *
 * @param root - Document or container to scan.
 * @param customSelector - Optional custom selector override.
 * @param isTranslatedCheck - Optional check if a URL is translated.
 * @returns Ordered array of ScannedPageImage.
 */
export function scanChapterPages(
  root: Document | Element = document,
  customSelector?: string,
  isTranslatedCheck?: (url: string) => { isTranslated: boolean; translatedUrl?: string }
): ScannedPageImage[] {
  const mediaTargets = discoverMediaTargets(root, customSelector);
  const seenUrls = new Set<string>();
  const seenElements = new Set<Element>();
  const scanned: ScannedPageImage[] = [];
  let domOrder = 0;

  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;

  const pushCandidate = (rawUrl: string, el: Element | null, imgEl?: HTMLImageElement): void => {
    if (!rawUrl || isPlaceholderSource(rawUrl)) return;
    const canonical = normalizeMediaUrl(rawUrl);
    if (seenUrls.has(canonical)) return;
    seenUrls.add(canonical);
    if (el) seenElements.add(el);

    let width = 0;
    let height = 0;
    let top = 0;
    let left = 0;

    if (el) {
      const rect = el.getBoundingClientRect();
      const attrW = el instanceof HTMLImageElement ? Number(el.getAttribute('width')) || 0 : 0;
      const attrH = el instanceof HTMLImageElement ? Number(el.getAttribute('height')) || 0 : 0;
      width = imgEl?.naturalWidth || Math.round(rect.width) || attrW;
      height = imgEl?.naturalHeight || Math.round(rect.height) || attrH;
      top = Math.round(rect.top + scrollY);
      left = Math.round(rect.left + scrollX);
    }

    const check = isTranslatedCheck ? isTranslatedCheck(rawUrl) : { isTranslated: false };
    const hasDomTranslated = el?.getAttribute('data-kites-translated') === 'true';

    scanned.push({
      id: canonical || rawUrl,
      url: rawUrl,
      width,
      height,
      top,
      left,
      isTranslated: check.isTranslated || hasDomTranslated,
      translatedUrl: check.translatedUrl,
      domOrder: domOrder++,
    });
  };

  for (const target of mediaTargets) {
    const el = target.imgElement || target.surfaceElement;
    pushCandidate(target.srcUrl, el, target.imgElement);
  }

  // Fallback pass for unloaded/lazy 0x0 chapter <img> nodes that discoverMediaTargets skipped
  const selector = customSelector || 'img, picture img';
  const candidateImgs = Array.from(root.querySelectorAll<HTMLImageElement>(selector));
  for (const img of candidateImgs) {
    if (seenElements.has(img)) continue;
    const rawUrl = resolveImageSource(img);
    if (!rawUrl || isPlaceholderSource(rawUrl)) continue;
    if (!isPendingChapterImage(img, rawUrl, Boolean(customSelector))) continue;
    pushCandidate(rawUrl, img, img);
  }

  // Filter noise and sort spatially
  const clean = filterResolutionOutliers(filterOutlierThumbnails(scanned));
  return sortScannedImages(clean);
}
