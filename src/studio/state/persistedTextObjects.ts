import type { TextBlock } from '../../db';
import type { TextObject } from '../types';
import { prepareInitialTextObject } from '../canvas/studioTypeset';
import { healLineBreakHyphens } from '../../offscreen/utils/typography';

/**
 * Serializes a Studio text object into its persisted database row.
 * Both save paths use this one mapping, so every editable typography field (casing,
 * gradients, stroke, spacing, per-character overrides, language) round-trips.
 *
 * @param imageId - Parent image record.
 * @param obj - Studio text object to persist.
 * @returns TextBlock ready for `db.textBlocks`.
 */
export function serializeTextObject(imageId: number, obj: TextObject): TextBlock {
  return {
    imageId,
    originalText: obj.originalText || '',
    translatedText: obj.text,
    posX: obj.x,
    posY: obj.y,
    width: obj.width,
    height: obj.height,
    fontSize: obj.fontSize || 16,
    fontFamily: obj.fontFamily || 'WildWords, CCWildWords, sans-serif',
    bold: obj.bold,
    italic: obj.italic,
    align: obj.align,
    color: obj.color || '#000000',
    strokeColor: obj.strokeColor || '#ffffff',
    strokeWidth: obj.strokeWidth ?? 2,
    direction: obj.isVertical ? 'v' : 'h',
    lines: obj.lines,
    lineSpacing: obj.lineSpacing,
    positionedLines: obj.positionedLines,
    textFromGeneratedLines: obj.textFromGeneratedLines,
    typesetMode: obj.typesetMode,
    borderRadius: obj.borderRadius,
    isRounded: obj.isRounded,
    contourPoints: obj.contourPoints,
    isSkipped: obj.isSkipped,
    isArtwork: obj.isArtwork,
    angle: obj.rotation ?? 0,
    uppercase: obj.uppercase,
    lowercase: obj.lowercase,
    letterSpacing: obj.letterSpacing,
    opacity: obj.opacity,
    targetLang: obj.targetLang,
    charStyles: obj.charStyles,
    color2: obj.color2,
    isGradient: obj.isGradient,
    gradientAngle: obj.gradientAngle,
    strokeColor2: obj.strokeColor2,
    isStrokeGradient: obj.isStrokeGradient,
    shadowColor: obj.shadowColor,
    shadowBlur: obj.shadowBlur,
    shadowAngle: obj.shadowAngle,
    shadowDistance: obj.shadowDistance,
    backgroundFill: obj.backgroundFill,
    backgroundPadding: obj.backgroundPadding,
    backgroundBorderRadius: obj.backgroundBorderRadius,
  };
}

/**
 * Restores exact renderer output, initializing legacy records only when measured lines are absent.
 * @param block - Saved text block, including final measured lines and geometry when available.
 * @param targetLang - Active job translation language used for future hyphenation when the
 *                     block itself does not carry one (restores otherwise default to 'en').
 * @returns Studio text object preserving the pipeline's layout and lettering.
 */
export function restoreTextObject(block: TextBlock, targetLang?: string): TextObject {
  const isCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(block.translatedText);
  const hasPersistedLines = Boolean(block.lines?.length);
  const textFromGeneratedLines = block.textFromGeneratedLines ?? hasPersistedLines;
  // Prefer translatedText when Studio authored explicit breaks or casing transforms so
  // reload never overwrites mixed-case source or user-authored newlines with display lines.
  const preferTranslatedSource =
    !hasPersistedLines ||
    block.textFromGeneratedLines === false ||
    Boolean(block.uppercase || block.lowercase);
  const rawText = preferTranslatedSource
    ? (block.translatedText || (hasPersistedLines ? block.lines!.join('\n') : ''))
    : block.lines!.join('\n');
  // Un-hyphenate typesetter-inserted soft line-break hyphens (marked with INSERTED_HYPHEN)
  // so resizing boxes does not bake broken syllables into the editable text. The
  // structure-preserving heal keeps the persisted line layout (incl. CJK line breaks)
  // while rejoining both marked and legacy plain-hyphen splits, case-insensitively.
  const unhyphenatedText = healLineBreakHyphens(rawText);
  return prepareInitialTextObject({
    id: String(block.id || `tb-${block.posX}-${block.posY}`),
    x: block.posX,
    y: block.posY,
    width: block.width,
    height: block.height,
    text: unhyphenatedText,
    lines: block.lines,
    // Persisted renderer lines are generated layout unless the user explicitly authored text.
    textFromGeneratedLines,
    targetLang: block.targetLang ?? targetLang,
    lineSpacing: block.lineSpacing,
    typesetMode: (block.typesetMode as string) === 'ellipse' ? 'contour' : (block.typesetMode || (block.contourPoints && block.contourPoints.length >= 3 ? 'contour' : 'balloon')),
    borderRadius: block.borderRadius,
    isRounded: block.isRounded,
    contourPoints: block.contourPoints,
    originalContourPoints: block.contourPoints,
    detectedWidth: block.width,
    detectedHeight: block.height,
    positionedLines: block.positionedLines,
    originalText: block.originalText,
    fontSize: block.fontSize || 16,
    fontFamily: block.fontFamily || 'WildWords, CCWildWords, sans-serif',
    bold: block.bold ?? false,
    italic: block.italic ?? false,
    align: block.align || 'center',
    color: block.color || '#000000',
    color2: block.color2,
    isGradient: block.isGradient,
    gradientAngle: block.gradientAngle,
    strokeColor: block.strokeColor || '#ffffff',
    strokeColor2: block.strokeColor2,
    isStrokeGradient: block.isStrokeGradient,
    strokeWidth: block.strokeWidth ?? 2,
    uppercase: block.uppercase,
    lowercase: block.lowercase,
    letterSpacing: block.letterSpacing,
    opacity: block.opacity,
    charStyles: block.charStyles ?? undefined,
    shadowColor: block.shadowColor,
    shadowBlur: block.shadowBlur,
    shadowAngle: block.shadowAngle,
    shadowDistance: block.shadowDistance,
    backgroundFill: block.backgroundFill,
    backgroundPadding: block.backgroundPadding,
    backgroundBorderRadius: block.backgroundBorderRadius,
    isVertical: block.direction === 'v' && isCjk,
    isSkipped: block.isSkipped ?? false,
    isArtwork: block.isArtwork ?? false,
    rotation: block.angle ?? 0,
  });
}
