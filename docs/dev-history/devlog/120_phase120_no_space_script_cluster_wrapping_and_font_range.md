# Devlog 120: No-space script cluster wrapping and a wider render font floor

- **Date:** 2026-11-24
- **Feature/Task:** Thai dialogue collapsed to the 6px floor; Text Rendering Options could not express a floor above 20px.
- **Status:** Shipped on `main` with the fix; visual page-level acceptance still pending (see Evidence).

## Objective

A Thai translation must fill the container it is given instead of collapsing to the minimum
font size, and the user must be able to type any allowed minimum font size in pixels.

Two screenshots opened the investigation: one-line Thai dialogue rendered small, and two-line Thai
dialogue rendered smaller still, both inside a balloon far larger than the text.

## Root causes

### 1. Thai took the Latin wrapping branch and then failed the clean-fit gate

`wrapText()` in `src/offscreen/utils/typesetLayout.ts` had three branches: CJK, and Latin. Thai fell
into the Latin branch. Thai has no inter-word spaces, so `paragraph.split(/\s+/)` produced one
unbreakable "word" for the whole sentence, and `breakLongWord()` then inserted a hard break marker
(`INSERTED_HYPHEN`) at an arbitrary character.

`fitFontSizeWithLines()` accepts a multi-line layout only if its lines carry no newly inserted
hyphen break:

```
hasNoHyphenBreaks = lines.every(l => (!l.endsWith('-') && !l.endsWith(INSERTED_HYPHEN)) || text.includes(l))
```

Thai could never satisfy that predicate, so Pass 1 (clean binary search) and Pass 4 (fallback search)
rejected every wrapped layout. Only single-line layouts — or the aspect-gated Pass 2 (`H/W >= 2.0`)
and Pass 3 (`H/W >= 1.5`) — could win, which is exactly why the two-line screenshot looked worse than
the one-line one.

A hyphenated Thai break is also invalid orthography on its own terms, so the invariant was correct
and the tokenizer was wrong.

### 2. Default bubble mode makes the OCR quad the container

With `bubbleMode: 'off'` (the documented default) the block renders through the free-region route and
the container is the detected text quad, not the visible balloon. A perfect fit is therefore still
bounded by the text box, which is why a large balloon can hold tiny type. This cause is **not** fixed
here: the user-side mitigation is Layout & Bubble Fit → Heuristic (or YOLO), which routes the same
text through `ContourDpTypesetter` and the balloon chamber. The default stays `off`.

## Implementation

1. `src/offscreen/utils/typesetLayout.ts` — new exported `tokenizeNoSpaceScript()`: atomic wrap units
   that are contiguous source slices (a Latin/digit run, a script cluster, or one punctuation
   character), so `text.includes(l)` keeps holding for every wrapped line.
   - `COMBINING_MARK_RE = /\p{M}/u` bars any Unicode mark from opening a line (script-agnostic, so Lao,
     Khmer, Burmese and Devanagari keep their clusters too).
   - `THAI_TRAILING_VOWEL_RE = /[\u0E30\u0E32\u0E33\u0E45]/` was **added after measurement**: those
     spacing vowels are not Unicode marks, and without them the wrapper emitted lines starting with a
     bare `"ะ"` (`"เพรา" | "ะฉัน…"`). This deviates from the letter of the task's cluster rule on
     purpose.
   - `THAI_LEADING_VOWEL_RE = /[\u0E40-\u0E44]/` binds the consonant after a leading vowel to it.
   - `LATIN_RUN_RE` keeps embedded Latin words atomic inside a Thai sentence.
   - `SPACELESS_SCRIPT_RE = /[\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF]/` is the routing predicate,
     declared next to `NO_SPACE_SCRIPT_RE` in `src/offscreen/utils/typography/kinsokuShori.ts`. It is
     deliberately narrower than that sibling regex, which also matches CJK and fullwidth punctuation:
     see the roadblock below.
2. `wrapText()` — a fourth branch between CJK and Latin: greedy concatenation of those units, never
   calls `breakLongWord()`, never inserts a hyphen.
3. `fitFontSizeWithLines()` — `rawWords` comes from the same tokenizer when
   `!isCjk && NO_SPACE_SCRIPT_RE.test(text)`, so Pass 1 measures the units the wrapper actually breaks
   on. The CJK regex branch and the Latin split are untouched.
4. `src/shared/constants.ts` — `RENDER_FONT_MIN_SIZE_RANGE` (`min: 4, max: 48, step: 1, default: 6`) as
   the single source of truth; `src/background/index.ts` validation, `src/shared/types.ts`
   `DEFAULT_POPUP_STATE` and the panel all derive from it. The `default: 6` value keeps its double duty
   as the "user never overrode the floor" sentinel read by `PipelineOrchestrator` and
   `studioOcrTypeset`.
5. `src/popup/components/EngineSelectionPanel.tsx` — slider bounds from the catalog plus an exact-px
   numeric input (draft state so mid-typing values are not clamped, committed on change/blur/Enter),
   and a hint that the floor is hard: a value larger than the fitted size overflows the bubble.

## Evidence

Measured with a mock 2D context (advance width `0.55 * fontSize` per non-combining character, `0` for
Thai marks, inset `0.05`, lower bound `6`, ceiling `48`), A/B against `git show HEAD:` of the same
file, 105-code-point Thai line:

| box | before | after |
|---|---|---|
| 220×90 | 6px, 2 lines | **16px, 4 lines** |
| 220×160 | 6px, 2 lines | **21px, 5 lines** |
| 420×380 | 8px, 1 line | **47px, 6 lines** |
| 190×250 | 6px, 2 lines | **25px, 7 lines** |
| 210×250 | 6px, 2 lines | **26px, 7 lines** |
| 99×193 | 9px, 5 lines | **16px, 9 lines** |

Every recovered size equals the independently computed cluster-wrap geometric maximum. The clean-fit
gate on Thai at `maxWidth` 198 was `false` before (hyphenated lines such as `"ฉันจะไม่ยอมให้เธอต้องเจ็บป-⁠"`)
and is `true` after.

- `npx vitest run src/offscreen/utils/typesetLayout.test.ts` → 30/30 pass (9 new).
- `npx vitest run src/offscreen` → 787/787 pass in 58 files.
- `npx vitest run src/popup` → 45/45 pass in 11 files (4 new panel tests).
- Latin and CJK are **byte-identical**, not merely close: English fits 13/19/40px, Japanese 22/30/48px,
  mixed CJK 33/40/48px across six boxes, and `wrapText` output matches across 7 samples × 9 widths
  (40–240). Both are pinned by new regression tests.
- `npx tsc -b` clean; `npm run lint` 0 errors (60 pre-existing warnings repo-wide).
- `npm run docs:check` reports `undocumented symbols: 0` for the new export and still exits 1 on 11
  pre-existing `[param-missing]` violations in files this change does not touch.
- **Not covered:** no real page bake was inspected after the change. The unit tests prove the fitting
  contract, not visual parity; `docs/development/translation-gate.md` was not re-recorded because no
  file on its tracked pipeline list changed.

## Decision

**Space-free scripts never receive an inserted hyphen.** They break between orthographic clusters, and
the fitter tokenizes them exactly as the wrapper does, so the clean-fit gate is satisfiable without
weakening it for Latin. The gate stays strict; the tokenizer carries the script knowledge.

A user-facing font-size floor is not a container fix. It forces glyphs larger than the box and spills
outside the balloon by design, so it is documented in the panel rather than presented as a remedy for
small type.

## Roadblocks

- Extending `CJK_REGEX` with `\u0E00-\u0E7F` was rejected: it would route Thai through the CJK tokenizer
  (which dices embedded Latin words) and pull Thai into CJK-only gates for a problem that is purely
  about cluster boundaries.
- Relaxing `hasNoHyphenBreaks` for Thai was rejected: it moves the exception into the invariant that
  devlogs 053/074/075 established for Latin, and it legitimises hyphenated Thai.
- Routing on `NO_SPACE_SCRIPT_RE` was shipped first and rejected by verification: that regex also
  covers `\uFF01-\uFF0F`, `\uFF1A-\uFF20` and the CJK ranges, so an English sentence containing one
  fullwidth `！` left the Latin branch. Because the cluster wrapper does not bind opening marks, quoted
  speech split inside the quotes (`He shouted "` | `Stop！"` instead of `He shouted` | `"Stop！"`), and a
  220×160 English fit moved from 20px to 21px. The narrow `SPACELESS_SCRIPT_RE` fixes it, and the new
  pin `keeps Latin text on the Latin wrapper when it contains fullwidth punctuation` fails if the
  predicate widens again.
- Raising the `renderFontMinSize` ceiling was rejected as a fix: it changes how far text can overflow,
  not how much of the balloon the fit may use.
