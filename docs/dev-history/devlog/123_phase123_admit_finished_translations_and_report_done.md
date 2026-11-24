# Devlog 123: A finished translation is admitted by evicting the archive, and the card reads Done

- **Date:** 2026-11-24
- **Feature/Task:** Translate Page batch queue — artwork replacement and card status
- **Status:** main

## Objective

After pressing Translate in the batch panel, every page that finished translating must show its
translated artwork on the page, and its card must read `Done` instead of falling back to `Ready`.

## Root causes

Both were reported together and are independent.

1. **The content-side session budget refused the newest result.** `complete()` in
   `src/content/chapterZip.ts` compared the incoming encoded bytes against
   `SESSION_IMAGE_BYTE_LIMIT` (128 MiB, `src/content/chapterZip.ts:6`) and, on overflow, logged
   `Result not retained: session image limit reached` and returned `undefined`. The content script
   then had no record to apply, so the page kept its original artwork while the background job
   still marked itself `completed` (`src/background/index.ts:1454`). Tall manga pages are ~10.7 MiB
   of baked payload each, so a 12-page chapter crossed 128 MiB mid-queue. Proven from the user's own
   console capture of `omegascans.org` chapter-6:

   ```
   [Content Script] Received translated image for: .../12-tzrlz92ngf0afo6v65hly5e4.jpg
   [ChapterTranslationRegistry] Result not retained: session image limit reached (128.2 MiB > 128 MiB)
   ```
   Pages 03, 05–11 and 13 logged `Successfully replaced image for:` in the same run, which isolates
   the failure to the budget branch rather than to target discovery or message routing.

2. **The card badge ignored a live completed job.** `BatchScanPanel` derived `Done` only from
   `item.isTranslated`, which comes from the popup's own scan and is never refreshed after the queue
   drains (`pollQueueStatus` only writes `activeJobs`). The badge therefore fell through to the idle
   `Ready` pill even though `GET_QUEUE_STATUS` reported the job `completed`, and the same stale
   field kept the page counted as pending.

## Implementation

1. `src/content/chapterZip.ts` — added `evictOldestRetained(bytesNeeded, protectedUrl)`: when the
   budget would be exceeded it removes the oldest archived records (detached pages first, then
   oldest `sequence`, the admitted URL never a candidate), deletes their byte accounting, drops
   their `completedJobs` aliases and revokes their blob URLs. `complete()` now always admits the
   finished result; a single result larger than the whole budget is retained with a warning instead
   of being discarded. The refusal branch and its `return undefined` are gone.
2. `src/content/chapterZip.ts` — added `BYTES_PER_MIB` so no MiB conversion is written twice.
3. `src/content/index.tsx` — the `!record` branch no longer blames the limit (it can no longer fire
   for that reason) and reports the actual condition: no queue context and no attached element.
4. `src/popup/components/BatchScanPanel.tsx` — added `isItemTranslated(item)`: translated bytes from
   the content script *or* a live `completed` job. The card badge, the `Translated` footer and
   `pendingToTranslate` all use it, so a finished job renders Done and is never re-queued.

The badge therefore reports "the background job finished", not "the page repainted". A job that
completed while its element was detached still reads Done in this popup session; the content console
prints `Translation not applied: no queue context or attached media element`, and reopening the
popup re-scans the page, which drops it back to selectable when no record exists.

Not ported from anywhere: this is queue plumbing, not donor lettering math.

## Evidence

- New regression tests written before the fix and observed failing:
  - `src/content/chapterZip.test.ts` — "evicts the oldest retained result instead of dropping a
    finished translation" (budget 10 B, two 6 B results, then a 30 B result) and "evicts detached
    pages before connected ones when the budget is exceeded" (12 B budget, detached newer record is
    the one evicted).
  - `src/popup/components/BatchScanPanel.test.tsx` — "renders Done for pages whose background job
    already completed" (one `completed` job, one pending page, asserts `Done`, `Translated` and
    `Translate 1 Pages (1 already done)`).
- `npx vitest run src/content/chapterZip.test.ts src/popup/components/BatchScanPanel.test.tsx`:
  29 passed / 0 failed after the fix (3 failed before it).
- `npm test`: 142 files, 1696 tests passed.
- `npm run lint`: 0 errors, 59 warnings, all pre-existing (the touched lines produce none).
- `npm run build`: exit 0.
- `npm run docs:api`: exit 0, no warnings.
- `npm run docs:check`: exit 1 with 11 `param-missing` violations in
  `src/offscreen/utils/canvasTypesetting.ts`, `src/offscreen/utils/cotransDefaultRenderer.ts`,
  `src/offscreen/utils/renderer/regionGeometry.ts` and `src/shared/fontLibrary.ts` — files this
  change did not modify, so the tree fails the ratchet independently of this work.
- `npm run gate:translation` was not run: none of the changed files appear in the tracked list in
  `scripts/translation-gate.mjs`, so the pipeline fingerprint is unchanged.
- **Not verified in a browser.** The fix is proven at the registry and component contract level; the
  chapter that produced the log above was not re-run, so "the artwork now repaints" rests on the unit
  contract plus the log isolating the branch.

## Decision

**A bounded session budget may evict the oldest archived result, but it must never refuse the result
the page is waiting for.** Retention exists to bound memory and to make the ZIP export possible; it
is not a licence to drop a finished translation, because the job has already reported success and
the user sees unchanged artwork. Detached pages are evicted before connected ones — their bytes can
never be re-shown — and a single oversized result is retained with a warning rather than discarded.
Status surfaces read live job state, not only the snapshot the popup scanned at open time.
