/**
 * inkMetrics.ts
 * Measures real glyph ink extents so line pitch covers stacked marks (Thai, Lao, Khmer, Myanmar)
 * instead of assuming every line stays inside one em box.
 */

/** Extra leading above measured glyph ink, as a fraction of font size. */
export const INK_LEADING_RATIO = 0.1;

/**
 * Returns the tallest actual glyph ink height across the rendered lines.
 * A context that omits `actualBoundingBoxAscent`/`actualBoundingBoxDescent` (width-only mocks)
 * yields null so callers keep their legacy line advance.
 *
 * @param ctx - Canvas-compatible context positioned at the line font.
 * @param lines - Rendered line strings, in draw order.
 * @returns Tallest `ascent + descent` ink height in pixels, or null when no finite ink exists.
 */
export function measureLineInkHeight(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  lines: readonly string[]
): number | null {
  let maxAscent = 0;
  let maxDescent = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    if (!Number.isFinite(ascent) || !Number.isFinite(descent)) continue;
    maxAscent = Math.max(maxAscent, ascent);
    maxDescent = Math.max(maxDescent, descent);
  }
  const combined = maxAscent + maxDescent;
  return combined > 0 ? combined : null;
}

/**
 * Resolves the baseline advance between adjacent lines.
 * The minimum ratio keeps ordinary Latin leading; measured stacked-mark ink wins when taller.
 *
 * @param fontSize - Rendered font size in pixels.
 * @param inkHeight - Measured ink height from {@link measureLineInkHeight}, or null.
 * @param minimumRatio - Minimum line advance as a multiple of font size.
 * @returns Baseline advance in pixels.
 */
export function resolveLinePitch(fontSize: number, inkHeight: number | null, minimumRatio: number): number {
  return Math.max(
    fontSize * minimumRatio,
    inkHeight !== null ? inkHeight + Math.ceil(fontSize * INK_LEADING_RATIO) : 0
  );
}
