# Devlog 124: Auto-translate stops paying twice for pages that already show translated bytes

- **Date:** 2026-11-25
- **Feature/Task:** Translate Page batch queue — auto-translate fence on scroll-back
- **Status:** main

## Objective

After the batch queue reports every page `Done`, scrolling through the chapter must not translate any
of those pages again. Reported after the previous devlog shipped: the queue finished, the reader
scrolled, and the extension re-translated the same pages a second time (a second paid pass).

## Root cause

`queueVisibleImage` in `src/content/index.tsx` gated every viewport entry on two in-memory
structures only: `translatedSources` (a `WeakSet` of elements the effect had personally seen mutated
into a translated state) and `queuedUrls` (URLs this effect instance had sent). Neither knows about
pages replaced by another route — the batch queue, the reader, or the context-menu command all call
`translatedRegistry.complete()` → `replaceImageWithTranslation()` directly, so those pages never enter
the auto effect's bookkeeping. `translatedSources` cannot learn about them afterwards either, because
`replaceImageWithTranslation` writes inside `runSelfMutation` and the content `MutationObserver`
returns early on `isSelfMutating` (`src/content/index.tsx:2153`, `src/content/imageReplacer.ts:175`).

The user's earlier console capture already contained the pair that proves it:

```
[Content Script] Successfully replaced image for: .../03-attfinometj2evjv5xkcua78.jpg
[Content Script] Auto-Translating visible image: .../03-attfinometj2evjv5xkcua78.jpg
```

The replacement succeeded, and the auto fence queued the same URL immediately afterwards.

## Implementation

1. `src/content/mediaTargets.ts` — new exported predicate `isTargetTranslated(target)`: true when
   `sourceElement` or `surfaceElement` carries `data-kites-translated="true"`. It lives next to
   `createMediaTarget` because that module already owns every DOM attribute contract for media
   targets, and the predicate is exported so the auto effect does not grow new logic
   (`src/content/index.tsx` must stay a router, not an algorithm).
2. `src/content/index.tsx` — `queueVisibleImage` now returns early for a translated target and
   records the element in `translatedSources`, so repeated intersections cost one attribute read.

Deliberately **not** a registry lookup: `resolveElementSource` clears the Kites attributes when the
host recycles an element for a genuinely new image (`src/content/mediaTargets.ts:182-187`,
`src/content/imageReplacer.ts:196-209`), and a recycled element needs re-applying even though an
archived record for its URL exists. The DOM attribute is the only signal that distinguishes "already
translated" from "translated before, now showing something else".

## Evidence

- New regression test `does not re-queue a page that already shows translated bytes`
  (`src/content/readingIntegration.test.tsx`): a target carrying
  `data-kites-orig-src` / `data-kites-applied-src` / `data-kites-translated` and a `blob:` src, with
  auto-translate on and a `VisibleIntersectionObserver`, must not receive a `TRANSLATE_IMAGE`
  message. Red before the fix (`Number of calls: 1`), green after.
- `npx vitest run src/content/readingIntegration.test.tsx` → 13 passed.
- `npm test` → 142 files, 1697 tests passed.
- `npm run lint` → 0 errors, 59 pre-existing warnings (none on the touched lines).
- `npm run build` → exit 0. `npm run docs:api` → exit 0.
- `npm run docs:check` → still the 11 pre-existing `param-missing` violations in
  `src/offscreen/utils/*` and `src/shared/fontLibrary.ts`; no new violation from
  `isTargetTranslated`.
- `npm run gate:translation` not run: `scripts/translation-gate.mjs` fingerprints the OCR/LLM
  services (`src/offscreen/engines/**`, `src/shared/translation/**`, …) and does not track
  `src/content/**`; this change alters no translation math.

## Decision

- **The DOM is the fence, the sets are only a cache.** Any skip test that relies on in-memory
  bookkeeping alone will re-pay for work done by another route, because every route converges on the
  same DOM attribute.
- **Residual risk, accepted for now:** a virtualized reader that destroys and recreates the `<img>`
  for the same URL hands auto-translate a fresh element with no attributes, so that page is
  translated again. Re-applying an archived record instead of re-translating would need a
  registry-first branch on recycled elements; not built because it is a different symptom (the page
  is blank, not already translated) and the reported bug does not involve elements being recreated.
