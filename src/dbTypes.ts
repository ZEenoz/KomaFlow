import type { TypesetMode } from './shared/constants';

/** Lifecycle states a translation job can report while it is queued or running. */
export type JobStatus = 'queued' | 'downloading' | 'processing' | 'completed' | 'error';

/** One page translation request plus the pipeline settings that produced it. */
export interface TranslationJob {
  /** Auto-incremented local primary key. */
  id?: number;
  /** Creation time in epoch milliseconds. */
  timestamp: number;
  /** Current pipeline lifecycle state. */
  status?: JobStatus;
  /** Source image URL or local upload identifier. */
  srcUrl?: string;
  /** Placeholder translated blocks retained for pipeline compatibility. */
  mockTranslatedBlocks?: any[];
  /** Optional reference to a ProjectFolder. */
  folderId?: number;
  /** Page ordering sequence inside a ProjectFolder. */
  projectOrder?: number;
  /** Optional user or chapter page label. */
  pageName?: string;
  /** Tracks which tab requested this job for the Pub/Sub response. */
  tabId?: number;
  /** OCR engine identifier used for this job. */
  ocrEngineId?: string;
  /** Inpainting tier used for this job. */
  inpaintTier?: string;
  /** Colorization tier used for this job. */
  colorTier?: string;
  /** Translation engine identifier used for this job. */
  translationEngineId?: string;
  /** Speech-bubble detection mode used for this job. */
  bubbleMode?: string;
  /** Render font preset identifier used for this job. */
  renderFontPresetId?: string;
  /** Whether the render font was bold. */
  renderFontBold?: boolean;
  /** Detected or requested source language. */
  sourceLang?: string;
  /** Requested target language. */
  targetLang?: string;
  /** Completion time in epoch milliseconds. */
  completedAt?: number;
  /** Wall-clock processing duration in milliseconds. */
  durationMs?: number;
  /** Stable identifier used by cross-device library sync. */
  syncId?: string;
  /** Last local modification time in epoch milliseconds. */
  updatedAt?: number;
}

/** A user-created manga project containing an ordered set of member jobs. */
export interface ProjectFolder {
  /** Auto-incremented local primary key. */
  id?: number;
  /** User-visible project title. */
  title: string;
  /** Creation time in epoch milliseconds. */
  timestamp: number;
  /** Whether the project is pinned as a favorite. */
  isFavorite: boolean;
  /** Last local modification time in epoch milliseconds. */
  updatedAt?: number;
  /** Member job shown as the project cover thumbnail. */
  coverJobId?: number;
  /** Explicit member ordering; missing IDs are ignored by readers. */
  customOrder?: number[];
  /** Optional user notes or summary. */
  description?: string;
  /** Stable identifier used by cross-device library sync. */
  syncId?: string;
}

/** Blob set stored for one translated page. */
export interface ImageRecord {
  /** Auto-incremented local primary key. */
  id?: number;
  /** Parent translation job. */
  jobId: number;
  /** Original source raster. */
  rawImageBlob: Blob;
  /** Inpainted plate with the source text removed; the dashboard shows this, not the lettering. */
  translatedImageBlob?: Blob;
  /** The page as delivered to the content script: translated text drawn in. Never rendered in the UI. */
  bakedImageBlob?: Blob;
}

/** One editable dialogue or lettering block belonging to an image. */
export interface TextBlock {
  /** Auto-incremented local primary key. */
  id?: number;
  /** Parent image record. */
  imageId: number;
  /** Text detected by OCR before translation. */
  originalText: string;
  /** Translated text shown on the page. */
  translatedText: string;
  /** Block origin on the X axis in image pixels. */
  posX: number;
  /** Block origin on the Y axis in image pixels. */
  posY: number;
  /** Block width in image pixels. */
  width: number;
  /** Block height in image pixels. */
  height: number;
  /** Base font size in image pixels. */
  fontSize: number;
  /** Requested font family. */
  fontFamily: string;
  /** Base glyph color. */
  color: string;
  /** Outline color used by the renderer (background-sampled). */
  strokeColor?: string;
  /** Text direction; vertical text flows top-to-bottom. */
  direction?: 'h' | 'v';
  /** Exact Canvas layout lines, persisted so Studio preview matches baked output. */
  lines?: string[];
  /** Rendered line advance as a multiple of font size, shared with Studio. */
  lineSpacing?: number;
  /** Studio editing preference; never used to reinterpret saved layout on load. */
  typesetMode?: TypesetMode;
  /** Mathematical bubble corner radius in image pixels (0 = rectangle, >0 = oval/ellipse curvature). */
  borderRadius?: number;
  /** Whether this text block was fitted to a rounded speech bubble. */
  isRounded?: boolean;
  /** Organic bubble contour relative to (posX, posY) for scanline contour typesetting in Studio. */
  contourPoints?: Array<{ x: number; y: number }>;
  /** Koharu scanline placements (box-local) so Studio paints the exact baked layout before any edit. */
  positionedLines?: Array<{ text: string; x: number; y: number; width: number; height: number }>;
  /** Whether the glyphs are bold. */
  bold?: boolean;
  /** Whether the glyphs are italic. */
  italic?: boolean;
  /** Horizontal alignment inside the block. */
  align?: 'left' | 'center' | 'right';
  /** Marks a block the renderer must not paint. */
  isSkipped?: boolean;
  /**
   * Preserved artwork (sound effect / display lettering / fragment) under the active SFX policy.
   *
   * Such a block is never erased and never drawn: the original ink stays on the page. Studio must
   * honour the same pair, otherwise it paints a translation over artwork the pipeline left intact.
   */
  isArtwork?: boolean;
  /** Text block rotation angle in degrees (mean line angle, e.g. -180 to 180). */
  angle?: number;
}

/** A font face persisted in the on-demand library (catalog download or user import). */
export interface FontRecord {
  /** Stable key: catalog id, or `import-<sanitized>-<timestamp>` for user imports. */
  id: string;
  /** CSS family name the face registers under. */
  family: string;
  /** Display label for pickers. */
  label: string;
  /** Where this face came from; imports render on the storing machine's terms. */
  source: 'catalog' | 'import';
  /** Raw font bytes (woff2/ttf/otf). */
  data: ArrayBuffer;
  /** Epoch milliseconds when the face was added. */
  addedAt: number;
}
