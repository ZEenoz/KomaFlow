import {
  DEFAULT_OCR_TIER_ID,
  SUPPORTED_OCR_IDS,
  type OcrTierId,
} from '../../../shared/ocrTiers';

export interface OcrModelRegistryEntry {
  /** Human-readable model name. */
  name: string;
  /** Capability summary shown in the popup and Studio selectors. */
  description: string;
  /** ONNX text-detection model URL. */
  detectionUrl: string;
  /** ONNX text-recognition model URL. */
  recognitionUrl: string;
  /** Character dictionary URL consumed by the recognizer. */
  charactersDictionaryUrl: string;
  /**
   * DBNet binarization threshold for this tier. Omitted tiers use the detector's
   * default (`DEFAULT_DETECTION_THRESHOLD`, 0.3), preserving their existing behaviour.
   */
  detectionThreshold?: number;
  /**
   * DBNet polygon expansion factor for this tier. Omitted tiers use the detector's
   * default (`DEFAULT_UNCLIP_RATIO`, 1.8), preserving their existing behaviour.
   */
  unclipRatio?: number;
  /**
   * DBNet mean box-score threshold (`box_thresh`) for this tier. Omitted tiers keep
   * `extractPolygons`'s default (`0.5` horizontal / `0.35` vertical).
   */
  boxThreshold?: number;
}

const MODEL_BASE_URL = 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';
const DICT_BASE_URL = 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';

export const ocrRegistry: Record<OcrTierId, OcrModelRegistryEntry> = {
  'v6-small': {
    name: 'PaddleOCR v6 Small (Default)',
    description: 'Fast, balanced text detection and recognition. Best for most manga and web use.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv6_small_det.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/PP-OCRv6_small_rec.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/ppocrv6_dict.txt`
  },
  'v6-manga': {
    name: 'PaddleOCR v6 Manga (JA/ZH)',
    description: 'Manga-tuned Japanese/Chinese weights with lower DB thresholds for dense balloon lettering.',
    detectionUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/det/manga_det.onnx',
    recognitionUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/rec/manga_rec.onnx',
    charactersDictionaryUrl: 'https://huggingface.co/Kellenok/PP-OCRv6_manga/resolve/main/ppocrv6_dict.txt',
    detectionThreshold: 0.15,
    unclipRatio: 1.5,
    boxThreshold: 0.25
  },
  'v6-medium': {
    name: 'PaddleOCR v6 Medium',
    description: 'Higher accuracy model with larger capacity for complex text layout.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv6_medium_det.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/PP-OCRv6_medium_rec.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/ppocrv6_dict.txt`
  },
  'v6-tiny': {
    name: 'PaddleOCR v6 Tiny',
    description: 'Ultra-lightweight model for fastest inference speed on constrained hardware.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv6_tiny_det.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/PP-OCRv6_tiny_rec.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/ppocrv6_tiny_dict.txt`
  },
  'v5-mobile': {
    name: 'PaddleOCR v5 Mobile',
    description: 'PaddleOCR v5 mobile model for general multilingual text.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/PP-OCRv5_mobile_rec_infer.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt`
  },
  'v5-server': {
    name: 'PaddleOCR v5 Server',
    description: 'High-precision server tier model from PaddleOCR v5 series.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv5_server_det_infer.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/PP-OCRv5_server_rec_infer.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt`
  },
  'v5-en-mobile': {
    name: 'PaddleOCR v5 English Mobile',
    description: 'Optimized specifically for Latin and English text recognition.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt`
  },
  'v5-ko-mobile': {
    name: 'PaddleOCR v5 Korean',
    description: 'PaddleOCR v5 mobile weights tuned for Korean text recognition.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/multi/korean/v5/ppocrv5_korean_dict.txt`
  },
  'v5-th-mobile': {
    name: 'PaddleOCR v5 Thai',
    description: 'PaddleOCR v5 mobile weights tuned for Thai text recognition.',
    detectionUrl: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    recognitionUrl: `${MODEL_BASE_URL}/recognition/multi/th/v5/th_PP-OCRv5_mobile_rec_infer.onnx`,
    charactersDictionaryUrl: `${DICT_BASE_URL}/recognition/multi/th/v5/ppocrv5_th_dict.txt`
  }
};

/**
 * Resolves an OCR tier identifier to a canonical registry key.
 * Maps legacy identifiers (such as 'paddle-dbnet', 'v4-mobile', 'v3-*') and any unknown
 * value to {@link DEFAULT_OCR_TIER_ID} so removed tiers never reach model loading.
 *
 * @param tier - Raw tier string from user settings or message.
 * @returns Canonical tier key in ocrRegistry.
 */
export function resolveOcrTier(tier?: string): OcrTierId {
  if (tier && SUPPORTED_OCR_IDS.has(tier)) return tier as OcrTierId;
  return DEFAULT_OCR_TIER_ID;
}
