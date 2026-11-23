import { describe, it, expect } from 'vitest';
import {
  findHyphenationPoints,
  balancedWrapText,
  fitFontSizeWithLines,
  fontSpec,
  decollideBoxes,
  isHardLineBreak,
  tokenizeNoSpaceScript,
  wrapText,
  NO_LINE_START_RE,
  OPENING_MARK_RE,
} from './typesetLayout';
import { INSERTED_HYPHEN } from './hyphenation';

describe('typesetLayout', () => {
  describe('findHyphenationPoints', () => {
    it('never breaks words shorter than 7 letters', () => {
      expect(findHyphenationPoints('tea')).toEqual([]);
      expect(findHyphenationPoints('danger')).toEqual([]);
      expect(findHyphenationPoints('ruined')).toEqual([]);
    });

    it('identifies prefixes and double consonants for longer words', () => {
      const points = findHyphenationPoints('international');
      expect(points.length).toBeGreaterThan(0);
      expect(points).toContain(5); // "inter-"
    });

    it('respects explicit internal hyphens', () => {
      const points = findHyphenationPoints('twenty-five');
      expect(points).toContain(7); // After "twenty-"
    });

    it('never hyphenates pure numeric strings', () => {
      expect(findHyphenationPoints('10000000')).toEqual([]);
      expect(findHyphenationPoints('20261016')).toEqual([]);
    });

    it('never breaks contractions at apostrophes', () => {
      const points = findHyphenationPoints("couldn't");
      expect(points).toEqual([]);
      const points2 = findHyphenationPoints("shouldn't");
      expect(points2).toEqual([]);
    });
  });

  describe('balancedWrapText', () => {
    const mockCtx = {
      font: '16px sans-serif',
      measureText: (t: string) => ({ width: t.length * 8 })
    };

    it('never treats English text with apostrophes or ellipsis as CJK characters', () => {
      const apostropheText = "There's no other way to win!";
      const ellipsisText = "...I understand! But please don't force yourself!";
      
      const lines1 = balancedWrapText(mockCtx, apostropheText, 120);
      expect(lines1.some(l => l === "Ther" || l === "Ther-")).toBe(false);
      expect(lines1.some(l => l.includes("There's"))).toBe(true);

      const lines2 = balancedWrapText(mockCtx, ellipsisText, 120);
      expect(lines2.some(l => l.includes("und-") || l.includes("erst-"))).toBe(false);
    });

    it('never generates orphan punctuation lines', () => {
      const text = "Really?! You can't be serious!";
      // Test at various narrow widths where "Really?!" might break
      for (const w of [60, 70, 80, 90, 100]) {
        const lines = balancedWrapText(mockCtx, text, w);
        for (const line of lines) {
          // No line should consist solely of punctuation marks
          expect(/^[!?~.．…·:;,"'']+$/.test(line)).toBe(false);
        }
      }
    });

    it('binds opening marks forward without separation', () => {
      expect(OPENING_MARK_RE.test('¿')).toBe(true);
      expect(OPENING_MARK_RE.test('¡')).toBe(true);
      const spanishText = "¿Cómo estás hoy?";
      const lines = balancedWrapText(mockCtx, spanishText, 80);
      // '¿' must not be left alone at end of any line
      expect(lines.some(l => l.endsWith('¿'))).toBe(false);
      // '¿Cómo' must remain bound
      expect(lines.some(l => l.includes('¿Cómo'))).toBe(true);
    });

    it('enforces Kinsoku Shori prohibited line-start characters', () => {
      const cjkText = "問題ありませんよ！本当ですよ。";
      const lines = balancedWrapText(mockCtx, cjkText, 64);
      for (const line of lines.slice(1)) {
        // No line after the first should begin with prohibited punctuation
        expect(NO_LINE_START_RE.test(line[0])).toBe(false);
      }
    });

    it('handles standalone exclamation marks and shout punctuation', () => {
      const lines = balancedWrapText(mockCtx, '!', 80);
      expect(lines).toEqual(['!']);
      const cjkLines = balancedWrapText(mockCtx, '！？', 80);
      expect(cjkLines).toEqual(['！？']);
    });
  });

  describe('isHardLineBreak', () => {
    it('allows soft-wrapped LLM text without terminal punctuation to reflow', () => {
      expect(isHardLineBreak('I wanted to', 'go home')).toBe(false);
      expect(isHardLineBreak('This is a great', 'opportunity')).toBe(false);
    });

    it('preserves true hard breaks with terminal punctuation', () => {
      expect(isHardLineBreak('I wanted to go.', 'Next topic')).toBe(true);
      expect(isHardLineBreak('Wait!', 'Who is there?')).toBe(true);
      expect(isHardLineBreak('Really?', 'Yes')).toBe(true);
    });

    it('preserves list items and dialog colons as hard breaks', () => {
      expect(isHardLineBreak('Hero:', 'I shall return.')).toBe(true);
      expect(isHardLineBreak('Items:', '- Sword')).toBe(true);
    });
  });

  describe('fitFontSizeWithLines', () => {
    const mockCtx = {
      font: '16px sans-serif',
      measureText: (t: string) => {
        const sizeMatch = mockCtx.font.match(/(\d+)px/);
        const sz = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;
        return { width: t.length * (sz * 0.5) };
      }
    };

    it('fits font size and returns wrapped lines for Western dialogue', () => {
      const result = fitFontSizeWithLines(
        mockCtx,
        'Hello World Justice',
        'sans-serif',
        100,
        150,
        24,
        32
      );
      expect(result.size).toBeGreaterThanOrEqual(6);
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('enforces tall-narrow floor for vertical manga bubbles', () => {
      const result = fitFontSizeWithLines(
        mockCtx,
        'Wait for me!',
        'sans-serif',
        30,
        180,
        20,
        24
      );
      // Floor ensures it does not choke down to 6px
      expect(result.size).toBeGreaterThanOrEqual(8);
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('scales up standalone exclamation mark to fill bubble', () => {
      const result = fitFontSizeWithLines(
        mockCtx,
        '!',
        'sans-serif',
        100,
        100,
        24,
        48
      );
      expect(result.lines).toEqual(['!']);
      expect(result.size).toBeGreaterThanOrEqual(24);
    });

    it('reduces redundant measureText calls via MeasureCache', () => {
      let callCount = 0;
      const countingCtx = {
        font: '16px sans-serif',
        measureText: (t: string) => {
          callCount++;
          const sz = parseInt(countingCtx.font.match(/(\d+)px/)?.[1] || '16', 10);
          return { width: t.length * (sz * 0.5) };
        }
      };

      const text = "This is a longer paragraph with several repeated words that need to be measured during binary search.";
      fitFontSizeWithLines(countingCtx, text, 'sans-serif', 120, 160, 20, 28);
      expect(callCount).toBeLessThan(350);
    });

    it('does not collapse CJK font size when horizontally expanded', () => {
      const text = '也感谢您今天来到我们这里， BABYBOY';
      const cjkCtx = {
        font: '16px sans-serif',
        measureText: (t: string) => {
          const sz = parseInt(cjkCtx.font.match(/(\d+)px/)?.[1] || '16', 10);
          let w = 0;
          for (const ch of t) {
            w += /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(ch) ? sz : sz * 0.5;
          }
          return { width: w };
        }
      };

      const narrow = fitFontSizeWithLines(cjkCtx, text, 'sans-serif', 190, 250, 24, 48);
      const wider = fitFontSizeWithLines(cjkCtx, text, 'sans-serif', 210, 250, 24, 48);
      expect(wider.size).toBeGreaterThanOrEqual(narrow.size);
    });

    it('finds readable font size in tall narrow bubble with long words without binary search collapse', () => {
      const dialogue = "I'll be the one to hold on here. Teacher, please retreat quickly and get reinforcements!";
      const res = fitFontSizeWithLines(mockCtx, dialogue, 'sans-serif', 99, 193, 10, 48, 0.05, undefined, false, undefined, 'en');
      // Must not collapse to 11px micro-text floor; should find >= 13px filling the vertical chamber
      expect(res.size).toBeGreaterThanOrEqual(13);
      expect(res.lines.length).toBeGreaterThanOrEqual(8);
      expect(res.lines.some((l) => l.includes('reinfor-') || l.includes('reinforcements'))).toBe(true);
    });

    it('enforces explicit minFontSize floor and italic/quoted fontSpec generation', () => {
      const spec = fontSpec(16, 'DB HelvethaicaMon X Med', 'Thai sample', undefined, true, true);
      expect(spec).toContain('italic bold 16px "DB HelvethaicaMon X Med", ');
      expect(spec).toContain('sans-serif');

      const tight = fitFontSizeWithLines(
        mockCtx,
        'This line would normally shrink below twenty pixels in a small box.',
        'DB HelvethaicaMon X Med',
        80,
        60,
        14,
        24,
        0.05,
        undefined,
        false,
        undefined,
        'en',
        true,
        20
      );
      expect(tight.size).toBeGreaterThanOrEqual(20);
      expect(mockCtx.font).toContain('italic ');
      expect(mockCtx.font).toContain('"DB HelvethaicaMon X Med"');
    });
  });

  describe('no-space script (Thai) wrapping', () => {
    /** Glyphs that may never open a wrapped line: Unicode marks plus Thai spacing vowels. */
    const CLUSTER_START_BARRED_RE = /[\p{M}\u0E30\u0E32\u0E33\u0E45]/u;
    /** Thai leading vowels (U+0E40..U+0E44) are written in front of the consonant they modify. */
    const LEADING_VOWEL_RE = /[\u0E40-\u0E44]/;
    /** Advance width of one non-mark Thai glyph as a fraction of the font size (mock metrics). */
    const THAI_ADVANCE_EM = 0.55;
    /** Thai line of 105 code points / 82 non-combining glyphs used for the 6px collapse report. */
    const THAI_DIALOGUE =
      'ฉันจะไม่ยอมให้เธอต้องเจ็บปวดอีกต่อไปไม่ว่าอะไรจะเกิดขึ้นก็ตามเพราะฉันสัญญากับเธอไว้แล้วว่าฉันจะไม่ทิ้งเธอ';

    /**
     * Builds a mock 2D context with Thai metrics: every non-mark glyph advances one fraction of
     * the current font size, marks (U+0E31, U+0E34-U+0E3A, U+0E47-U+0E4E) advance nothing.
     *
     * @returns Mock context exposing a mutable `font` and `measureText`.
     */
    function createThaiCtx(): { font: string; measureText: (t: string) => { width: number } } {
      const ctx = {
        font: '16px sans-serif',
        measureText(t: string): { width: number } {
          const sizeMatch = ctx.font.match(/(\d+)px/);
          const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;
          let width = 0;
          for (const ch of t) {
            width += /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch) ? 0 : THAI_ADVANCE_EM * size;
          }
          return { width };
        },
      };
      return ctx;
    }

    /**
     * Asserts every wrapped line is legal Thai typesetting on its own.
     *
     * @param ctx - Measuring context used to verify line widths.
     * @param lines - Wrapped lines to inspect.
     * @param source - Original paragraph the lines were wrapped from.
     * @param maxWidth - Wrapping width the lines must respect.
     */
    function expectLegalThaiLines(
      ctx: { measureText: (t: string) => { width: number } },
      lines: string[],
      source: string,
      maxWidth: number
    ): void {
      for (const line of lines) {
        expect(line).not.toContain(INSERTED_HYPHEN);
        expect(source).toContain(line);
        expect(line.startsWith(' ')).toBe(false);
        expect(line.endsWith(' ')).toBe(false);
        expect(CLUSTER_START_BARRED_RE.test(line[0])).toBe(false);
        expect(LEADING_VOWEL_RE.test(line[line.length - 1])).toBe(false);
        expect(ctx.measureText(line).width).toBeLessThanOrEqual(maxWidth + 0.5);
      }
      expect(lines.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
    }

    it('tokenizes Thai into clusters that never open with a mark or a trailing vowel', () => {
      const tokens = tokenizeNoSpaceScript('ฉันสัญญากับเธอ');
      expect(tokens.join('')).toBe('ฉันสัญญากับเธอ');
      for (const token of tokens) {
        expect(token.trim().length).toBeGreaterThan(0);
        expect(CLUSTER_START_BARRED_RE.test(token[0])).toBe(false);
      }
      // Marks ride on their base glyph: "ก้" is one unit, never "ก" + "้".
      expect(tokenizeNoSpaceScript('ก้'.repeat(4)).every((token) => token.trim() === 'ก้')).toBe(true);
      // A leading vowel must not be the last glyph of a unit ("เธ" + "อ", never a dangling "เ").
      for (const token of tokenizeNoSpaceScript('เธอไป')) {
        expect(LEADING_VOWEL_RE.test(token[token.length - 1])).toBe(false);
      }
    });

    it('keeps embedded Latin words atomic inside a Thai sentence', () => {
      const tokens = tokenizeNoSpaceScript('ฉันรัก BABYBOY มาก');
      expect(tokens.map((token) => token.trim())).toContain('BABYBOY');
      expect(tokens.join('')).toBe('ฉันรัก BABYBOY มาก');
    });

    it('wraps Thai without inserting any hyphen or splitting a cluster', () => {
      for (const maxWidth of [60, 120, 160, 198]) {
        const ctx = createThaiCtx();
        const lines = wrapText(ctx, THAI_DIALOGUE, maxWidth);
        expect(lines.length).toBeGreaterThan(1);
        expectLegalThaiLines(ctx, lines, THAI_DIALOGUE, maxWidth);
      }
    });

    it('preserves a hyphen that exists in the source text exactly once', () => {
      const source = 'ฉันจะไม่ยอมแพ้-เด็ดขาด';
      for (const maxWidth of [60, 120, 198]) {
        const lines = wrapText(createThaiCtx(), source, maxWidth);
        const joined = lines.join('').replace(/\s/g, '');
        expect(joined).toBe(source);
        expect(joined.match(/-/g)).toHaveLength(1);
        expect(lines.some((line) => line.includes(INSERTED_HYPHEN))).toBe(false);
      }
    });
  });

  describe('no-space script (Thai) fitting', () => {
    /** Advance width of one non-mark Thai glyph as a fraction of the font size (mock metrics). */
    const THAI_ADVANCE_EM = 0.55;
    /** Balloon inset applied by fitFontSizeWithLines. */
    const BOX_INSET = 0.05;
    /** Font size the pre-fix whole-paragraph tokenizer collapsed Thai dialogue into at 220x90. */
    const PRE_FIX_FLOOR_PX = 6;
    /** Thai line used for the 6px collapse report (105 code points, 82 non-combining glyphs). */
    const THAI_DIALOGUE =
      'ฉันจะไม่ยอมให้เธอต้องเจ็บปวดอีกต่อไปไม่ว่าอะไรจะเกิดขึ้นก็ตามเพราะฉันสัญญากับเธอไว้แล้วว่าฉันจะไม่ทิ้งเธอ';

    /**
     * Builds a mock 2D context with Thai metrics (one advance per non-mark glyph, none per mark).
     *
     * @returns Mock context exposing a mutable `font` and `measureText`.
     */
    function createThaiCtx(): { font: string; measureText: (t: string) => { width: number } } {
      const ctx = {
        font: '16px sans-serif',
        measureText(t: string): { width: number } {
          const sizeMatch = ctx.font.match(/(\d+)px/);
          const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;
          let width = 0;
          for (const ch of t) {
            width += /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch) ? 0 : THAI_ADVANCE_EM * size;
          }
          return { width };
        },
      };
      return ctx;
    }

    it('fills a 220x90 balloon instead of collapsing to the 6px floor', () => {
      const ctx = createThaiCtx();
      const result = fitFontSizeWithLines(ctx, THAI_DIALOGUE, 'sans-serif', 220, 90, 24, 48);
      expect(result.size).toBeGreaterThan(PRE_FIX_FLOOR_PX * 2);
      expect(result.size).toBeGreaterThanOrEqual(14);
      expect(result.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of result.lines) {
        expect(THAI_DIALOGUE).toContain(line);
        expect(line).not.toContain(INSERTED_HYPHEN);
        expect(ctx.measureText(line).width).toBeLessThanOrEqual(220 * (1 - 2 * BOX_INSET) + 0.5);
      }
    });

    it('scales Thai font size with the balloon instead of sticking at the floor', () => {
      const medium = fitFontSizeWithLines(createThaiCtx(), THAI_DIALOGUE, 'sans-serif', 220, 160, 24, 48);
      const large = fitFontSizeWithLines(createThaiCtx(), THAI_DIALOGUE, 'sans-serif', 420, 380, 24, 48);
      expect(medium.size).toBeGreaterThanOrEqual(19);
      expect(large.size).toBeGreaterThanOrEqual(40);
      expect(large.size).toBeGreaterThan(medium.size);
      expect(medium.size).toBeGreaterThan(PRE_FIX_FLOOR_PX * 2);
    });

    it('never leaves a Thai line starting with an orphan mark', () => {
      const result = fitFontSizeWithLines(createThaiCtx(), THAI_DIALOGUE, 'sans-serif', 220, 90, 24, 48);
      for (const line of result.lines.slice(1)) {
        expect(/[\p{M}\u0E30\u0E32\u0E33\u0E45]/u.test(line[0])).toBe(false);
      }
    });
  });

  describe('Latin and CJK wrap/fit regression pins', () => {
    /** Advance width of one glyph as a fraction of the font size (mock metrics used below). */
    const HALF_EM_RATIO = 0.5;
    /** English sample pinned to prove the Latin wrapping path is untouched. */
    const LATIN_DIALOGUE =
      'I will never let you get hurt again, no matter what happens, because I promised you that I would never leave you.';
    /** Japanese sample pinned to prove the CJK path is untouched. */
    const JAPANESE_DIALOGUE = '私はあなたを絶対に伤つけさせない、何があってもあなたを一人にはしないと約束したから。';

    /**
     * Builds a mock 2D context where every glyph advances half of the current font size.
     *
     * @returns Mock context exposing a mutable `font` and `measureText`.
     */
    function createHalfEmCtx(): { font: string; measureText: (t: string) => { width: number } } {
      const ctx = {
        font: '16px sans-serif',
        measureText(t: string): { width: number } {
          const sizeMatch = ctx.font.match(/(\d+)px/);
          const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;
          return { width: t.length * (size * HALF_EM_RATIO) };
        },
      };
      return ctx;
    }

    it('keeps the English fit and hyphenation output unchanged', () => {
      const fitted = fitFontSizeWithLines(createHalfEmCtx(), LATIN_DIALOGUE, 'sans-serif', 220, 90, 24, 48);
      expect(fitted.size).toBe(13);
      expect(fitted.lines).toEqual([
        'I will never let you get hurt',
        'again, no matter what happens,',
        'because I promised you that I',
        'would never leave you.',
      ]);

      const wrapped = wrapText(createHalfEmCtx(), LATIN_DIALOGUE, 40);
      expect(wrapped).toEqual([
        'I',
        'will',
        'never',
        'let',
        'you',
        'get',
        'hurt',
        'again,',
        'no',
        'matter',
        'what',
        `hap${INSERTED_HYPHEN}`,
        'pens,',
        `be${INSERTED_HYPHEN}`,
        'cause',
        'I',
        `pro${INSERTED_HYPHEN}`,
        'mised',
        'you',
        'that',
        'I',
        'would',
        'never',
        'leave',
        'you.',
      ]);
      // Last-resort hyphenation discipline is intact: only long words are broken, never short ones.
      expect(wrapped.some((line) => line === `let${INSERTED_HYPHEN}`)).toBe(false);
      expect(wrapped.some((line) => line === `you${INSERTED_HYPHEN}`)).toBe(false);
    });

    it('keeps Latin text on the Latin wrapper when it contains fullwidth punctuation', () => {
      // The no-space cluster wrapper does not bind opening marks the way the Latin branch does, so
      // routing an English sentence there would change where its lines break. A fullwidth mark is
      // not a reason to leave the Latin path (Devlog 120).
      const ascii = 'He shouted "Stop!" and ran away quickly.';
      const fullwidth = 'He shouted "Stop\uff01" and ran away quickly.';
      for (const maxWidth of [60, 90, 140]) {
        const latinLines = wrapText(createHalfEmCtx(), ascii, maxWidth);
        const fullwidthLines = wrapText(createHalfEmCtx(), fullwidth, maxWidth);
        // Same break positions, so normalise the single glyph that differs before comparing.
        expect(fullwidthLines.map((line) => line.replace(/\uff01/g, '!'))).toEqual(latinLines);
      }
    });

    it('keeps the Japanese fit and Kinsoku wrap output unchanged', () => {
      const fitted = fitFontSizeWithLines(createHalfEmCtx(), JAPANESE_DIALOGUE, 'sans-serif', 220, 90, 24, 48);
      expect(fitted.size).toBe(22);
      expect(fitted.lines).toEqual([
        '私はあなたを絶対に伤つけさせ',
        'ない、何があってもあなたを一',
        '人にはしないと約束したから。',
      ]);

      const wrapped = wrapText(createHalfEmCtx(), JAPANESE_DIALOGUE, 64);
      expect(wrapped).toEqual([
        '私はあなたを絶対',
        'に伤つけさせない、',
        '何があってもあな',
        'たを一人にはしな',
        'いと約束したから。',
      ]);
      for (const line of wrapped.slice(1)) {
        expect(NO_LINE_START_RE.test(line[0])).toBe(false);
      }
    });
  });

  describe('decollideBoxes', () => {
    it('nudges overlapping boxes apart', () => {
      const boxes = [
        { x: 10, y: 10, w: 50, h: 50 },
        { x: 10, y: 40, w: 50, h: 50 }
      ];
      const adjusted = decollideBoxes(boxes);
      expect(adjusted[1].y).toBeGreaterThan(40);
    });
  });
});
