# Devlog 126: A reloaded chapter asks for its translations back instead of buying them again

- **Date:** 2026-11-25
- **Feature/Task:** Translate Page — restoring stored pages after F5, and honest Done reporting
- **Status:** main

## Objective

Two reports had to be answered with a real browser, not from reading the diff:

1. The slider was set to 5, yet `Translate Page` still ran one page at a time and the rest waited in
   the queue.
2. After an F5 the batch panel said `Done` for every page while the page itself was still in English.

The second one had to stop happening, and the fix had to be observed on a real chapter in the user's
own browser (Brave), not inferred.

## Root causes

1. **A reload destroys every in-page record of a translation.** `translatedRegistry` lives in the
   content script, and the `data-kites-translated` / `data-kites-applied-src` attributes die with the
   document. A grep for `reapply|rehydrate|restore` found only `reapplyMediaTargetStyles`
   (`src/content/mediaTargets.ts:53`), which re-applies CSS, not pixels. Nothing asked the background
   "do you already have this page?".
2. **`Done` was a historical database fact.** `GET_QUEUE_STATUS` returns the whole
   `db.translationJobs` table, and the badge treated any `completed` row for a URL as Done
   (`isItemTranslated`), so after a reload the panel showed 13/13 Done over English artwork and
   disabled the Translate button — there was no way to translate those pages again, or to get the
   translation back, which is a dead end rather than a stale label.
3. **Selected item copies went stale.** `selectedMap` stored item objects captured when the user
   ticked them, so a page that later became `Done` or restored still counted as pending and offered
   itself for translation again.
4. **The batch pipeline is serial by design, and the slider never meant parallelism.**
   `processQueue()` (`src/background/index.ts`) keeps `if (activeCount >= 1) return;` because WebGPU
   and ONNX Runtime Web JSEP require serialized execution on the offscreen thread. The slider bounds
   how many jobs may wait, batches use `MAX_BATCH_QUEUE_CAPACITY`. Nothing to fix for report 1; the
   behaviour matches `docs/fullplan.md:8` and the settings hint.

## Implementation

1. `src/background/index.ts` — `TranslationJob` now records the language a page was baked in
   (`targetLang`, from `popupState`), so reuse can never hand Thai lettering to a reader who switched
   to Vietnamese. New `readPopupState()` replaces the per-gate storage reads.
2. `findStoredTranslation(srcUrl, targetLang)` returns the newest completed job for that URL whose
   images row still has a `bakedImageBlob`; jobs created before the language was recorded carry no
   `targetLang` and stay reusable. `deliverStoredTranslation` hands it back through the existing
   `IMAGE_TRANSLATED` path, so the content script applies it through one code path and pays nothing.
3. `TRANSLATE_IMAGE` and `queueBatchTranslations` consult it first; the batch answers with
   `restoredUrls` so the panel can distinguish "restored" from "queued".
4. `src/popup/components/BatchScanPanel.tsx` — Done now requires either the page's own
   `isTranslated` or a `completed` job for a page that was queued in *this* panel session
   (`queuedHereRef`); restored pages are marked `Done`/`completed` from the response; `selectedList`
   resolves selected ids against the live item lists, so a stale copy cannot count as pending.

## Evidence

- Browser (Brave, unpacked extension 1.5.2, `omegascans.org` chapter 9, 13 pages, F5):
  - Before: batch panel `13 / 13 pages`, every card `✓ Done`, footer `Translated`, button disabled with
    `All 13 Selected Pages Done`; the chapter still read English ("IF IT'S A SCAREDY CAT LIKE ME…"
    plus Korean SFX `쫄깃`).
  - After the first pass: F5 left every card `Ready` and the button reading
    `Translate 13 Selected Pages`; pressing it produced
    `Restored 13 already translated pages. Queued 0 pages.` with all cards `✓ Done` / `Translated`,
    and the visible bubble rendered Thai
    (`ถ้าเป็นคนขี้ล้วมแมน ถึงจะมองหาวิธีที่มันปลอดภัยกว่านี้หน่อย... อะไรประมาณนั้นมั้ง?`).
  - Final pass on the committed build: text is now
    `Restored 13 already translated pages — nothing left to translate.`, the button disables itself
    with `All 13 Selected Pages Done`, and the reloaded page shows the Thai artwork again.
- Unit: `npx vitest run src/background/queueResilience.test.ts src/popup/components/BatchScanPanel.test.tsx`
  — 32 tests passed; the new cases cover restore, language mismatch, pruned page, the stale
  `completed` row, and the stale selection copy.
- `npm test` — 142 files, 1704 tests passed (1700 before this change).
- `npm run lint` — exit 0, 59 warnings, 0 errors (the same warnings as the previous commit).
- `npm run build` — exit 0, `✓ built in 3.11s`; `npm run docs:api` — exit 0.
- `npm run docs:check` — exit 1 with the same 11 pre-existing `param-missing` violations in
  `src/offscreen/utils/canvasTypesetting.ts`, `src/offscreen/utils/cotransDefaultRenderer.ts`,
  `src/offscreen/utils/renderer/regionGeometry.ts` and `src/shared/fontLibrary.ts`; none of them are
  in files this change touched.
- `npm run gate:translation` not run: `scripts/translation-gate.mjs` tracks the offscreen translation
  and OCR pipeline, not `src/background/`, `src/popup/`.

## Decision

**A translation the user already paid for is content, not a session artifact.** The page asks for it
back by URL before the pipeline is allowed to charge for it again, and a page is only `Done` if the
translations exist for *this* visit. Reuse is keyed on URL plus target language, because silently
showing the previous language is worse than re-translating.

Report 1 needed no code change: serial execution is a hardware constraint of the offscreen WebGPU
pipeline, the slider has always bounded the waiting room rather than the concurrency, and the batch
path deliberately uses its own capacity. The answer is documentation and wording, not a diff.

## Roadblocks

- The first post-fix browser run still said `Queued 13 pages`. It was a stale extension instance:
  `dist/` had been rebuilt but the unpacked extension was not reloaded, and the service-worker probe
  showed the old build answering. Reloading the extension on `chrome://extensions` made the restore
  path work. Lesson: after every background change, reload the extension before judging behaviour.
- Two DevTools probes sent `BATCH_QUEUE_TRANSLATIONS` with `tabId: 403946268`, a tab captured from the
  studio page; the restore found nothing to deliver to and fell through to queueing. The probes proved
  the handler's shape, not the restore predicate — which is why the decisive test was the popup's own
  button in the chapter tab.
