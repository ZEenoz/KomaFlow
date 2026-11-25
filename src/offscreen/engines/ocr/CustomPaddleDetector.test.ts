import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./extractPolygons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extractPolygons')>();
  return { ...actual, extractPolygons: vi.fn(() => []) };
});

import { extractPolygons } from './extractPolygons';
import {
  CustomPaddleDetector,
  DEFAULT_DETECTION_THRESHOLD,
  DEFAULT_UNCLIP_RATIO,
  type DetectionPostProcessingOptions,
} from './CustomPaddleDetector';

/** Minimal canvas the detector adapter can pass through without resampling. */
interface FakeCanvas {
  width: number;
  height: number;
}

/** Allocates a pass-through canvas for the detector service fake. */
function createCanvas(width: number, height: number): FakeCanvas {
  return { width, height };
}

/**
 * Builds a fake PaddleOcrService exposing only the detector surface used by detection.
 *
 * @param inputNames - Declared ONNX session input names, or undefined to mimic older sessions.
 * @param probabilityThreshold - Optional dependency-level DBNet threshold.
 * @returns Service fake plus the session run spy.
 */
function createService(inputNames: string[] | undefined, probabilityThreshold?: number) {
  const outputName = 'sigmoid_0.tmp_0';
  const run = vi.fn(async () => ({
    [outputName]: { data: new Float32Array(32 * 32), dims: [1, 1, 32, 32], dispose: vi.fn() },
  }));
  const service = {
    options: {
      detection: probabilityThreshold === undefined ? {} : { probabilityThreshold },
    },
    platform: {
      createCanvas,
      ort: {
        Tensor: class {
          type: string;
          data: Float32Array;
          dims: number[];
          constructor(type: string, data: Float32Array, dims: number[]) {
            this.type = type;
            this.data = data;
            this.dims = dims;
          }
          dispose() {}
        },
      },
    },
    detector: {
      options: { maxSideLength: 640 },
      session: { inputNames, outputNames: [outputName], run },
      preprocessDetection: vi.fn(async (canvas: FakeCanvas) => ({
        tensor: new Float32Array(3 * canvas.width * canvas.height),
        width: canvas.width,
        height: canvas.height,
      })),
    },
  };
  return { service, run };
}

/**
 * Runs one detection pass and returns the arguments forwarded to extractPolygons.
 *
 * @param postProcessing - Optional per-tier DBNet overrides.
 * @param probabilityThreshold - Optional dependency-level DBNet threshold.
 * @param inputNames - Declared ONNX session input names.
 * @returns The last extractPolygons call arguments, or undefined.
 */
async function detect(
  postProcessing?: DetectionPostProcessingOptions,
  probabilityThreshold?: number,
  inputNames?: string[],
) {
  const { service } = createService(inputNames, probabilityThreshold);
  const detector = new CustomPaddleDetector(service, postProcessing);
  await detector.detectPolygons(createCanvas(32, 32) as any);
  return vi.mocked(extractPolygons).mock.calls.at(-1);
}

describe('CustomPaddleDetector DB post-processing', () => {
  beforeEach(() => {
    vi.mocked(extractPolygons).mockClear();
  });

  it('uses the 0.3 detection threshold and 1.8 unclip ratio when unset', async () => {
    const args = await detect();

    expect(DEFAULT_DETECTION_THRESHOLD).toBe(0.3);
    expect(DEFAULT_UNCLIP_RATIO).toBe(1.8);
    expect(args?.[5]).toBe(0.3);
    expect(args?.[6]).toBe(1.8);
  });

  it('applies the v6-manga per-tier 0.15 threshold, 1.5 unclip ratio, and 0.25 box threshold', async () => {
    const args = await detect({ detectionThreshold: 0.15, unclipRatio: 1.5, boxThreshold: 0.25 });

    expect(args?.[5]).toBe(0.15);
    expect(args?.[6]).toBe(1.5);
    expect(args?.[8]).toBe(0.25);
  });

  it('keeps the dependency probability threshold for tiers without an override', async () => {
    const args = await detect(undefined, 0.42);

    expect(args?.[5]).toBe(0.42);
    expect(args?.[6]).toBe(1.8);
  });

  it('feeds the session-declared first input name when the export renames it', async () => {
    const { service, run } = createService(['images']);
    await new CustomPaddleDetector(service).detectPolygons(createCanvas(32, 32) as any);

    expect(run).toHaveBeenCalledWith({ images: expect.anything() });
  });

  it('falls back to the conventional x input when no input names are exposed', async () => {
    const { service, run } = createService(undefined);
    await new CustomPaddleDetector(service).detectPolygons(createCanvas(32, 32) as any);

    expect(run).toHaveBeenCalledWith({ x: expect.anything() });
  });
});
