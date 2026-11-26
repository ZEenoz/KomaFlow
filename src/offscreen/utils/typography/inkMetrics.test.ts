import { describe, expect, it } from 'vitest';
import { INK_LEADING_RATIO, measureLineInkHeight, resolveLinePitch } from './inkMetrics';

/**
 * Builds a minimal measurement context that reports fixed glyph ink extents.
 *
 * @param ascent - Actual ink height above the alphabetic baseline.
 * @param descent - Actual ink depth below the alphabetic baseline.
 * @returns Context accepted by the ink measurement helper.
 */
function inkCtx(ascent: number, descent: number): Pick<CanvasRenderingContext2D, 'measureText'> {
  return {
    measureText: (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: ascent,
      actualBoundingBoxDescent: descent,
    }),
  } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>;
}

describe('inkMetrics', () => {
  it('measures Thai stacked-mark ink across rendered lines', () => {
    // 20px Thai line: 21px ascent (stacked vowels/tones) + 6px descent.
    expect(measureLineInkHeight(inkCtx(21, 6), ['ก็', 'นี้', 'ขึ้น'])).toBe(27);
  });

  it('keeps the tallest line when ink differs per line', () => {
    let call = 0;
    const ctx = {
      measureText: (text: string) => ({
        width: text.length * 10,
        actualBoundingBoxAscent: call++ === 0 ? 12 : 21,
        actualBoundingBoxDescent: 6,
      }),
    } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>;
    expect(measureLineInkHeight(ctx, ['plain', 'ก็'])).toBe(27);
  });

  it('combines max ascent and max descent across mixed-metric lines', () => {
    let call = 0;
    const ctx = {
      measureText: (text: string) => {
        const isFirst = call++ === 0;
        return {
          width: text.length * 10,
          actualBoundingBoxAscent: isFirst ? 0 : 21,
          actualBoundingBoxDescent: isFirst ? 10 : 0,
        };
      },
    } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>;
    expect(measureLineInkHeight(ctx, ['descender', 'ascender'])).toBe(31);
  });

  it('returns null for width-only mocks that omit ascent and descent', () => {
    const ctx = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>;
    expect(measureLineInkHeight(ctx, ['legacy', 'mock'])).toBeNull();
  });

  it('returns null when ink metrics are non-finite or empty', () => {
    const ctx = {
      measureText: () => ({
        width: 10,
        actualBoundingBoxAscent: Number.NaN,
        actualBoundingBoxDescent: 0,
      }),
    } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>;
    expect(measureLineInkHeight(ctx, ['x'])).toBeNull();
    expect(measureLineInkHeight(inkCtx(0, 0), [''])).toBeNull();
  });

  it('places the next line below Thai stacked marks instead of overlapping them', () => {
    const pitch = resolveLinePitch(20, 27, 1.01);
    expect(pitch).toBeGreaterThanOrEqual(27);
    expect(pitch).toBe(27 + Math.ceil(20 * INK_LEADING_RATIO));
  });

  it('falls back to the minimum ratio when ink metrics are unavailable', () => {
    expect(resolveLinePitch(20, null, 1.01)).toBeCloseTo(20 * 1.01);
    expect(resolveLinePitch(24, null, 1.2)).toBeCloseTo(28.8);
  });
});
