# Devlog 125: Max Queue Capacity reports what it refuses

- **Date:** 2026-11-25
- **Feature/Task:** Translate Page batch queue — admission reporting and the "Max Queue Capacity" scope
- **Status:** main

## Objective

Two questions had to be answered with evidence, not opinion: does the popup's **Max Queue Capacity**
slider actually govern the translation queue, and why does a `Translate Page` batch look like it
ignores the slider? Where the answer was "it does not work", it had to start working.

## Root causes

1. **The slider works, but only for the single-image queue.** `src/popup/components/SettingsView.tsx:251-274`
   writes `concurrency`, `src/popup/index.tsx` persists the whole state under
   `STORAGE_KEYS.POPUP_STATE`, and `queueTranslation` in `src/background/index.ts` clamps and enforces
   it for hover-button, auto-translate and Crop & Translate requests. `src/background/queueResilience.test.ts`
   ("queue capacity limit") already proved that a third request behind two waiting jobs is refused with
   `TRANSLATION_ERROR`. The batch path deliberately uses `MAX_BATCH_QUEUE_CAPACITY` instead, which
   `docs/fullplan.md:8` records as design, not a defect.
2. **The real defect was the refusal report.** The `BATCH_QUEUE_TRANSLATIONS` handler did
   `await queueTranslation(...); queuedCount++` for every URL. `queueTranslation` returned `undefined`
   on both of its early exits (duplicate in flight, queue full), so the count measured attempts, never
   admissions. `src/popup/components/BatchScanPanel.tsx` trusted that number, set every requested page
   to `status: 'queued'` and printed "Queued N pages. Starting sequential translation." A refused page
   has no job row, so `GET_QUEUE_STATUS` never mentions it: its card spun "Queued" forever, and pressing
   Translate again re-sent it with no explanation.
3. **A latent suite bug surfaced while placing the new test.** `BatchScanPanel` closes the popup after
   launching the reader (`src/popup/components/BatchScanPanel.tsx:472,499`). In jsdom, `window.close()`
   tears the document down, so every test added after the reader test ran without a `document` and threw
   in the shared `beforeEach`. The suite had exactly five tests before this change, so nothing exposed it.

## Implementation

1. `src/shared/constants.ts` — `MAX_BATCH_QUEUE_CAPACITY` moved here from `src/background/index.ts`, so
   the background gate, the panel's over-limit message and the settings hint read one value (AGENTS.md §3).
2. `src/background/index.ts` — `QueueAdmission = 'queued' | 'duplicate' | 'capacity'`; `queueTranslation`
   returns it. The interactive capacity clamp moved into `resolveInteractiveQueueCapacity` +
   `readInteractiveQueueCapacity`, which `queueCapturedTranslation` now shares instead of repeating the
   `Math.min(10, Math.max(1, …))` expression. New exported `queueBatchTranslations(urls, tabId)` returns
   `{ queuedCount, rejectedUrls, capacity }`; duplicates in flight count as admitted, refusals are named.
   The message handler responds with `rejectedUrls` and `capacity` and logs the refusal ratio.
3. `src/popup/components/BatchScanPanel.tsx` — refused URLs become `status: 'error'` (the existing Retry
   pill) and stay in `pendingToTranslate`; the message becomes "Queued X of N pages — queue limit 100
   reached. Press Translate again as pages finish."
4. `src/popup/components/SettingsView.tsx` — the hint now states the scope: the slider bounds the
   single-image queue, batches queue up to `MAX_BATCH_QUEUE_CAPACITY` pages.
5. Tests — `src/background/queueResilience.test.ts` gains "reports the pages a full batch queue refused
   instead of counting them as queued" and "counts an already queued page as admitted rather than
   refused"; `src/popup/components/BatchScanPanel.test.tsx` gains "marks the pages a full batch queue
   refused so they can be retried" and stubs `window.close` in its `beforeEach`.

## Evidence

- `npx vitest run src/background/queueResilience.test.ts src/popup/components/BatchScanPanel.test.tsx
  src/popup/components/SettingsView.test.tsx` — 31 tests in 3 files passed.
- `npm test` — 142 files, 1700 tests passed (1697 before this change).
- `npm run lint` — exit 0, 59 warnings, 0 errors (same warnings as the previous commit).
- `npm run build` — exit 0.
- `npm run docs:api` — exit 0. `npm run docs:check` — exit 1 with the same 11 pre-existing
  `param-missing` violations in `src/offscreen/utils/canvasTypesetting.ts`,
  `src/offscreen/utils/cotransDefaultRenderer.ts`, `src/offscreen/utils/renderer/regionGeometry.ts`
  and `src/shared/fontLibrary.ts`; none are in files this change touched.
- `npm run gate:translation` not run: `scripts/translation-gate.mjs` tracks the offscreen translation
  and OCR pipeline, not `src/background/`, `src/popup/` or `src/shared/constants.ts`.
- Not verified in a browser. The refusal path is proven at the unit level only; a chapter longer than
  100 pages in a real Chrome session was not exercised.

## Decision

**A capacity guard must report what it refused.** A caller cannot tell "queued" from "dropped" by
counting calls, so the admission decision is now a return value, and every UI that queues work renders
the refusal instead of a spinner. The slider's scope stays as designed — batches keep their fixed cap —
but the settings hint and the panel both say so, because a control that silently means something
narrower than its label is indistinguishable from a broken control.

## Roadblocks

- The new popup test failed with `Cannot read properties of undefined (reading 'createElement')` at 3 ms.
  A shuffled-order run showed the failure following the reader test rather than the new test, which
  pointed at `window.close()` rather than at the assertion. `vi.spyOn(window, 'close')` fixed it.
- Considered and rejected: putting the batch cap on the slider. It would have made a 40-page chapter
  refuse itself page by page, and `docs/fullplan.md:8` chose capacity-per-scope deliberately.
