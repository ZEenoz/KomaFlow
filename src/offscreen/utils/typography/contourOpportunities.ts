/**
 * Contour-specific line breaking and segmentation.
 * Segmentation/range policy adapted from koharu-renderer/src/segment.rs
 * (commit 56787dc9), with a NON-ICU line-break adapter described below.
 * This module does not certify ICU4X/Jieba segmentation parity.
 *
 * Ported source-range and hypher policy:
 * - Line-break opportunities supplied by the adapter or explicitly by callers.
 * - Mandatory break chars (LF, CR, NEL, LS, PS) are trimmed from the visible range
 *   but preserved in `nextOffset`.
 * - Discretionary hyphenation uses the exact hypher 0.1.8 trie and per-language
 *   left/right fragment bounds. Only a segment's alphabetic core is hyphenated;
 *   punctuation and authored hyphens stay in the source range.
 * - Non-final hypher syllables receive a synthetic `-` break suffix.
 *
 * Honest adapter limitations (NOT donor parity):
 * - Donor uses ICU4X `LineSegmenter` with compiled data. This module uses the
 *   `linebreak` npm package (UAX #14, Unicode 13) because ICU4X JS data is not
 *   installed. Locale tailoring is therefore unavailable for the UAX #14 pass;
 *   Thai/Lao/Khmer/Myanmar word boundaries are added from `Intl.Segmenter` below.
 * - Donor uses ICU4X Korean `KeepAll`; this module filters breaks inside Hangul
 *   runs so Korean words stay whole, which matches the donor test expectations.
 * - Donor uses Jieba for Chinese word protection. Jieba's dictionary is not
 *   bundled here, so Chinese opportunities come from UAX #14 only. Callers that
 *   need exact Chinese behavior must pass precomputed `opportunities`.
 *
 * All offsets are UTF-16 code units into the original source string.
 */

import LineBreaker from 'linebreak';
import {
  SPACELESS_SCRIPT_RE,
  collectWordBreakOffsets,
} from '../../../shared/text/lineBreaks';
import type { ContourLineBreakOpportunity } from './contourSegmentTypes';

/** Mandatory break code units from UAX #14: LF, CR, NEL, LS, PS. */
export const MANDATORY_BREAK_CODE_UNITS = new Set([0x0a, 0x0d, 0x0085, 0x2028, 0x2029]);

/** Hangul ranges used for the Korean KeepAll approximation. */
const HANGUL_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/u;

/**
 * Checks whether a UTF-16 offset is immediately preceded by a mandatory break char.
 *
 * @param text - Source text.
 * @param offset - Break offset.
 * @returns True when the preceding code unit is LF, CR, NEL, LS, or PS.
 */
function precededByMandatoryBreak(text: string, offset: number): boolean {
  if (offset <= 0) return false;
  return MANDATORY_BREAK_CODE_UNITS.has(text.charCodeAt(offset - 1));
}

/**
 * Detects Hangul text for the Korean KeepAll approximation.
 *
 * @param text - Source text.
 * @returns True when any Hangul code point is present.
 */
function containsKorean(text: string): boolean {
  return HANGUL_RE.test(text);
}

/**
 * Detects Han/Bopomofo text. Used only to document the Jieba adapter limitation;
 * no word protection is applied without a Jieba dictionary.
 *
 * @param text - Source text.
 * @returns True when Han or Bopomofo code points are present.
 */
function containsChinese(text: string): boolean {
  return /[\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[\u{20000}-\u{2ceaf}]/u.test(text);
}

/**
 * Removes non-mandatory opportunities inside Hangul runs so Korean words stay whole.
 * Approximates donor ICU4X `LineBreakWordOption::KeepAll`, which `linebreak` cannot express.
 *
 * @param text - Source text.
 * @param opportunities - Raw UAX #14 opportunities.
 * @returns Opportunities kept only at whitespace/mandatory boundaries and text end.
 */
function applyKoreanKeepAll(
  text: string,
  opportunities: ContourLineBreakOpportunity[]
): ContourLineBreakOpportunity[] {
  return opportunities.filter((op) => {
    if (op.isMandatory || op.offset <= 0 || op.offset >= text.length) return true;
    const prev = text[op.offset - 1];
    // Keep breaks after whitespace, matching donor KeepAll word boundaries.
    return /\s/.test(prev);
  });
}

/**
 * Merges extra word-boundary offsets into a sorted opportunity list without dropping any UAX #14
 * break and without losing a mandatory flag when both sources agree on an offset.
 *
 * @param base - UAX #14 opportunities, including offset 0 and the final sentinel.
 * @param extraOffsets - Additional safe interior offsets from {@link collectWordBreakOffsets}.
 * @returns Opportunities sorted by offset with mandatory breaks preserved.
 */
function mergeOpportunities(
  base: ContourLineBreakOpportunity[],
  extraOffsets: ReadonlyArray<number>
): ContourLineBreakOpportunity[] {
  const byOffset = new Map<number, boolean>();
  for (const opportunity of base) {
    const previous = byOffset.get(opportunity.offset) ?? false;
    byOffset.set(opportunity.offset, previous || opportunity.isMandatory);
  }
  for (const offset of extraOffsets) {
    if (!byOffset.has(offset)) byOffset.set(offset, false);
  }
  return [...byOffset.entries()]
    .sort(([left], [right]) => left - right)
    .map(([offset, isMandatory]) => ({ offset, isMandatory }));
}

/**
 * Computes UAX #14 line break opportunities for the source text, augmented with ICU word
 * boundaries for space-free scripts. Always includes offset 0 and a final sentinel at
 * `text.length`.
 *
 * Thai, Lao, Khmer, and Myanmar are written without spaces, so UAX #14 alone treats a whole
 * paragraph as one long word. When {@link SPACELESS_SCRIPT_RE} matches, the safe word offsets from
 * {@link collectWordBreakOffsets} are unioned into the UAX list: mandatory breaks and every UAX
 * break survive, and duplicates keep their mandatory flag.
 *
 * @param text - Source text.
 * @param targetLang - Target language; sample script evidence overrides a mismatch.
 * @returns Ordered opportunities with mandatory flags.
 */
export function computeLineBreakOpportunities(
  text: string,
  targetLang?: string
): ContourLineBreakOpportunity[] {
  const opportunities: ContourLineBreakOpportunity[] = [{ offset: 0, isMandatory: false }];

  const breaker = new LineBreaker(text);
  let result: { position: number; required: boolean } | null;
  while ((result = breaker.nextBreak()) !== null) {
    const offset = result.position;
    if (offset <= 0 || offset > text.length) continue;
    const isMandatory = result.required || precededByMandatoryBreak(text, offset);
    const last = opportunities[opportunities.length - 1];
    if (last.offset === offset) {
      last.isMandatory = last.isMandatory || isMandatory;
    } else {
      opportunities.push({ offset, isMandatory });
    }
  }

  if (opportunities[opportunities.length - 1].offset !== text.length) {
    opportunities.push({ offset: text.length, isMandatory: false });
  }

  const filtered = containsKorean(text) ? applyKoreanKeepAll(text, opportunities) : opportunities;
  // A Chinese text note: donor protects Jieba words. Without a bundled Jieba
  // dictionary we deliberately do not claim that protection; callers may pass
  // precomputed opportunities for exact donor parity.
  void containsChinese;

  if (!SPACELESS_SCRIPT_RE.test(text)) return filtered;
  // Merge after the Korean KeepAll filter so a Thai word offset that is not preceded by
  // whitespace is not mistaken for a Korean cut and discarded.
  return mergeOpportunities(filtered, collectWordBreakOffsets(text, targetLang));
}

