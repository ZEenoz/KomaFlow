# Devlog 121: Fast Scan accumulates pages during the sweep instead of scanning once at the end

- **Date:** 2026-11-24
- **Feature/Task:** Fast Scan reported only the first screenful of pages on readers that recycle page nodes.
- **Status:** Shipped on `main`; verified with a scripted virtualized-reader fixture, not with a live site.

## Objective

Fast Scan must return every page the reader is willing to mount during one sweep. The user asked for a
way to make Fast Scan cover all pages, or for a better scanning strategy overall.

`docs/dev-history/plans/reader-studio-runtime-improvement-plan.md` §5.6 already required the shape of the
fix ("accumulate eligible discoveries during the scan, deduplicate them, retain their order/source scope,
restore the previous scroll position, and report the discovered count"); this devlog records the
implementation and the measured before/after.

## Root causes

### 1. The DOM was harvested only after the scroll position was restored

`fastScrollPreload()` (`src/content/scanner.ts`) scrolled the window and the inner reader container to the
bottom and called `scanChapterPages()` **after** the `finally` block had restored the original scroll
position:

```ts
try { /* sweep */ } finally { target.set(target.init); }
...
return scanChapterPages(root, customSelector, isTranslatedCheck);
```

Readers that recycle page nodes — react-window/virtuoso style virtualization, paged viewers, sites that
detach offscreen pages on scroll-back — had already unmounted everything the sweep mounted. Whatever pages
lived between the first screenful and the bottom were never observed, so Fast Scan reported only the
viewport-sized remainder.

### 2. The sweep budget was too small and did not react to growth

The old loop used a 15 ms settle, a 6000 ms wall-clock budget and a 180-cycle cap, with a hard
`while (currentY < target.getMax())` exit. Two consequences:

- 15 ms is roughly one task: framework re-renders and `IntersectionObserver` callbacks that assign `src`
  often had not run yet when the next step moved on.
- 180 cycles × `max(800, 0.85 × viewportH)` ≈ 144 000 px, i.e. roughly 144 pages of 1000 px. Longer
  webtoon chapters were silently truncated, and grids that only extend `scrollHeight` after a mount could
  end the sweep on the first growth step.

### 3. Only the top frame was ever scanned (not fixed here)

The popup sends both scan requests with `{ frameId: 0 }`, and the content script is registered with
`all_frames: true` (`manifest.json:87`, `:97`). A reader embedded in an iframe therefore answers nothing.
Merging frames needs a documented cross-frame ordering rule (rects in different frames are not comparable
without mapping through the frame element), so it is left as a recorded limitation rather than guessed.

## Implementation

`src/content/scanner.ts`:

1. `scanChapterPages()` split into `collectChapterCandidates()` (dedupe + geometry, no filtering) and
   `finalizeScannedImages()` (the existing `filterOutlierThumbnails` → `filterResolutionOutliers` →
   `sortScannedImages` chain). The public signature is unchanged; filters now run **once** over the union
   instead of once per partial scan.
2. `collectChapterCandidates()` takes an optional `scrollOffsetY`. Container scrolling shifts
   `getBoundingClientRect()` without moving the window, so an inner-container scan adds the container's own
   `scrollTop` to recover true document coordinates (previously such entries collapsed to `top ≈ 0` and
   lost their order).
3. `fastScrollPreload()` keeps a `Map<string, ScannedPageImage>` keyed by the normalized id and harvests
   before the sweep, after **every** step, after the post-sweep settle, and again after the scroll is
   restored. Unmeasured observations (width 0) are replaced by measured ones; translated flags are OR-ed.
4. The loop is growth-aware: reaching the current bottom no longer ends the sweep, it keeps stepping while
   content grows; 12 consecutive cycles without a new page **and** without growth end that target early.
5. Named constants replace the inline numbers: `FAST_SCROLL_STEP_VIEWPORT_RATIO` 0.85,
   `FAST_SCROLL_MIN_STEP_PX` 800, `FAST_SCROLL_STEP_SETTLE_MS` 40, `FAST_SCROLL_MAX_DURATION_MS` 12000,
   `FAST_SCROLL_MAX_CYCLES` 400, `FAST_SCROLL_STALL_CYCLES` 12, `FAST_SCROLL_FINAL_SETTLE_MS` 120.

`src/popup/components/BatchScanPanel.tsx`: the button tooltip now says what the action really does
("Scroll the reader and collect every page it mounts (lazy, virtualized or paged)").

`src/popup/components/BatchScanPanel.test.tsx`: the Fast Scan button is found by its visible label instead
of by tooltip text, so descriptive copy stays free to change.

## Evidence

Virtualized-reader fixture (`src/content/scanner.test.ts`, 8 pages of 1000 px, only 2 mounted at a time,
`scrollTop` restored to 0 afterwards):

| Build | Pages returned | Document offsets |
|---|---|---|
| `HEAD` (scan after restore) | 2 | viewport remainder only |
| This change (harvest per step) | 8 | 0, 1000, … 7000 |

The new test fails on the old code (`expected [ …(2) ] to deeply equal [ …(8) ]`) and passes after it, and
it also asserts the scroll position is restored.

Worst-case coverage ceiling: old 180 cycles ≈ 144 000 px; new 400 cycles / 12 s at a 40 ms settle ≈ 300
cycles ≈ 240 000 px, with early exit once a reader stops growing (≈ 480 ms of no progress).

Gates: `npx tsc -b` exit 0; `npx vitest run src/content src/popup` 217/217 in 22 files;
`npm run lint` 0 errors / 59 pre-existing warnings.

## Decision and trade-offs

- Accumulate in one map, finalize once. This reuses the existing filters and sort instead of adding a
  second discovery pipeline, and keeps `SCAN_CHAPTER_PAGES` (the manual rescan) byte-compatible.
- Settle 40 ms per step and allow a 12 s budget. The sweep is slower in the worst case than the old 6 s
  cap, but the stall exit keeps ordinary chapters at a few hundred milliseconds per target, and a partial
  scan is a correctness failure while a slower scan is a latency cost.
- Per-step harvesting re-runs the full media discovery on the mounted DOM. That is cheap exactly where it
  matters (virtualized readers keep few nodes) and is bounded by the cycle budget elsewhere.

## Remaining limitations

- iframe-hosted readers are still invisible (`frameId: 0`), see root cause 3.
- Pages a site fetches without ever mounting (network-only image lists, canvas renderers that paint from a
  fetched buffer without a per-page URL) cannot be discovered from the DOM; a `performance` resource-entry
  discovery tier would be a separate, geometry-less mechanism.
- No live-site acceptance run yet; the proof is a scripted fixture plus unit gates.
