import { extractPolygons, type Point2D } from './extractPolygons';
import { prepareHighQualityDetectionCanvas } from './DetectionResize';

/** DBNet binarization threshold used when a tier and the service specify none (PaddleOCR default). */
export const DEFAULT_DETECTION_THRESHOLD = 0.3;

/**
 * DBNet polygon expansion factor (PaddleOCR `--det_db_unclip_ratio`). Controls how far the
 * raw segmentation contour is pushed outward via a Clipper polygon offset before becoming
 * the final box — 1.8 ensures anti-aliased character edges and kanji radicals are swallowed
 * without truncating at the quad boundary.
 */
export const DEFAULT_UNCLIP_RATIO = 1.8;

/** Per-tier DBNet post-processing overrides; omitted fields keep the defaults above. */
export interface DetectionPostProcessingOptions {
  /** DBNet binarization threshold for this tier. */
  detectionThreshold?: number;
  /** DBNet polygon expansion factor for this tier. */
  unclipRatio?: number;
  /** DBNet mean box-score gate for this tier. */
  boxThreshold?: number;
}

export interface DetectionOutput {
  /** 4-point text quadrilaterals in original image coordinates. */
  polygons: Point2D[][];
  /** DBNet confidence per polygon (Cotrans box_score_fast), index-aligned with `polygons`. */
  scores: number[];
  maskRawCanvas?: any;
}

/**
 * CustomPaddleDetector wraps the internal DetectionService from ppu-paddle-ocr
 * to intercept the raw probability map tensor and run our pure JS polygon extraction
 * (bypassing their post-processing which deletes the polygons).
 */
export class CustomPaddleDetector {
  private service: any; // PaddleOcrService instance
  private postProcessing: DetectionPostProcessingOptions;

  /**
   * Constructs a new CustomPaddleDetector instance.
   *
   * @param service - An initialized PaddleOcrService instance.
   * @param postProcessing - Optional per-tier DBNet threshold and unclip overrides.
   */
  constructor(service: any, postProcessing: DetectionPostProcessingOptions = {}) {
    this.service = service;
    this.postProcessing = postProcessing;
  }

  /**
   * Runs the underlying ONNX detection model and returns extracted text polygons.
   * Raw DBNet mask generation is skipped because the locked inpaint contract consumes polygons only.
   * Accepts either an ArrayBuffer or a prepared canvas (e.g. for tiled sub-image detection).
   *
   * @param imageInput - The raw ArrayBuffer of the image, or an existing Canvas instance.
   * @returns A promise that resolves to polygons, scores, and an undefined legacy mask field.
   */
  async detectPolygons(imageInput: ArrayBuffer | any): Promise<DetectionOutput> {
    if (!this.service || !this.service.detector) {
      throw new Error('CustomPaddleDetector: PaddleOcrService is not initialized.');
    }

    const detector = this.service.detector;
    const platform = this.service.platform;

    // 1. Load image and preprocess it into the tensor format (reuse existing canvas if provided).
    // The high-quality adapter resamples once with explicit smoothing at the dependency's exact
    // unpadded target size, so the internal draw becomes 1:1 and its default-quality kernel no
    // longer applies. Padding/normalization stay inside the dependency.
    console.log('[CustomPaddleDetector] Preprocessing image for WebGPU/WASM...');
    const canvas = (imageInput && typeof imageInput.width === 'number' && typeof imageInput.height === 'number')
      ? imageInput
      : await platform.canvas.prepareCanvas(imageInput);
    // The adapter must use the same limit preprocessDetection will apply (its merged options).
    const maxSideLength = detector.options?.maxSideLength
      ?? this.service.options.detection?.maxSideLength ?? 640;
    const prepared = prepareHighQualityDetectionCanvas(
      canvas, maxSideLength, (width, height) => platform.createCanvas(width, height),
    );
    const input = await detector.preprocessDetection(prepared.canvas);
    // preprocessDetection recomputes resizeRatio from the prepared canvas (1:1 after our
    // resample), so restore the true original dimensions and original-to-model scale here.
    const detectionInput = {
      ...input,
      originalWidth: prepared.originalWidth,
      originalHeight: prepared.originalHeight,
      resizeRatio: prepared.resizeRatio,
    };

    // 2. Run inference with explicit input and output tensor disposal
    console.log(`[CustomPaddleDetector] Running ONNX inference (${input.width}x${input.height})...`);
    let inputTensor: any;
    let results: any;
    let probabilityMap: Float32Array | null = null;
    try {
      inputTensor = new platform.ort.Tensor('float32', input.tensor, [1, 3, input.height, input.width]);
      // Custom exports name the image input differently (`images`, `input`, ...), so feed the
      // session-declared first input instead of assuming the dependency's `x`.
      const inputName = detector.session.inputNames?.[0] || 'x';
      results = await detector.session.run({ [inputName]: inputTensor });
      const outKey = detector.session.outputNames?.[0] || 'sigmoid_0.tmp_0';
      const outputTensor = results[outKey] || Object.values(results)[0];
      if (outputTensor?.data) {
        probabilityMap = new Float32Array(outputTensor.data);
      }
    } finally {
      inputTensor?.dispose?.();
      if (results) {
        for (const t of Object.values(results) as any[]) {
          t?.dispose?.();
        }
      }
    }

    if (!probabilityMap) {
      console.warn('[CustomPaddleDetector] Probability map is null. No text found.');
      return { polygons: [], scores: [] };
    }

    const thresh = this.postProcessing.detectionThreshold
      ?? this.service.options.detection?.probabilityThreshold
      ?? DEFAULT_DETECTION_THRESHOLD;
    const unclipRatio = this.postProcessing.unclipRatio ?? DEFAULT_UNCLIP_RATIO;

    // 3. Post-process the raw tensor map using our pure JS polygon extractor
    console.log('[CustomPaddleDetector] Extracting oriented polygons from probability map...');
    const detected = extractPolygons(
      probabilityMap,
      input.width,
      input.height,
      detectionInput.originalWidth,
      detectionInput.originalHeight,
      thresh,
      unclipRatio,
      detectionInput.resizeRatio,
      this.postProcessing.boxThreshold
    );

    const polygons = detected.map(d => d.points);
    const scores = detected.map(d => d.score);

    console.log(`[CustomPaddleDetector] Found ${polygons.length} text polygons.`);
    return { polygons, scores, maskRawCanvas: undefined };
  }
}
