# Devlog 122: Fast Scan reaches embedded readers and can be stopped

- **Date:** 2026-11-24
- **Feature/Task:** Fast Scan returned nothing on readers embedded in an iframe and gave no feedback while it swept.
- **Status:** Shipped on `main`; unit-tested with mocked frames, not with a live iframe reader.

## Objective

Two follow-ups approved after devlog 121:

1. A reader hosted inside an iframe must be scannable (both the snapshot scan and Fast Scan).
2. A long sweep must show how many pages it has found so far and stop on demand, keeping what it found.

## Design constraint: frame ids without a new permission

`manifest.json` grants `activeTab`, `storage`, `contextMenus`, `offscreen`, `identity`,
`declarativeNetRequestWithHostAccess`, `unlimitedStorage` and `<all_urls>` host permissions — but **not**
`webNavigation` or `scripting`. The content script is registered with `all_frames: true`, so it already runs
inside sub-frames; only the popup's requests were pinned to `frameId: 0`.

Enumerating frames would need `chrome.webNavigation.getAllFrames`. That permission adds a "Read your
browsing history" install warning on a published extension, so it is deliberately not added. Instead the
popup probes frame ids `0…MAX_PROBED_FRAME_ID` (9) with the read-only `SCAN_CHAPTER_PAGES` request and keeps
the frame that reports the most pages. A missing content script is a cheap rejected message, caught per
frame. Chrome numbers sub-frames from 1, and a reader is virtually always the first embed, so 9 slots cover
real pages; a deeper embed would need the range raised.

## Implementation

`src/popup/components/BatchScanPanel.tsx`:

- `scanFrame(tabId, frameId)` sends one snapshot scan and turns "no content script here" into an empty
  result carrying `connectionError`.
- `scanBestFrame(tabId)` probes `0…9` in parallel and keeps the frame with the most pages; ties prefer the
  top frame. It also reports the top frame's connection error so the existing "Extension updated / reload
  this tab" prompt still appears.
- Both the snapshot scan and Fast Scan now use the picked frame; the id is kept in `scanFrameIdRef` so the
  cancel request reaches the same frame. Fast Scan picks the frame first (one cheap snapshot round trip)
  instead of blindly sweeping the top frame.
- The Fast Scan button becomes **Stop** while sweeping (`handleCancelFastScan` sends `FAST_SCAN_CANCEL`);
  the button stays enabled during the sweep so the stop is reachable.
- A `runtime.onMessage` listener mirrors `FAST_SCAN_PROGRESS` into the status line
  (`Scanning… found N pages.`), and a cancelled sweep reports `Scan stopped: kept N pages.`

`src/content/scanner.ts`:

- `fastScrollPreload()` gained an optional fourth argument `FastScrollOptions { isCancelled, onProgress }`.
  The cancellation check runs at the top of every step; a cancelled sweep breaks out of the target loop,
  still restores the reader's scroll position in the existing `finally`, skips the final settle/harvest, and
  returns what was accumulated.
- Progress is throttled by `FAST_SCROLL_PROGRESS_INTERVAL_MS` (200 ms) and emitted once more when the sweep
  ends, so the popup sees a truthful final count.

`src/content/index.tsx`: a module-scoped `fastScanCancelled` flag reset at the start of every sweep, a
`FAST_SCAN_CANCEL` message that sets it, and a best-effort `FAST_SCAN_PROGRESS` relay to the popup (the
popup may already be closed, so the rejection is swallowed). The `FAST_SCROLL_PRELOAD` response now carries
`cancelled` so the popup can word the result honestly. ZIP export and the chapter reader stay top-frame
only — the comment above the listener records that rule.

## Evidence

- `src/content/scanner.test.ts`: virtualized-reader fixture extracted to `createVirtualizedReader()` and
  reused by a new cancel test — cancel after three checks returns 3 pages out of 12, still reports the final
  progress count, and restores `scrollTop` to 0.
- `src/popup/components/BatchScanPanel.test.tsx`: a running Fast Scan exposes **Stop**, and clicking it sends
  `FAST_SCAN_CANCEL` to frame 0 (the frame the sweep picked). The existing Fast Scan test still asserts
  `{ frameId: 0 }` after the probe round trip.
- Gates: `npx tsc -b` exit 0; `npx vitest run src/` **1694/1694** in 142 files; `npm run lint` 0 errors /
  59 pre-existing warnings.

Note: the existing chapter-reader test leaves the jsdom environment unusable for any test declared after it
at `HEAD` as well (verified by adding a probe test to the committed file), so the new popup test is declared
above it with a one-line comment.

## Decision and trade-offs

- Probe instead of requesting `webNavigation`: no install-warning change for a published extension, at the
  cost of a bounded frame-id range and ten cheap messages per scan.
- Run the snapshot probe before every Fast Scan: one extra round trip (milliseconds) in exchange for
  sweeping the frame that actually holds the reader.
- Cancel is cooperative and keeps partial results: the sweep is a view of the DOM, so throwing away pages
  already discovered would be strictly worse than keeping them.
- Progress travels over `runtime.sendMessage` rather than a long-lived port: no new protocol, at the cost of
  being best-effort when the popup closes.

## Remaining limitations

- Frame ids above `MAX_PROBED_FRAME_ID` (9) are not probed.
- Only the frame with the most pages is scanned; pages spread across several frames are not merged (rects in
  different frames are not comparable without mapping through the frame element).
- Progress is not scoped to the sending tab, so two tabs sweeping at once would share the status line.
- No live iframe-page acceptance run yet.
