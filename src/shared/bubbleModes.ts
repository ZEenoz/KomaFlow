import type { BubbleDetectionMode } from './types';

/** Registry id for the neural YOLO speech-bubble segmentation detector. */
export const BUBBLE_YOLO_MODEL_ID = 'bubble-yolo';

/** Descriptor for one Layout & Bubble Fit mode across popup Settings and Home presets. */
export interface BubbleModeOption {
  /** Persisted bubble-detection mode value. */
  readonly id: BubbleDetectionMode;
  /** Full user-facing label shown in Settings and Preset editors. */
  readonly name: string;
  /** Short label used in compact Home status pills. */
  readonly shortName: string;
  /** Tooltip explaining how this mode fits text. */
  readonly tooltip: string;
  /** True when the mode requires downloading ONNX model weights. */
  readonly isModel?: boolean;
}

/**
 * Single Source of Truth for Layout & Bubble Fit modes across Settings, Home, and Presets.
 */
export const BUBBLE_MODE_OPTIONS: readonly BubbleModeOption[] = [
  {
    id: 'off',
    name: 'Disabled',
    shortName: 'Off',
    tooltip: 'Tightly hugs source text lines without bubble expansion (Cotrans MST).',
  },
  {
    id: 'heuristic',
    name: 'Heuristic',
    shortName: 'Heuristic',
    tooltip: 'Expands into white bubble whitespace with tail severing. Fast (<1ms), zero download.',
  },
  {
    id: 'neural',
    name: 'YOLO (AI)',
    shortName: 'YOLO',
    tooltip: 'Neural segmentation mask with morphological tail severing on AI contours (~11 MB).',
    isModel: true,
  },
];
