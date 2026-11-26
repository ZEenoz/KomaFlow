import { describe, it, expect } from 'vitest';
import {
  COMBINING_MARK_RE,
  NO_LINE_START_RE,
  OPENING_MARK_RE,
  SPACELESS_SCRIPT_RE,
  THAI_LEADING_VOWEL_RE,
  THAI_TRAILING_VOWEL_RE,
  collectWordBreakOffsets,
  resolveSegmenterLocale,
  segmentGraphemes,
  tokenizeNoSpaceScriptClusters,
  tokenizeNoSpaceScriptWords,
} from './lineBreaks';

/** First reported Studio regression: a Thai sentence with maiyamok and terminal `!`. */
const THAI_SENTENCE_WITH_MAIYAMOK = 'ถ้าพวกเขาเห็นท่าทางแปลกๆ จะทำยังไงดี!';

/** Second reported Studio regression: a Thai sentence with ellipsis and a question particle. */
const THAI_SENTENCE_WITH_ELLIPSIS = 'ถ้าหนูพยายามมากกว่านี้อีกนิด… ทุกอย่างก็น่าจะดีขึ้นใช่ไหมคะ';

/** Glyphs that may never open a wrapped line: marks plus Thai/Lao spacing vowels. */
const BARRED_LINE_START_RE = /[\p{M}\u0E30\u0E32\u0E33\u0E45\u0EB0\u0EB2\u0EB3]/u;

/**
 * Asserts the shared token contract for one text sample.
 *
 * @param text - Source text that must be conserved.
 * @param tokens - Tokens returned by a tokenizer.
 */
function expectSafeTokens(text: string, tokens: string[]): void {
  expect(tokens.join('')).toBe(text);
  for (const token of tokens) {
    expect(token.length).toBeGreaterThan(0);
    expect(BARRED_LINE_START_RE.test(token[0])).toBe(false);
    expect(NO_LINE_START_RE.test(token)).toBe(false);
    expect(THAI_LEADING_VOWEL_RE.test(token[token.length - 1])).toBe(false);
  }
}

describe('lineBreaks', () => {
  describe('resolveSegmenterLocale', () => {
    it('maps BCP-47 codes and common language names to ICU locales', () => {
      expect(resolveSegmenterLocale('th')).toBe('th');
      expect(resolveSegmenterLocale('Thai')).toBe('th');
      expect(resolveSegmenterLocale('th-TH')).toBe('th');
      expect(resolveSegmenterLocale('lo')).toBe('lo');
      expect(resolveSegmenterLocale('lao')).toBe('lo');
      expect(resolveSegmenterLocale('km')).toBe('km');
      expect(resolveSegmenterLocale('khmer')).toBe('km');
      expect(resolveSegmenterLocale('my')).toBe('my');
      expect(resolveSegmenterLocale('burmese')).toBe('my');
      expect(resolveSegmenterLocale('myanmar')).toBe('my');
      expect(resolveSegmenterLocale('ja')).toBe('ja');
      expect(resolveSegmenterLocale('japanese')).toBe('ja');
      expect(resolveSegmenterLocale('zh')).toBe('zh');
      expect(resolveSegmenterLocale('zh-CN')).toBe('zh-cn');
      expect(resolveSegmenterLocale('zh-TW')).toBe('zh-tw');
      expect(resolveSegmenterLocale('chinese')).toBe('zh');
      expect(resolveSegmenterLocale('ko')).toBe('ko');
      expect(resolveSegmenterLocale('korean')).toBe('ko');
      expect(resolveSegmenterLocale('ar')).toBe('ar');
      expect(resolveSegmenterLocale('arabic')).toBe('ar');
      expect(resolveSegmenterLocale('he')).toBe('he');
      expect(resolveSegmenterLocale('hebrew')).toBe('he');
      expect(resolveSegmenterLocale('en')).toBe('en');
      expect(resolveSegmenterLocale('english')).toBe('en');
      expect(resolveSegmenterLocale()).toBe('en');
    });

    it('infers a space-free locale from script evidence when the target is omitted or en', () => {
      expect(resolveSegmenterLocale(undefined, THAI_SENTENCE_WITH_MAIYAMOK)).toBe('th');
      expect(resolveSegmenterLocale('en', THAI_SENTENCE_WITH_MAIYAMOK)).toBe('th');
      expect(resolveSegmenterLocale('en', 'ສະບາຍດີ')).toBe('lo');
      expect(resolveSegmenterLocale('en', 'សួស្តី')).toBe('km');
      expect(resolveSegmenterLocale('en', 'မင်္ဂလာပါ')).toBe('my');
      expect(resolveSegmenterLocale('en', 'こんにちは')).toBe('ja');
      expect(resolveSegmenterLocale('en', '你好')).toBe('zh');
      expect(resolveSegmenterLocale('en', '안녕하세요')).toBe('ko');
    });

    it('keeps a matching target and overrides a mismatched one', () => {
      expect(resolveSegmenterLocale('th', 'Hello')).toBe('th');
      expect(resolveSegmenterLocale('zh-tw', '這是中文')).toBe('zh-tw');
      // Han is shared with Japanese, so explicit Japanese is not contradicted by Han-only text.
      expect(resolveSegmenterLocale('ja', '日本語')).toBe('ja');
      expect(resolveSegmenterLocale('ja', THAI_SENTENCE_WITH_MAIYAMOK)).toBe('th');
      expect(resolveSegmenterLocale('en', 'ฉันรัก PDF มาก')).toBe('th');
      // Thai wins over a CJK tail when it is the dominant script in the sample.
      expect(resolveSegmenterLocale('en', 'ฉันสัญญากับเธอ日本')).toBe('th');
    });
  });

  describe('segmentGraphemes', () => {
    it('keeps Thai marks attached to their base glyph', () => {
      expect(segmentGraphemes('ก้', 'th')).toEqual(['ก้']);
      expect(segmentGraphemes('น้ำ', 'th')).toEqual(['น้ำ']);
    });

    it('keeps combining sequences and emoji ZWJ sequences whole', () => {
      expect(segmentGraphemes('e\u0301')).toEqual(['e\u0301']);
      expect(segmentGraphemes('👨‍👩‍👧‍👦')).toHaveLength(1);
    });

    it('returns an empty array for empty text and conserves ordinary text', () => {
      expect(segmentGraphemes('')).toEqual([]);
      expect(segmentGraphemes('ถ้าพวกเขา', 'th').join('')).toBe('ถ้าพวกเขา');
    });
  });

  describe('orthography constants', () => {
    it('matches the four space-free scripts and rejects spaced scripts', () => {
      expect(SPACELESS_SCRIPT_RE.test('ไทย')).toBe(true);
      expect(SPACELESS_SCRIPT_RE.test('ລາວ')).toBe(true);
      expect(SPACELESS_SCRIPT_RE.test('ខ្មែរ')).toBe(true);
      expect(SPACELESS_SCRIPT_RE.test('မြန်မာ')).toBe(true);
      expect(SPACELESS_SCRIPT_RE.test('English')).toBe(false);
      expect(SPACELESS_SCRIPT_RE.test('日本語')).toBe(false);
    });

    it('bars Thai maiyamok and Kinsoku punctuation from line start', () => {
      expect(NO_LINE_START_RE.test('ๆ')).toBe(true);
      expect(NO_LINE_START_RE.test('…')).toBe(true);
      expect(NO_LINE_START_RE.test('!')).toBe(true);
      expect(NO_LINE_START_RE.test('?')).toBe(true);
      expect(NO_LINE_START_RE.test('.')).toBe(true);
      expect(NO_LINE_START_RE.test('ก')).toBe(false);
    });

    it('binds opening marks and Thai/Lao vowels on the correct side', () => {
      expect(OPENING_MARK_RE.test('«')).toBe(true);
      expect(OPENING_MARK_RE.test('(')).toBe(true);
      expect(THAI_LEADING_VOWEL_RE.test('เ')).toBe(true);
      expect(THAI_LEADING_VOWEL_RE.test('ເ')).toBe(true);
      expect(THAI_TRAILING_VOWEL_RE.test('า')).toBe(true);
      expect(THAI_TRAILING_VOWEL_RE.test('ຳ')).toBe(true);
      expect(COMBINING_MARK_RE.test('\u0E49')).toBe(true);
    });
  });

  describe('tokenizeNoSpaceScriptClusters', () => {
    it('keeps each Thai base glyph with its marks', () => {
      expect(tokenizeNoSpaceScriptClusters('ก้'.repeat(4))).toEqual(['ก้', 'ก้', 'ก้', 'ก้']);
    });

    it('binds maiyamok and punctuation backward and leading vowels forward', () => {
      for (const text of ['แปลกๆ', 'ดี!', '(ดี)', THAI_SENTENCE_WITH_MAIYAMOK, THAI_SENTENCE_WITH_ELLIPSIS]) {
        expectSafeTokens(text, tokenizeNoSpaceScriptClusters(text));
      }
      const maiyamokTokens = tokenizeNoSpaceScriptClusters('แปลกๆ');
      expect(maiyamokTokens.some((token) => token.endsWith('ๆ'))).toBe(true);
      expect(maiyamokTokens.some((token) => token.startsWith('ๆ'))).toBe(false);
    });

    it('keeps Latin/digit runs atomic inside Thai text', () => {
      const text = 'ฉันรัก PDF123 และ Server';
      const tokens = tokenizeNoSpaceScriptClusters(text);
      expect(tokens.join('')).toBe(text);
      expect(tokens.map((token) => token.trim())).toContain('PDF123');
      expect(tokens.map((token) => token.trim())).toContain('Server');
    });
  });

  describe('tokenizeNoSpaceScriptWords', () => {
    it('segments the first Studio sentence into Thai words with no orphan punctuation', () => {
      const tokens = tokenizeNoSpaceScriptWords(THAI_SENTENCE_WITH_MAIYAMOK, 'th');
      expectSafeTokens(THAI_SENTENCE_WITH_MAIYAMOK, tokens);
      const pieces = tokens.map((token) => token.trim());
      expect(pieces).toContain('พวก');
      expect(pieces).toContain('เขา');
      expect(pieces).toContain('เห็น');
      expect(pieces).toContain('แปลกๆ');
      expect(pieces).not.toContain('ๆ');
      expect(pieces.some((piece) => piece.endsWith('!'))).toBe(true);
      expect(BARRED_LINE_START_RE.test(tokens[tokens.length - 1][0])).toBe(false);
    });

    it('segments the second Studio sentence into Thai words and never splits mid-word', () => {
      const tokens = tokenizeNoSpaceScriptWords(THAI_SENTENCE_WITH_ELLIPSIS, 'th');
      expectSafeTokens(THAI_SENTENCE_WITH_ELLIPSIS, tokens);
      const pieces = tokens.map((token) => token.trim());
      expect(pieces).toContain('พยายาม');
      expect(pieces).toContain('มากกว่า');
      expect(pieces.some((piece) => piece.startsWith('นิด'))).toBe(true);
      expect(pieces.some((piece) => piece.startsWith('…') || piece.startsWith('!'))).toBe(false);
    });

    it('infers Thai from the sample when Studio passes the default English target', () => {
      const inferred = tokenizeNoSpaceScriptWords(THAI_SENTENCE_WITH_MAIYAMOK, 'en');
      const explicit = tokenizeNoSpaceScriptWords(THAI_SENTENCE_WITH_MAIYAMOK, 'th');
      expect(inferred).toEqual(explicit);
      expect(inferred.map((token) => token.trim())).toContain('ท่า');
      // The full word remains available as its own units; no token dices it at a bare code unit.
      expect(inferred.join('')).toContain('ท่าทาง');
    });

    it('keeps embedded Latin, digit, and contraction runs atomic', () => {
      const text = "ฉันใช้ Server PDF 123 don't";
      const pieces = tokenizeNoSpaceScriptWords(text, 'th').map((token) => token.trim());
      expect(pieces).toContain('Server');
      expect(pieces).toContain('PDF');
      expect(pieces).toContain('123');
      expect(pieces).toContain("don't");
      expect(tokenizeNoSpaceScriptWords(text, 'th').join('')).toBe(text);
    });

    it('handles Lao, Khmer, and Myanmar without opening on a forbidden glyph', () => {
      for (const [text, lang] of [
        ['ສະບາຍດີ', 'lo'],
        ['ខ្ញុំស្រលាញ់អ្នក', 'km'],
        ['မင်္ဂလာပါ', 'my'],
      ] as const) {
        const tokens = tokenizeNoSpaceScriptWords(text, lang);
        expectSafeTokens(text, tokens);
      }
    });

    it('segments Japanese, Chinese, Korean, and English into word units', () => {
      const ja = tokenizeNoSpaceScriptWords('私はあなたを絶対に守る', 'ja');
      expect(ja.length).toBeGreaterThan(1);
      expect(ja.join('')).toBe('私はあなたを絶対に守る');
      expect(ja.map((token) => token.trim())).toContain('あなた');

      const zh = tokenizeNoSpaceScriptWords('今天天气很好', 'zh');
      expect(zh.length).toBeGreaterThan(1);
      expect(zh.join('')).toBe('今天天气很好');

      const ko = tokenizeNoSpaceScriptWords('안녕하세요 여러분', 'ko').map((token) => token.trim());
      expect(ko).toEqual(['안녕하세요', '여러분']);

      const en = tokenizeNoSpaceScriptWords('Hello world', 'en').map((token) => token.trim());
      expect(en).toEqual(['Hello', 'world']);
    });

    it('binds Thai maiyamok backward and preserves every non-space character', () => {
      const tokens = tokenizeNoSpaceScriptWords('จริงๆ นะ', 'th');
      expectSafeTokens('จริงๆ นะ', tokens);
      expect(tokens.some((token) => token.startsWith('ๆ'))).toBe(false);
      // Leading vowels are legitimate word starts; they must never be stranded at a word end.
      for (const token of tokenizeNoSpaceScriptWords('เธอไปโรงเรียน', 'th')) {
        expect(THAI_LEADING_VOWEL_RE.test(token[token.length - 1])).toBe(false);
      }
    });

    it('falls back to clusters without opening on a combining mark', () => {
      const text = 'ก้'.repeat(4);
      const tokens = tokenizeNoSpaceScriptWords(text, 'th');
      expect(tokens.join('')).toBe(text);
      for (const token of tokens) {
        expect(COMBINING_MARK_RE.test(token[0])).toBe(false);
      }
    });
  });

  describe('collectWordBreakOffsets', () => {
    it('returns multiple safe interior word offsets for Thai sentences', () => {
      for (const text of [THAI_SENTENCE_WITH_MAIYAMOK, THAI_SENTENCE_WITH_ELLIPSIS]) {
        const offsets = collectWordBreakOffsets(text, 'th');
        expect(offsets.length).toBeGreaterThanOrEqual(4);
        expect(offsets).toEqual([...new Set(offsets)].sort((a, b) => a - b));
        for (const offset of offsets) {
          expect(offset).toBeGreaterThan(0);
          expect(offset).toBeLessThan(text.length);
          expect(COMBINING_MARK_RE.test(text[offset - 1])).toBe(false);
          expect(COMBINING_MARK_RE.test(text[offset])).toBe(false);
          expect(THAI_LEADING_VOWEL_RE.test(text[offset - 1])).toBe(false);
          expect(THAI_TRAILING_VOWEL_RE.test(text[offset])).toBe(false);
          expect(NO_LINE_START_RE.test(text[offset])).toBe(false);
          expect(OPENING_MARK_RE.test(text[offset - 1])).toBe(false);
          // Never split the two reported bad prefixes: ท่าทา|ง and อีกนิ|ด.
          expect(text.slice(0, offset).endsWith('ท่าทา')).toBe(false);
          expect(text.slice(0, offset).endsWith('อีกนิ')).toBe(false);
        }
        expect(text.slice(0, offsets[0]).length).toBeGreaterThan(0);
      }
    });

    it('infers the Thai locale even when the caller passes English', () => {
      expect(collectWordBreakOffsets(THAI_SENTENCE_WITH_MAIYAMOK, 'en')).toEqual(
        collectWordBreakOffsets(THAI_SENTENCE_WITH_MAIYAMOK, 'th')
      );
    });

    it('never offers a break before maiyamok or terminal punctuation', () => {
      for (const text of ['แปลกๆ มาก', 'ดี!', 'จริง…']) {
        for (const offset of collectWordBreakOffsets(text, 'th')) {
          expect(text[offset]).not.toBe('ๆ');
          expect(text[offset]).not.toBe('!');
          expect(text[offset]).not.toBe('…');
        }
      }
    });

    it('returns no offsets for spaced scripts without space-free runs', () => {
      expect(collectWordBreakOffsets('Hello world', 'en')).toEqual([]);
      expect(collectWordBreakOffsets('今日は良い天気です', 'ja')).toEqual([]);
    });
  });
});
