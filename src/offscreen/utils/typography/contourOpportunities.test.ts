import { describe, it, expect } from 'vitest';
import { computeLineBreakOpportunities } from './contourOpportunities';
import { NO_LINE_START_RE } from '../../../shared/text/lineBreaks';

/** Thai sentence used by the Studio caption-box regression reports. */
const THAI_SENTENCE = 'ถ้าพวกเขาเห็นท่าทางแปลกๆ จะทำยังไงดี!';

/** Mixed Thai dialogue with spaces, punctuation, and a terminal particle. */
const THAI_WITH_SPACES = 'ฉันจะไป แล้วเจอกัน! ดี';

describe('computeLineBreakOpportunities', () => {
  it('adds multiple Thai word offsets to the UAX #14 list', () => {
    const opportunities = computeLineBreakOpportunities(THAI_SENTENCE, 'th');
    expect(opportunities[0]).toEqual({ offset: 0, isMandatory: false });
    expect(opportunities[opportunities.length - 1].offset).toBe(THAI_SENTENCE.length);

    const interior = opportunities.filter(
      (opportunity) => opportunity.offset > 0 && opportunity.offset < THAI_SENTENCE.length
    );
    expect(interior.length).toBeGreaterThanOrEqual(4);

    const offsets = opportunities.map((opportunity) => opportunity.offset);
    expect(offsets).toEqual([...new Set(offsets)].sort((a, b) => a - b));
    for (const opportunity of interior) {
      expect(NO_LINE_START_RE.test(THAI_SENTENCE[opportunity.offset])).toBe(false);
    }
  });

  it('keeps the UAX #14 breaks that already existed in mixed Thai text', () => {
    const opportunities = computeLineBreakOpportunities(THAI_WITH_SPACES, 'th');
    const offsets = new Set(opportunities.map((opportunity) => opportunity.offset));
    // `linebreak` reports these word-space and sentence boundaries; merging Thai word offsets
    // must not drop them.
    expect(offsets.has(8)).toBe(true);
    expect(offsets.has(20)).toBe(true);
    expect(offsets.has(THAI_WITH_SPACES.length)).toBe(true);
    expect(opportunities.length).toBeGreaterThan(5);
  });

  it('preserves mandatory breaks while merging Thai word offsets', () => {
    const text = 'ฉันจะไป\nแล้วเจอกัน';
    const newlineOffset = text.indexOf('\n') + 1;
    const opportunities = computeLineBreakOpportunities(text, 'th');
    const newline = opportunities.find((opportunity) => opportunity.offset === newlineOffset);
    expect(newline?.isMandatory).toBe(true);

    const offsets = opportunities.map((opportunity) => opportunity.offset);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(text.length);
    expect(offsets).toEqual([...new Set(offsets)].sort((a, b) => a - b));
  });

  it('infers Thai word boundaries when the caller passes the default English target', () => {
    expect(computeLineBreakOpportunities(THAI_SENTENCE, 'en')).toEqual(
      computeLineBreakOpportunities(THAI_SENTENCE, 'th')
    );
  });

  it('leaves spaced-script opportunities untouched', () => {
    const english = 'Hello world';
    expect(computeLineBreakOpportunities(english, 'en')).toEqual([
      { offset: 0, isMandatory: false },
      { offset: 6, isMandatory: false },
      { offset: 11, isMandatory: false },
    ]);
    const japanese = '今日は良い天気です';
    expect(computeLineBreakOpportunities(japanese, 'ja')).toEqual(
      computeLineBreakOpportunities(japanese)
    );
  });
});
