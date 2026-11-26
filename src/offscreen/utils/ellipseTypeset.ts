/**
 * ellipseTypeset.ts
 * Rectangular greedy word wrapper with syllable hyphenation, used by the Studio
 * simple-mode edit path and caption boxes. Legacy ellipse-profile fitting was
 * retired when all curved routes moved to the Koharu 2D contour DP engine
 * (contourTypeset.ts); shared typography helpers live in ./typography/.
 */

import { syllables } from './hyphenation';
import { INSERTED_HYPHEN } from './typography/textUnwrap';
import {
  SPACELESS_SCRIPT_RE,
  tokenizeNoSpaceScriptWords,
} from '../../shared/text/lineBreaks';

/**
 * Rectangular word wrapper for flat caption/narration boxes or zero-strength shapes.
 *
 * Tokens containing a space-free script (Thai, Lao, Khmer, Myanmar) are first split into ICU word
 * units; the caller normally delivers such a paragraph as one whitespace-separated "word", which
 * would otherwise render as a single overflowing line. Latin words keep the existing syllable
 * hyphenation fallback.
 *
 * @param words - Word tokens; no-space script paragraphs may arrive as one token.
 * @param targetWidth - Maximum line width.
 * @param measure - Width measurement callback.
 * @param targetLang - Language code for segmentation and hyphenation.
 * @returns Wrapped lines.
 */
export function wrapRectangular(
  words: string[],
  targetWidth: number,
  measure: (str: string) => number,
  targetLang: string = 'en'
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  const pushWordWithHyphenation = (word: string): void => {
    const punctMatch = word.match(/^(.*?)([.!?,:;~…"']+)?$/);
    const stem = punctMatch && punctMatch[1] ? punctMatch[1] : word;
    const trailingPunct = punctMatch?.[2] ?? '';

    if (measure(word) > targetWidth && stem.length > 4) {
      const syls = syllables(stem, targetLang);
      if (syls.length > 1) {
        let accum = '';
        for (let s = 0; s < syls.length; s++) {
          const isLast = s === syls.length - 1;
          const piece = syls[s] + (isLast ? trailingPunct : '');
          const candidate = accum + piece + (isLast ? '' : INSERTED_HYPHEN);
          if (measure(candidate) <= targetWidth || !accum) {
            accum += syls[s] + (isLast ? trailingPunct : '');
          } else {
            lines.push(accum + INSERTED_HYPHEN);
            accum = piece;
          }
        }
        currentLine = accum;
        return;
      }
    }
    currentLine = word;
  };

  for (const word of words) {
    // A no-space paragraph reaches this wrapper as a single token because callers split on
    // whitespace first. ICU word units make it breakable without inventing spaces or hyphens.
    const isSpaceless = SPACELESS_SCRIPT_RE.test(word);
    const tokens = isSpaceless ? tokenizeNoSpaceScriptWords(word, targetLang) : [word];

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token) continue;
      // Tokens of one no-space paragraph are contiguous source slices: join them without a space.
      const glueToLine = index > 0;

      if (!currentLine) {
        if (isSpaceless) currentLine = token.trimStart();
        else pushWordWithHyphenation(token);
        continue;
      }

      const candidate = glueToLine ? `${currentLine}${token}` : `${currentLine} ${token}`;
      if (measure(candidate) <= targetWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine.trimEnd());
        if (isSpaceless) currentLine = token.trimStart();
        else pushWordWithHyphenation(token);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
}
