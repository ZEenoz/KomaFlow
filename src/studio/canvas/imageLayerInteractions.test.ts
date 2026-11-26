import { describe, expect, it, vi } from 'vitest';
import { CanvasFurniture, MIN_IMAGE_LAYER_SIZE } from './CanvasFurniture';
import { moveImageLayer, revokeImageLayerUrls } from '../state/imageLayerUtils';
import type { ImageLayer } from '../types';

/**
 * Builds a sticker layer with deterministic defaults for geometry tests.
 * @param overrides Layer fields to replace.
 * @returns Complete image layer.
 */
function layer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'sticker',
    src: 'blob:sticker',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    opacity: 1,
    flipH: false,
    flipV: false,
    ...overrides,
  };
}

describe('Image layer hit testing', () => {
  it('selects the top-most overlapping layer', () => {
    const bottom = layer({ id: 'bottom' });
    const top = layer({ id: 'top', x: 20, y: 10 });
    expect(CanvasFurniture.hitTestImageLayer({ x: 50, y: 25 }, [bottom, top])?.id).toBe('top');
  });

  it('skips hidden and locked layers', () => {
    const bottom = layer({ id: 'bottom' });
    const hidden = layer({ id: 'hidden', isVisible: false });
    const locked = layer({ id: 'locked', isLocked: true });
    expect(CanvasFurniture.hitTestImageLayer({ x: 50, y: 25 }, [bottom, hidden, locked])?.id).toBe('bottom');
    expect(CanvasFurniture.hitTestImageLayer({ x: 50, y: 25 }, [hidden, locked])).toBeNull();
  });

  it('accounts for layer rotation when resolving bounds', () => {
    const rotated = layer({ width: 100, height: 20, rotation: 90 });
    expect(CanvasFurniture.hitTestImageLayer({ x: 50, y: 50 }, [rotated])).not.toBeNull();
    expect(CanvasFurniture.hitTestImageLayer({ x: 5, y: 10 }, [rotated])).toBeNull();
  });

  it('resolves rotated corner handles', () => {
    const rotated = layer({ width: 100, height: 50, rotation: 90 });
    // Rotating local nw (0, 0) around center (50, 25) by 90° lands at (75, -25).
    expect(CanvasFurniture.hitTestImageLayerHandles({ x: 75, y: -25 }, rotated)).toBe('nw');
  });
});

describe('Image layer resize', () => {
  it('clamps both dimensions to the minimum while anchoring the opposite corner', () => {
    const initial = layer({ x: 100, y: 100, width: 200, height: 100 });
    const bounds = CanvasFurniture.resizeImageLayer(initial, 'se', -500, -500);
    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: MIN_IMAGE_LAYER_SIZE,
      height: MIN_IMAGE_LAYER_SIZE,
    });
  });

  it('maintains the aspect ratio when requested', () => {
    const initial = layer({ x: 100, y: 100, width: 200, height: 100 });
    const bounds = CanvasFurniture.resizeImageLayer(initial, 'se', 100, 0, true);
    expect(bounds).toEqual({ x: 100, y: 100, width: 300, height: 150 });
  });

  it('anchors the opposite corner for a north-west resize', () => {
    const initial = layer({ x: 100, y: 100, width: 200, height: 100 });
    const bounds = CanvasFurniture.resizeImageLayer(initial, 'nw', 100, 50, true);
    expect(bounds).toEqual({ x: 200, y: 150, width: 100, height: 50 });
  });

  it('moves the layer without resizing it', () => {
    const initial = layer({ x: 40, y: 60, width: 200, height: 100 });
    const bounds = CanvasFurniture.resizeImageLayer(initial, 'move', 25, -10);
    expect(bounds).toEqual({ x: 65, y: 50, width: 200, height: 100 });
  });
});

describe('Image layer ordering and lifecycle', () => {
  it('moves a layer one step forward or backward', () => {
    const a = layer({ id: 'a' });
    const b = layer({ id: 'b' });
    const c = layer({ id: 'c' });
    expect(moveImageLayer([a, b, c], 'b', 1).map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(moveImageLayer([a, b, c], 'b', -1).map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('leaves order unchanged at the z-order edges', () => {
    const layers = [layer({ id: 'a' }), layer({ id: 'b' })];
    expect(moveImageLayer(layers, 'a', -1)).toBe(layers);
    expect(moveImageLayer(layers, 'b', 1)).toBe(layers);
    expect(moveImageLayer(layers, 'missing', 1)).toBe(layers);
  });

  it('revokes only blob object URLs', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeImageLayerUrls([
      layer({ src: 'blob:sticker-one' }),
      layer({ src: 'data:image/png;base64,AAAA' }),
      layer({ src: 'blob:sticker-two' }),
    ]);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('blob:sticker-one');
    expect(revoke).toHaveBeenCalledWith('blob:sticker-two');
    revoke.mockRestore();
  });
});
