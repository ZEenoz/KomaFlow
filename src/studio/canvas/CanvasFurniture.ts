import type {
  ImageLayer,
  ImageLayerHandle,
  ImageLayerResizeHandle,
  Point,
  TextObject,
  TransformHandle,
} from '../types';

/** Radius of interactive transform handle nubs in image pixels. */
export const HANDLE_RADIUS = 6;

/** Extra hit tolerance around a transform handle nub, in image pixels. */
export const HANDLE_HIT_SLOP = 3;

/** Hit radius for interactive transform handles in image pixels. */
export const HANDLE_HIT_RADIUS = HANDLE_RADIUS + HANDLE_HIT_SLOP;

/** Minimum width or height of a resized image layer, in image pixels. */
export const MIN_IMAGE_LAYER_SIZE = 16;

/** Distance in image pixels between top handle and rotation handle nub. */
export const ROTATION_HANDLE_OFFSET = 24;

/** Offset in image pixels for secondary auxiliary handles (font size & wrap). */
export const AUX_HANDLE_OFFSET = 16;

/** Dashed organic-contour outline color (Koharu-style balloon silhouette). */
export const CONTOUR_OUTLINE_COLOR = '#38bdf8';

/** Sky halo behind selection borders keeps them visible on dark artwork. */
const SELECTION_HALO_COLOR = 'rgba(96, 193, 229, 0.95)';

/** Width of the selection halo stroke in image pixels. */
const SELECTION_HALO_WIDTH = 4;

/** Width of the core selection border stroke in image pixels. */
const SELECTION_BORDER_WIDTH = 1.5;

/** Dash pattern for selection furniture in image pixels. */
const SELECTION_DASH: [number, number] = [4, 4];

/**
 * Maximum fraction of the shorter box edge that a perimeter handle may cover.
 * Keeps narrow boxes draggable by their body.
 */
const MAX_HANDLE_COVERAGE = 0.28;

export class CanvasFurniture {
  /**
   * Draws selection border, 8-point handles, rotation nub, font-size nub, and wrap handle.
   *
   * @param ctx - Canvas 2D rendering context.
   * @param obj - Selected TextObject.
   * @param borderColor - Custom selection border color.
   */
  public static drawSelectionFurniture(
    ctx: CanvasRenderingContext2D,
    obj: TextObject,
    borderColor: string = '#1b365d'
  ): void {
    const isSkipped = !!obj.isSkipped;
    const effectiveColor = isSkipped ? '#94a3b8' : borderColor;

    ctx.save();
    ctx.translate(obj.x, obj.y);

    if (obj.rotation) {
      const centerX = obj.width / 2;
      const centerY = obj.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    // 1. Draw dashed selection boundary with a dual-tone stroke: the sky outer
    // halo keeps it visible on dark artwork, while the deep-navy inner stroke
    // keeps >= 5:1 contrast on white manga art.
    if (!isSkipped) {
      ctx.strokeStyle = 'rgba(96, 193, 229, 0.95)';
      ctx.lineWidth = 4;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-1.5, -1.5, obj.width + 3, obj.height + 3);
    }
    ctx.strokeStyle = effectiveColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(isSkipped ? [2, 3] : [4, 4]);
    ctx.strokeRect(0, 0, obj.width, obj.height);
    ctx.setLineDash([]);

    // 1b. Koharu-style organic contour: when the object has a real 2D
    // bubble contour, show that silhouette with high-contrast dual-stroke
    // (Koharu CanvasOverlay.tsx) so it is clearly visible across both dark and light artwork.
    const contour = obj.contourPoints;
    if (!isSkipped && contour && contour.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i++) {
        ctx.lineTo(contour[i].x, contour[i].y);
      }
      ctx.closePath();

      // Outer contrast halo (Koharu CanvasOverlay.tsx dual-stroke: 6px white halo)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([10, 6]);
      ctx.stroke();

      // Inner accent dashed stroke
      ctx.strokeStyle = CONTOUR_OUTLINE_COLOR;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Draw stem line to rotation handle (sky halo + navy core)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(96, 193, 229, 0.95)';
    ctx.lineWidth = 4;
    ctx.moveTo(obj.width / 2, 0);
    ctx.lineTo(obj.width / 2, -ROTATION_HANDLE_OFFSET);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = effectiveColor;
    ctx.lineWidth = 1.5;
    ctx.moveTo(obj.width / 2, 0);
    ctx.lineTo(obj.width / 2, -ROTATION_HANDLE_OFFSET);
    ctx.stroke();

    // 3. Draw rotation handle nub (circle with curved rotation arrow badge)
    this.drawHandleNub(ctx, obj.width / 2, -ROTATION_HANDLE_OFFSET, '#1b365d', true, '⟳');

    // If rotated, show small angle tag above rotation nub
    if (obj.rotation) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      const angleText = `${Math.round(obj.rotation)}°`;
      const textMetrics = ctx.measureText(angleText);
      const tagW = textMetrics.width + 8;
      const tagH = 14;
      const tagX = obj.width / 2 - tagW / 2;
      const tagY = -ROTATION_HANDLE_OFFSET - 18;
      ctx.fillStyle = '#12141c';
      ctx.strokeStyle = '#60c1e5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#60c1e5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(angleText, obj.width / 2, tagY + tagH / 2);
      ctx.restore();
    }

    const midX = obj.width / 2;
    const midY = obj.height / 2;
    const right = obj.width;
    const bottom = obj.height;

    // 4. Draw font-size scaling handle (top-right corner nub with 'A' badge)
    this.drawHandleNub(ctx, right, 0, '#1b365d', true, 'A');

    // 5. Draw horizontal wrap handle (right midpoint nub with '↔' badge)
    this.drawHandleNub(ctx, right, midY, '#1b365d', true, '↔');

    // 6. Draw standard bounding handles
    this.drawHandleNub(ctx, 0, 0, effectiveColor);
    this.drawHandleNub(ctx, midX, 0, effectiveColor);
    this.drawHandleNub(ctx, right, bottom, effectiveColor);
    this.drawHandleNub(ctx, midX, bottom, effectiveColor);
    this.drawHandleNub(ctx, 0, bottom, effectiveColor);
    this.drawHandleNub(ctx, 0, midY, effectiveColor);

    // If skipped, render a small label pill
    if (isSkipped) {
      ctx.save();
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, -14, 46, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SKIPPED', 3, -5);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Draws the rotated selection border and four corner resize handles of an image layer.
   *
   * @param ctx - Canvas 2D rendering context.
   * @param layer - Selected image layer.
   * @param borderColor - Appearance setting for selected boxes.
   */
  public static drawImageLayerSelection(
    ctx: CanvasRenderingContext2D,
    layer: ImageLayer,
    borderColor: string = '#1b365d'
  ): void {
    const left = -layer.width / 2;
    const top = -layer.height / 2;
    const right = left + layer.width;
    const bottom = top + layer.height;

    ctx.save();
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

    // Dual-tone dashed border: sky halo for dark artwork, solid core for light artwork.
    ctx.strokeStyle = SELECTION_HALO_COLOR;
    ctx.lineWidth = SELECTION_HALO_WIDTH;
    ctx.setLineDash(SELECTION_DASH);
    ctx.strokeRect(left, top, layer.width, layer.height);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = SELECTION_BORDER_WIDTH;
    ctx.strokeRect(left, top, layer.width, layer.height);
    ctx.setLineDash([]);

    this.drawHandleNub(ctx, left, top, borderColor);
    this.drawHandleNub(ctx, right, top, borderColor);
    this.drawHandleNub(ctx, right, bottom, borderColor);
    this.drawHandleNub(ctx, left, bottom, borderColor);

    ctx.restore();
  }

  /**
   * Draws the subtle dashed outline shown around every unselected text box.
   *
   * @param ctx - Canvas 2D rendering context.
   * @param obj - Unselected TextObject.
   * @param borderColor - Appearance setting for unselected box borders.
   */
  public static drawUnselectedOutline(
    ctx: CanvasRenderingContext2D,
    obj: TextObject,
    borderColor: string
  ): void {
    ctx.save();
    ctx.translate(obj.x, obj.y);

    if (obj.rotation) {
      const centerX = obj.width / 2;
      const centerY = obj.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.setLineDash(obj.isSkipped ? [2, 3] : [4, 4]);
    ctx.strokeRect(0, 0, obj.width, obj.height);
    ctx.restore();
  }

  /**
   * Hit-tests whether a point in image coordinate space strikes any transform handle.
   *
   * @param pt - Pointer location in image coordinate space.
   * @param obj - Target TextObject.
   * @param radius - Hit tolerance radius in image pixels.
   * @returns Hit handle or null if none struck.
   */
  public static hitTestHandles(
    pt: Point,
    obj: TextObject,
    radius: number = HANDLE_HIT_RADIUS
  ): TransformHandle | null {
    // Transform point into object's unrotated local coordinates
    let localX = pt.x - obj.x;
    let localY = pt.y - obj.y;

    if (obj.rotation) {
      const centerX = obj.width / 2;
      const centerY = obj.height / 2;
      const rad = (-obj.rotation * Math.PI) / 180;
      const dx = localX - centerX;
      const dy = localY - centerY;
      localX = centerX + (dx * Math.cos(rad) - dy * Math.sin(rad));
      localY = centerY + (dx * Math.sin(rad) + dy * Math.cos(rad));
    }

    const midX = obj.width / 2;
    const midY = obj.height / 2;
    const right = obj.width;
    const bottom = obj.height;

    // Rotation handle sits safely outside the box boundary
    if (this.dist(localX, localY, midX, -ROTATION_HANDLE_OFFSET) <= radius) return 'rot';

    // Ensure perimeter handles never cover more than 28% of the box dimension,
    // guaranteeing that narrow vertical or small bubbles retain interior body area for dragging.
    const maxRadius = Math.max(3, Math.min(obj.width, obj.height) * MAX_HANDLE_COVERAGE);
    const effectiveRadius = Math.min(radius, maxRadius);

    // Font-size handle (top-right corner nub)
    if (this.dist(localX, localY, right, 0) <= effectiveRadius) {
      return 'font-size';
    }

    // Wrap handle (right midpoint nub)
    if (this.dist(localX, localY, right, midY) <= effectiveRadius) {
      return 'wrap';
    }

    // Bounding corner and edge handles
    if (this.dist(localX, localY, 0, 0) <= effectiveRadius) return 'nw';
    if (this.dist(localX, localY, midX, 0) <= effectiveRadius) return 'n';
    if (this.dist(localX, localY, right, bottom) <= effectiveRadius) return 'se';
    if (this.dist(localX, localY, midX, bottom) <= effectiveRadius) return 's';
    if (this.dist(localX, localY, 0, bottom) <= effectiveRadius) return 'sw';
    if (this.dist(localX, localY, 0, midY) <= effectiveRadius) return 'w';

    return null;
  }

  /**
   * Hit-tests whether a point lies inside the bounding box of a TextObject.
   *
   * @param pt - Pointer location in image coordinate space.
   * @param obj - Target TextObject.
   * @returns True if point is inside object body.
   */
  public static hitTestBody(pt: Point, obj: TextObject): boolean {
    let localX = pt.x - obj.x;
    let localY = pt.y - obj.y;

    if (obj.rotation) {
      const centerX = obj.width / 2;
      const centerY = obj.height / 2;
      const rad = (-obj.rotation * Math.PI) / 180;
      const dx = localX - centerX;
      const dy = localY - centerY;
      localX = centerX + (dx * Math.cos(rad) - dy * Math.sin(rad));
      localY = centerY + (dx * Math.sin(rad) + dy * Math.cos(rad));
    }

    return localX >= 0 && localX <= obj.width && localY >= 0 && localY <= obj.height;
  }

  /**
   * Hit-tests the top-most selectable image layer under a point.
   *
   * Layers paint in array order, so the search walks backwards. Hidden and locked layers
   * stay selectable neither by body nor by their handles.
   *
   * @param pt - Pointer location in image coordinate space.
   * @param layers - Image layers in paint order (last entry is top-most).
   * @returns Top-most visible, unlocked hit layer, or null when the point misses.
   */
  public static hitTestImageLayer(pt: Point, layers: readonly ImageLayer[]): ImageLayer | null {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.isVisible === false || layer.isLocked === true) continue;
      const local = this.imageLayerLocalPoint(pt, layer);
      if (local.x >= 0 && local.x <= layer.width && local.y >= 0 && local.y <= layer.height) {
        return layer;
      }
    }
    return null;
  }

  /**
   * Hit-tests a point against the four corner resize handles of an image layer.
   * Hidden and locked layers expose no interactive handles.
   *
   * @param pt - Pointer location in image coordinate space.
   * @param layer - Image layer whose corners are tested, honoring its rotation.
   * @param radius - Hit tolerance radius in image pixels.
   * @returns Hit corner handle, or null when no corner is within tolerance.
   */
  public static hitTestImageLayerHandles(
    pt: Point,
    layer: ImageLayer,
    radius: number = HANDLE_HIT_RADIUS
  ): ImageLayerResizeHandle | null {
    if (layer.isVisible === false || layer.isLocked === true) return null;

    const local = this.imageLayerLocalPoint(pt, layer);
    const maxRadius = Math.max(HANDLE_HIT_SLOP, Math.min(layer.width, layer.height) * MAX_HANDLE_COVERAGE);
    const effectiveRadius = Math.min(radius, maxRadius);

    if (this.dist(local.x, local.y, 0, 0) <= effectiveRadius) return 'nw';
    if (this.dist(local.x, local.y, layer.width, 0) <= effectiveRadius) return 'ne';
    if (this.dist(local.x, local.y, layer.width, layer.height) <= effectiveRadius) return 'se';
    if (this.dist(local.x, local.y, 0, layer.height) <= effectiveRadius) return 'sw';
    return null;
  }

  /**
   * Computes image layer geometry for a move or corner-resize gesture.
   *
   * World pointer deltas are projected into the layer's rotated local frame, so the anchored
   * opposite corner stays fixed. Shift locks the aspect ratio, and both dimensions clamp to
   * `minSize`.
   *
   * @param initial - Layer geometry captured when the gesture started.
   * @param handle - Body move or one of the four corner handles.
   * @param worldDeltaX - Pointer travel in world image coordinate space X.
   * @param worldDeltaY - Pointer travel in world image coordinate space Y.
   * @param keepAspect - True to preserve the initial width/height ratio while resizing.
   * @param minSize - Minimum allowed width or height in image pixels.
   * @returns Updated layer bounds (x, y, width, height).
   */
  public static resizeImageLayer(
    initial: ImageLayer,
    handle: ImageLayerHandle,
    worldDeltaX: number,
    worldDeltaY: number,
    keepAspect: boolean = false,
    minSize: number = MIN_IMAGE_LAYER_SIZE
  ): Pick<ImageLayer, 'x' | 'y' | 'width' | 'height'> {
    if (handle === 'move') {
      return {
        x: initial.x + worldDeltaX,
        y: initial.y + worldDeltaY,
        width: initial.width,
        height: initial.height,
      };
    }

    const rad = ((initial.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const localDeltaX = worldDeltaX * cos + worldDeltaY * sin;
    const localDeltaY = -worldDeltaX * sin + worldDeltaY * cos;

    const signX = handle === 'ne' || handle === 'se' ? 1 : -1;
    const signY = handle === 'se' || handle === 'sw' ? 1 : -1;

    let width = Math.max(minSize, initial.width + signX * localDeltaX);
    let height = Math.max(minSize, initial.height + signY * localDeltaY);

    if (keepAspect) {
      const scale = Math.max(
        width / initial.width,
        height / initial.height,
        minSize / initial.width,
        minSize / initial.height
      );
      width = initial.width * scale;
      height = initial.height * scale;
    }

    // Anchor the corner opposite the dragged handle by shifting the center half the size delta.
    const shiftLocalX = (signX * (width - initial.width)) / 2;
    const shiftLocalY = (signY * (height - initial.height)) / 2;
    const centerX = initial.x + initial.width / 2 + shiftLocalX * cos - shiftLocalY * sin;
    const centerY = initial.y + initial.height / 2 + shiftLocalX * sin + shiftLocalY * cos;

    return {
      x: Math.round(centerX - width / 2),
      y: Math.round(centerY - height / 2),
      width: Math.max(minSize, Math.round(width)),
      height: Math.max(minSize, Math.round(height)),
    };
  }

  /**
   * Converts a world point into an image layer's unrotated local space.
   *
   * @param pt - Pointer location in image coordinate space.
   * @param layer - Target image layer.
   * @returns Point relative to the layer's unrotated top-left corner.
   */
  private static imageLayerLocalPoint(pt: Point, layer: ImageLayer): Point {
    const localX = pt.x - layer.x;
    const localY = pt.y - layer.y;
    if (!layer.rotation) return { x: localX, y: localY };

    const centerX = layer.width / 2;
    const centerY = layer.height / 2;
    const rad = (-layer.rotation * Math.PI) / 180;
    const dx = localX - centerX;
    const dy = localY - centerY;
    return {
      x: centerX + (dx * Math.cos(rad) - dy * Math.sin(rad)),
      y: centerY + (dx * Math.sin(rad) + dy * Math.cos(rad)),
    };
  }

  private static drawHandleNub(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    isCircle: boolean = false,
    label?: string
  ): void {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (isCircle) {
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_RADIUS + (label ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (label) {
        ctx.fillStyle = color;
        ctx.font = label === '⟳' ? 'bold 9px sans-serif' : 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
      }
    } else {
      ctx.fillRect(x - HANDLE_RADIUS, y - HANDLE_RADIUS, HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
      ctx.strokeRect(x - HANDLE_RADIUS, y - HANDLE_RADIUS, HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    }
    ctx.restore();
  }

  private static dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x1 - x2, y1 - y2);
  }
}
