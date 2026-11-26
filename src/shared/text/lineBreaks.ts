/**
 * lineBreaks.ts
 * Canonical multilingual word-boundary and orthographic-cluster primitives shared by every
 * typesetting engine (comic balloons, contour fits, and Studio caption boxes).
 *
 * Pure TypeScript with no Canvas dependency: the same ICU segmentation, Kinsoku and Thai/Lao
 * orthography rules therefore apply everywhere a line may break. Layout engines keep their own
 * wrapping and measurement; this module only decides where a no-space script may be split.
 */

/** Locale used when neither the caller nor the sample text identifies a language. */
const DEFAULT_SEGMENTER_LOCALE = 'en';

/**
 * Unicode ranges for writing systems whose words are not separated by spaces at all, so the only
 * legal break is between orthographic clusters: Thai, Lao, Myanmar, and Khmer.
 *
 * A strict subset of the broader CJK-aware `NO_SPACE_SCRIPT_RE` in `kinsokuShori.ts`: CJK keeps its
 * own wrapping and Kinsoku path, while this predicate routes only truly space-free syllables.
 */
export const SPACELESS_SCRIPT_RE = /[\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF]/;

/**
 * Characters forbidden from starting a rendered line (Kinsoku Shori and western typography).
 * The anchor is deliberate: callers test a token or a single character, never the whole line.
 * Includes Thai `ๆ` (maiyamok), which must always bind backward to its host word.
 */
export const NO_LINE_START_RE =
  /^[.,!?:;…\-—―–‒ー－～─‥)」』】》〉，、。：；！？،۔\]}）ฯ\u0E46\u0EC6\u31F0-\u31FF〕〗”’♪~．〙〛]/;

/**
 * Opening punctuation that binds forward to the word it introduces.
 * Unanchored on purpose: callers test either a token or its last character.
 */
export const OPENING_MARK_RE =
  /[¡¿([{«‹‘‚‛“„‟〈《「『【〔〖〘〚〝（［｛｟｢#@$£¥§₦₩€₱₹₽฿№]/;

/** Unicode marks (Mn/Mc/Me); they modify the glyph before them and can never open a line. */
export const COMBINING_MARK_RE = /\p{M}/u;

/**
 * Thai and Lao spacing vowels written after their consonant. They own a full cell but still
 * cannot open a line, and they are not Unicode marks so the `\p{M}` test misses them.
 */
export const THAI_TRAILING_VOWEL_RE = /[\u0E30\u0E32\u0E33\u0E45\u0EB0\u0EB2\u0EB3]/;

/**
 * Thai and Lao leading vowels written before the consonant they modify. A glyph after one of these
 * must stay with it, so a line may never end on a leading vowel.
 */
export const THAI_LEADING_VOWEL_RE = /[\u0E40-\u0E44\u0EC0-\u0EC4]/;

/** Thai maiyamok (U+0E46), a repetition mark that always binds backward to its host word. */
export const THAI_MAIYAMOK_RE = /\u0E46/;

/** Matches one complete whitespace run; used to attach a space suffix to the preceding token. */
const WHITESPACE_ONLY_RE = /^\s+$/;

/** One whitespace code point; used when deciding whether a break sits inside a script run. */
const WHITESPACE_RE = /\s/;

/** Contiguous Latin/digit run characters kept atomic inside a no-space script sentence. */
const LATIN_RUN_RE = /[A-Za-z0-9'’-]/;

/** Low end of the UTF-16 high-surrogate range. */
const HIGH_SURROGATE_MIN = 0xd800;

/** High end of the UTF-16 high-surrogate range. */
const HIGH_SURROGATE_MAX = 0xdbff;

/** Low end of the UTF-16 low-surrogate range. */
const LOW_SURROGATE_MIN = 0xdc00;

/** High end of the UTF-16 low-surrogate range. */
const LOW_SURROGATE_MAX = 0xdfff;

/** Writing systems relevant to ICU word segmentation. */
type ScriptFamily = 'thai' | 'lao' | 'khmer' | 'myanmar' | 'japanese' | 'hangul' | 'han';

/** Granularities this module asks ICU for. */
type SegmentGranularity = 'grapheme' | 'word';

/** One writing system detected in a text sample. */
interface ScriptEvidence {
  /** ICU locale that segments this writing system best. */
  locale: string;
  /** Writing system the locale belongs to. */
  script: ScriptFamily;
  /** Number of code points found; used to pick the dominant script in mixed text. */
  score: number;
}

/** Thai code points, used as locale evidence rather than as a wrapping predicate. */
const THAI_SCRIPT_RE = /[\u0E00-\u0E7F]/g;

/** Lao code points, used as locale evidence. */
const LAO_SCRIPT_RE = /[\u0E80-\u0EFF]/g;

/** Khmer code points, used as locale evidence. */
const KHMER_SCRIPT_RE = /[\u1780-\u17FF]/g;

/** Myanmar code points, used as locale evidence. */
const MYANMAR_SCRIPT_RE = /[\u1000-\u109F]/g;

/** Japanese Kana code points; their presence distinguishes Japanese from Han-only Chinese. */
const JAPANESE_KANA_RE = /[\u3040-\u30FF\u31F0-\u31FF]/g;

/** Hangul code points, used as locale evidence. */
const HANGUL_SCRIPT_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g;

/** Han code points; shared by Chinese and Japanese, so Kana decides which locale wins. */
const HAN_SCRIPT_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

/**
 * BCP-47 primary subtags and common language names mapped to a stable ICU locale.
 * One catalog so callers can pass OCR language codes, UI names, or BCP-47 tags interchangeably.
 */
const LOCALE_ALIASES: Readonly<Record<string, string>> = {
  th: 'th',
  thai: 'th',
  'th-th': 'th',
  lo: 'lo',
  lao: 'lo',
  'lo-la': 'lo',
  km: 'km',
  khmer: 'km',
  'km-kh': 'km',
  my: 'my',
  burmese: 'my',
  myanmar: 'my',
  'my-mm': 'my',
  ja: 'ja',
  japanese: 'ja',
  jp: 'ja',
  zh: 'zh',
  chinese: 'zh',
  cn: 'zh',
  'zh-cn': 'zh-cn',
  'zh-tw': 'zh-tw',
  'zh-hans': 'zh-hans',
  'zh-hant': 'zh-hant',
  ko: 'ko',
  korean: 'ko',
  kr: 'ko',
  ar: 'ar',
  arabic: 'ar',
  he: 'he',
  hebrew: 'he',
  iw: 'he',
  en: 'en',
  english: 'en',
  es: 'es',
  spanish: 'es',
  fr: 'fr',
  french: 'fr',
  de: 'de',
  german: 'de',
  pt: 'pt',
  portuguese: 'pt',
  it: 'it',
  italian: 'it',
  ru: 'ru',
  russian: 'ru',
  vi: 'vi',
  vietnamese: 'vi',
  id: 'id',
  indonesian: 'id',
  ms: 'ms',
  malay: 'ms',
  hi: 'hi',
  hindi: 'hi',
  tl: 'tl',
  tagalog: 'tl',
  fil: 'fil',
  filipino: 'fil',
  nl: 'nl',
  dutch: 'nl',
  pl: 'pl',
  polish: 'pl',
  tr: 'tr',
  turkish: 'tr',
};

/** Primary language subtag to writing system, used to detect a target/sample mismatch. */
const SCRIPT_FAMILY_BY_LANGUAGE: Readonly<Record<string, ScriptFamily>> = {
  th: 'thai',
  lo: 'lao',
  km: 'khmer',
  my: 'myanmar',
  ja: 'japanese',
  zh: 'han',
  ko: 'hangul',
};

/** Cache of constructed ICU segmenters; `null` records an unavailable runtime or bad locale. */
const segmenterCache = new Map<string, Intl.Segmenter | null>();

/**
 * Counts code points matched by a global evidence pattern.
 *
 * @param text - Sample text to inspect.
 * @param pattern - Global regular expression for one writing system.
 * @returns Number of matching code points, or zero when the pattern is absent.
 */
function countScriptMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Normalizes an OCR/UI language code or name to a usable ICU locale.
 *
 * @param value - Raw language code, BCP-47 tag, or English language name.
 * @returns Normalized locale, or null when the value cannot identify a language.
 */
function normalizeLocale(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return null;

  const alias = LOCALE_ALIASES[normalized];
  if (alias) return alias;

  const [primary] = normalized.split('-');
  // Keep region/script subtags (`zh-tw`, `en-us`) after validating the primary language.
  if (LOCALE_ALIASES[primary]) return normalized;
  return /^[a-z]{2,3}$/.test(primary) ? normalized : null;
}

/**
 * Resolves the writing system a locale primarily serves.
 *
 * @param locale - Normalized ICU locale.
 * @returns Writing system, or null for languages outside the script catalog.
 */
function scriptFamilyOfLocale(locale: string): ScriptFamily | null {
  const [primary] = locale.split('-');
  return SCRIPT_FAMILY_BY_LANGUAGE[primary] ?? null;
}

/**
 * Whether a requested script can legitimately segment the evidence script.
 * Han is shared by Chinese and Japanese, so Han-only evidence never contradicts a Japanese target.
 *
 * @param target - Script of the caller's requested locale.
 * @param evidence - Script detected in the sample text.
 * @returns True when the requested locale remains the better choice.
 */
function areScriptsCompatible(target: ScriptFamily, evidence: ScriptFamily): boolean {
  if (target === evidence) return true;
  return evidence === 'han' && target === 'japanese';
}

/**
 * Infers the dominant writing system from sample text.
 *
 * Thai/Lao/Khmer/Myanmar are checked before Japanese and Han so mixed Thai+CJK dialogue keeps its
 * Thai word boundaries; Kana marks Japanese, while Han-only text is treated as Chinese.
 *
 * @param text - Sample text, usually the paragraph about to be wrapped.
 * @returns Dominant locale and script, or null when no catalog script is present.
 */
function inferLocaleFromScript(text: string): { locale: string; script: ScriptFamily } | null {
  const thai = countScriptMatches(text, THAI_SCRIPT_RE);
  const lao = countScriptMatches(text, LAO_SCRIPT_RE);
  const khmer = countScriptMatches(text, KHMER_SCRIPT_RE);
  const myanmar = countScriptMatches(text, MYANMAR_SCRIPT_RE);
  const kana = countScriptMatches(text, JAPANESE_KANA_RE);
  const hangul = countScriptMatches(text, HANGUL_SCRIPT_RE);
  const han = countScriptMatches(text, HAN_SCRIPT_RE);

  const evidence: ScriptEvidence[] = [
    { locale: 'th', script: 'thai', score: thai },
    { locale: 'lo', script: 'lao', score: lao },
    { locale: 'km', script: 'khmer', score: khmer },
    { locale: 'my', script: 'myanmar', score: myanmar },
    // Kana plus its Han companions are one Japanese sample, not a separate Han sample.
    { locale: 'ja', script: 'japanese', score: kana > 0 ? kana + han : 0 },
    { locale: 'ko', script: 'hangul', score: hangul },
    { locale: 'zh', script: 'han', score: kana > 0 ? 0 : han },
  ];

  let best: ScriptEvidence | null = null;
  for (const candidate of evidence) {
    if (candidate.score > 0 && (best === null || candidate.score > best.score)) best = candidate;
  }
  return best ? { locale: best.locale, script: best.script } : null;
}

/**
 * Resolves the ICU locale that should segment a target language and text sample.
 *
 * A caller-supplied locale wins when it matches the sample's script. Script evidence wins when the
 * target is omitted or mismatched, so Thai text rendered under Studio's default `'en'` still asks
 * ICU for `Intl.Segmenter('th', { granularity: 'word' })`.
 *
 * @param targetLang - Requested language code, BCP-47 tag, or language name.
 * @param sampleText - Text about to be segmented; may carry stronger script evidence.
 * @returns Locale for `Intl.Segmenter`.
 */
export function resolveSegmenterLocale(targetLang?: string, sampleText?: string): string {
  const requested = normalizeLocale(targetLang);
  const evidence = sampleText ? inferLocaleFromScript(sampleText) : null;

  if (!evidence) return requested ?? DEFAULT_SEGMENTER_LOCALE;
  if (!requested) return evidence.locale;

  const requestedScript = scriptFamilyOfLocale(requested);
  if (requestedScript && areScriptsCompatible(requestedScript, evidence.script)) {
    return requested;
  }
  return evidence.locale;
}

/**
 * Returns a cached ICU segmenter, or null when the runtime cannot construct one.
 *
 * @param locale - Locale resolved by {@link resolveSegmenterLocale}.
 * @param granularity - Grapheme or word segmentation.
 * @returns Cached segmenter, or null when unavailable or the locale is rejected.
 */
function getCachedSegmenter(
  locale: string,
  granularity: SegmentGranularity
): Intl.Segmenter | null {
  const cacheKey = `${granularity}:${locale}`;
  const cached = segmenterCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let segmenter: Intl.Segmenter | null = null;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      segmenter = new Intl.Segmenter(locale, { granularity });
    } catch {
      // An unsupported or malformed locale must degrade to the deterministic cluster fallback.
      segmenter = null;
    }
  }
  segmenterCache.set(cacheKey, segmenter);
  return segmenter;
}

/**
 * Splits text into user-perceived characters (grapheme clusters).
 *
 * @param text - Text to split.
 * @param locale - Optional locale for locale-sensitive grapheme rules.
 * @returns Grapheme clusters in source order.
 */
export function segmentGraphemes(text: string, locale?: string): string[] {
  if (!text) return [];
  const segmenter = getCachedSegmenter(
    locale ?? resolveSegmenterLocale(undefined, text),
    'grapheme'
  );
  if (!segmenter) return Array.from(text);

  const graphemes: string[] = [];
  for (const part of segmenter.segment(text)) graphemes.push(part.segment);
  return graphemes;
}

/**
 * Decides whether a UTF-16 offset lies between two surrogate halves.
 *
 * @param text - Source text.
 * @param offset - Candidate break offset.
 * @returns True when splitting at the offset would cut one code point in half.
 */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return (
    before >= HIGH_SURROGATE_MIN &&
    before <= HIGH_SURROGATE_MAX &&
    after >= LOW_SURROGATE_MIN &&
    after <= LOW_SURROGATE_MAX
  );
}

/**
 * Appends one unit to the token stream, binding it backward whenever orthography demands it.
 * Shared by the cluster fallback and the ICU word tokenizer so both obey identical Kinsoku rules.
 *
 * @param tokens - Mutable token stream; the last token may absorb the unit.
 * @param unit - Candidate orthographic cluster or atomic Latin run.
 * @param leadingWhitespace - Whitespace collected before the first token.
 * @returns The leading whitespace that remains to be attached, if any.
 */
function appendBoundToken(
  tokens: string[],
  unit: string,
  leadingWhitespace: string
): string {
  if (!unit) return leadingWhitespace;
  const prefixed = tokens.length === 0 && leadingWhitespace ? `${leadingWhitespace}${unit}` : unit;
  const firstChar = unit[0];
  const lastIndex = tokens.length - 1;

  if (lastIndex >= 0) {
    const last = tokens[lastIndex];
    const lastChar = last[last.length - 1];
    const bindsBackward =
      COMBINING_MARK_RE.test(firstChar) ||
      THAI_TRAILING_VOWEL_RE.test(firstChar) ||
      THAI_MAIYAMOK_RE.test(firstChar) ||
      NO_LINE_START_RE.test(unit) ||
      THAI_LEADING_VOWEL_RE.test(lastChar) ||
      OPENING_MARK_RE.test(lastChar);
    if (bindsBackward) {
      tokens[lastIndex] = `${last}${unit}`;
      return '';
    }
  }

  tokens.push(prefixed);
  return '';
}

/**
 * Splits whitespace-free script text into orthographic clusters without a dictionary.
 *
 * This is the deterministic fallback for runtimes without `Intl.Segmenter`. A unit is one of:
 * - a contiguous Latin/digit run (`[A-Za-z0-9'’-]+`), kept atomic;
 * - a base glyph plus following Unicode marks and Thai/Lao trailing vowels;
 * - a glyph pulled forward by a preceding Thai/Lao leading vowel or opening mark;
 * - punctuation barred from line start, bound backward to the preceding cluster.
 *
 * Whitespace is kept as a suffix of the preceding token so a wrapper can drop it at a line break.
 *
 * @param text - Paragraph containing a no-space script.
 * @returns Orthographic clusters in source order; concatenating them reproduces the text.
 */
export function tokenizeNoSpaceScriptClusters(text: string): string[] {
  const tokens: string[] = [];
  let latinRun = '';
  let leadingWhitespace = '';

  /**
   * Flushes the pending Latin/digit run as one atomic token.
   */
  const flushLatinRun = (): void => {
    if (!latinRun) return;
    const run = latinRun;
    latinRun = '';
    leadingWhitespace = appendBoundToken(tokens, run, leadingWhitespace);
  };

  for (const char of text) {
    if (WHITESPACE_RE.test(char)) {
      flushLatinRun();
      if (tokens.length > 0) tokens[tokens.length - 1] += char;
      else leadingWhitespace += char;
      continue;
    }
    if (LATIN_RUN_RE.test(char)) {
      latinRun += char;
      continue;
    }
    flushLatinRun();
    leadingWhitespace = appendBoundToken(tokens, char, leadingWhitespace);
  }
  flushLatinRun();

  return tokens;
}

/**
 * Segments a no-space script paragraph into word-level wrap tokens.
 *
 * Uses a cached ICU word segmenter for the locale resolved from the target and sample text.
 * Segmentation is then repaired so tokens obey the wrapping contract:
 * - whitespace stays attached as a suffix of the preceding token;
 * - Latin/digit runs such as `PDF`, `Server`, `123`, and `don't` stay atomic;
 * - no token starts with a Unicode mark, Thai/Lao trailing vowel, maiyamok, or Kinsoku
 *   no-line-start punctuation; `OPENING_MARK_RE` and Thai/Lao leading vowels bind forward.
 *
 * Falls back to {@link tokenizeNoSpaceScriptClusters} when ICU is unavailable or yields no tokens.
 *
 * @param text - Paragraph containing a no-space script.
 * @param targetLang - Target language; sample script evidence overrides a mismatch.
 * @returns Word tokens in source order; concatenating them reproduces the text.
 */
export function tokenizeNoSpaceScriptWords(text: string, targetLang?: string): string[] {
  if (!text) return [];

  const segmenter = getCachedSegmenter(resolveSegmenterLocale(targetLang, text), 'word');
  if (!segmenter) return tokenizeNoSpaceScriptClusters(text);

  const tokens: string[] = [];
  let leadingWhitespace = '';

  for (const part of segmenter.segment(text)) {
    const segment = part.segment;
    if (!segment) continue;

    if (WHITESPACE_ONLY_RE.test(segment)) {
      if (tokens.length > 0) tokens[tokens.length - 1] += segment;
      else leadingWhitespace += segment;
      continue;
    }

    leadingWhitespace = appendBoundToken(tokens, segment, leadingWhitespace);
  }

  return tokens.length > 0 ? tokens : tokenizeNoSpaceScriptClusters(text);
}

/**
 * Reports whether an offset is a boundary between two non-whitespace script glyphs, where at least
 * one side belongs to a no-space script.
 *
 * @param text - Source text.
 * @param offset - Candidate UTF-16 break offset.
 * @returns True when the break belongs to a no-space script run.
 */
function isNoSpaceScriptBoundary(text: string, offset: number): boolean {
  const before = text[offset - 1];
  const after = text[offset];
  if (!before || !after) return false;
  if (WHITESPACE_RE.test(before) || WHITESPACE_RE.test(after)) return false;
  return SPACELESS_SCRIPT_RE.test(before) || SPACELESS_SCRIPT_RE.test(after);
}

/**
 * Rejects a break offset that would split a grapheme cluster or leave forbidden glyphs at a line
 * edge. Applying the same rules at both edges keeps the ICU word boundaries safe to render.
 *
 * @param text - Source text.
 * @param offset - Candidate UTF-16 break offset, strictly inside the text.
 * @returns True when a renderer must not break at this offset.
 */
function isForbiddenBreakOffset(text: string, offset: number): boolean {
  if (splitsSurrogatePair(text, offset)) return true;

  const before = text[offset - 1];
  const after = text[offset];

  // A line may not end inside a cluster or leave a leading vowel / opening mark dangling.
  if (COMBINING_MARK_RE.test(before)) return true;
  if (THAI_LEADING_VOWEL_RE.test(before)) return true;
  if (OPENING_MARK_RE.test(before)) return true;

  // A line may not begin with a mark, trailing vowel, maiyamok, or Kinsoku punctuation.
  if (COMBINING_MARK_RE.test(after)) return true;
  if (THAI_TRAILING_VOWEL_RE.test(after)) return true;
  if (THAI_MAIYAMOK_RE.test(after)) return true;
  if (NO_LINE_START_RE.test(after)) return true;

  return false;
}

/**
 * Collects safe interior UTF-16 break offsets for no-space script runs.
 *
 * ICU word boundaries are the primary source. Every offset is filtered against Kinsoku and
 * orthographic invariants so a contour segmenter can merge them into its UAX #14 opportunity list
 * without producing a line that starts on `ๆ`, a combining mark, or a Thai/Lao trailing vowel.
 *
 * @param text - Source text, usually one paragraph.
 * @param targetLang - Target language; sample script evidence overrides a mismatch.
 * @returns Sorted, unique offsets strictly between 0 and `text.length`.
 */
export function collectWordBreakOffsets(text: string, targetLang?: string): number[] {
  if (text.length < 2) return [];

  const offsets = new Set<number>();
  const addSafeOffset = (offset: number): void => {
    if (offset <= 0 || offset >= text.length) return;
    if (!isNoSpaceScriptBoundary(text, offset)) return;
    if (isForbiddenBreakOffset(text, offset)) return;
    offsets.add(offset);
  };

  const segmenter = getCachedSegmenter(resolveSegmenterLocale(targetLang, text), 'word');
  if (segmenter) {
    let offset = 0;
    for (const part of segmenter.segment(text)) {
      offset += part.segment.length;
      addSafeOffset(offset);
    }
  } else {
    // Cluster offsets mirror the ICU word boundaries closely enough for the deterministic fallback.
    let offset = 0;
    for (const token of tokenizeNoSpaceScriptClusters(text)) {
      offset += token.length;
      addSafeOffset(offset);
    }
  }

  return [...offsets].sort((a, b) => a - b);
}
