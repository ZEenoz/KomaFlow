import { describe, it, expect } from 'vitest';import { loadHyphenationLanguage } from './hyphenation';
import { tokenizeDialogue } from './typography/tokenizer';
import { wrapRectangular } from './ellipseTypeset';
import { NO_LINE_START_RE } from '../../shared/text/lineBreaks';

describe('ellipseTypeset module', () => {
  describe('tokenizeDialogue', () => {
    it('binds leading punctuation to previous token', () => {
      const tokens = tokenizeDialogue('Wait , what ?');
      expect(tokens).toEqual(['Wait ,', 'what ?']);
    });
  });

  describe('wrapRectangular', () => {
    const measure = (s: string) => s.length * 8;

    it('wraps words into multiple lines with space-joined greedy fill', () => {
      const words = tokenizeDialogue('Short test dialogue that needs multiple lines');
      const lines = wrapRectangular(words, 80, measure);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) {
        expect(measure(line)).toBeLessThanOrEqual(80 + 8);
      }
    });

    it('hyphenates overflowing long words via syllables', async () => {
      await loadHyphenationLanguage('en');
      const words = ['extraordinary'];
      // Width 50px allows ~6 chars (6 * 8 = 48px), so extraordinary (13 chars) must break into syllables
      const lines = wrapRectangular(words, 50, measure, 'en');
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.some((l) => l.includes('-'))).toBe(true);
    });

    it('wraps a Thai caption-box paragraph on word boundaries instead of one overflowing token', () => {
      const source = 'ถ้าพวกเขาเห็นท่าทางแปลกๆ จะทำยังไงดี!';
      // Studio's Simple Mode splits the paragraph on whitespace before calling this wrapper, so a
      // whole Thai sentence arrives as one or two "words" with no break opportunities inside.
      const words = source.split(/\s+/).filter(Boolean);
      const lines = wrapRectangular(words, 120, measure, 'th');

      expect(lines.length).toBeGreaterThan(2);
      expect(lines.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
      for (const line of lines) {
        expect(line).not.toContain('-');
        expect(NO_LINE_START_RE.test(line[0])).toBe(false);
        expect(/[\p{M}\u0E30\u0E32\u0E33\u0E45]/u.test(line[0])).toBe(false);
        // The reported failure was `ท่าทา|ง`; a word boundary never ends a line with that prefix.
        expect(line.endsWith('ท่าทา')).toBe(false);
        expect(measure(line)).toBeLessThanOrEqual(120);
      }
    });

    it('infers Thai segmentation from the text when the wrapper gets the default English target', () => {
      const words = ['ถ้าพวกเขาเห็นท่าทางแปลกๆ'];
      const explicit = wrapRectangular(words, 120, measure, 'th');
      expect(wrapRectangular(words, 120, measure, 'en')).toEqual(explicit);
    });
  });
});
