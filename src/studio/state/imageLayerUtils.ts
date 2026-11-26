import type { ImageLayer } from '../types';

/**
 * Moves an image layer one step through paint order.
 *
 * @param layers - Current layers in paint order (last entry is top-most).
 * @param id - Layer to move.
 * @param offset - `1` moves forward/top-most, `-1` moves backward/bottom-most.
 * @returns Reordered copy, or the same array when the layer is missing or already at the edge.
 */
export function moveImageLayer(
  layers: ImageLayer[],
  id: string,
  offset: 1 | -1
): ImageLayer[] {
  const index = layers.findIndex((layer) => layer.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= layers.length) return layers;

  const next = [...layers];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Releases blob URLs owned by image layers.
 *
 * Decoded `imageBitmap` references stay alive for the current session, so undo can still
 * restore a deleted sticker after its URL is revoked.
 *
 * @param layers - Layers whose object URLs should be released.
 */
export function revokeImageLayerUrls(layers: readonly ImageLayer[]): void {
  for (const layer of layers) {
    if (layer.src.startsWith('blob:')) URL.revokeObjectURL(layer.src);
  }
}
