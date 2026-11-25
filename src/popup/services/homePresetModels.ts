import type { PipelinePreset } from '../../shared/pipelinePresets';
import { COLOR_TIER_CATALOG } from '../../shared/colorTiers';
import { INPAINT_TIER_CATALOG } from '../../shared/inpaintTiers';
import { DEFAULT_OCR_TIER_ID, OCR_TIER_CATALOG } from '../../shared/ocrTiers';
import { BUBBLE_YOLO_MODEL_ID, type HomeEngineOption } from './homeModelCatalog';

/** One preset-selected model whose weights are not cached yet. */
export interface MissingPresetModel {
  /** Registry model id. */
  id: string;
  /** Label shown in the non-blocking download notice. */
  label: string;
}

/**
 * Finds local models selected by a preset that are not downloaded.
 *
 * @param preset - Preset whose engine fields should be checked.
 * @param engines - Current translation-engine catalog.
 * @param statuses - Model download states keyed by id.
 * @returns Missing models in pipeline order, deduplicated by id.
 */
export function findMissingPresetModels(
  preset: PipelinePreset,
  engines: readonly HomeEngineOption[],
  statuses: Record<string, boolean>,
): MissingPresetModel[] {
  const missing: MissingPresetModel[] = [];
  const seen = new Set<string>();
  /**
   * Adds one missing model once.
   *
   * @param id - Registry model id.
   * @param label - Human-readable model name.
   * @returns Nothing.
   */
  const add = (id: string, label: string): void => {
    if (statuses[id] || seen.has(id)) return;
    seen.add(id);
    missing.push({ id, label });
  };

  const selectedEngine = engines.find((engine) => engine.id === preset.activeEngineId);
  if (selectedEngine?.kind === 'local') add(selectedEngine.id, selectedEngine.name);

  const inpaint = INPAINT_TIER_CATALOG.find((tier) => tier.id === preset.activeInpaintId);
  if (inpaint?.isModel) add(inpaint.id, inpaint.name);

  const color = COLOR_TIER_CATALOG.find((tier) => tier.id === preset.activeColorId);
  if (color?.isModel) add(color.id, color.name);

  if (preset.activeOcrId !== DEFAULT_OCR_TIER_ID) {
    const ocr = OCR_TIER_CATALOG.find((tier) => tier.id === preset.activeOcrId);
    if (ocr) add(ocr.id, ocr.name);
  }

  if (preset.bubbleMode === 'neural') add(BUBBLE_YOLO_MODEL_ID, 'YOLO bubble detector');

  return missing;
}
