/**
 * Region-blur glass backdrop (plan §3.2 step 2).
 *
 * v1's flaw, corrected here: clipping then re-filtering the FULL frame scales
 * cost with frame size, not card size — the browser may still filter the
 * whole draw internally. Instead we copy just the card region PLUS blur
 * padding into a small scratch canvas AT REDUCED SCALE, blur+saturate there,
 * upscale, and clip back onto the destination. Cost then genuinely scales
 * with card size (small, fixed) rather than frame size (1280x720+).
 *
 * The scratch canvas is owned by a `GlassBackdropRenderer` instance and
 * reused across frames — never allocate a new canvas per frame (plan §3.2,
 * task brief).
 */
import type { CardTheme } from '@stash/card-spec';
import { createRenderCanvas, get2DContext, type Ctx2D, type RenderCanvas } from './canvas-factory.js';
import { blurAndSaturateInPlace } from './blur.js';

export interface GlassRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** Extra source pixels sampled around the card so the blur has real data at its edges. */
const BLUR_PADDING_FACTOR = 1.5;
/** Downscale factor for the scratch canvas — cost scales with card size at this reduced resolution. */
const SCRATCH_SCALE = 0.5;

export class GlassBackdropRenderer {
  private scratch: RenderCanvas | null = null;
  private scratchCtx: Ctx2D | null = null;
  private scratchWidth = 0;
  private scratchHeight = 0;

  /**
   * Draws the blurred, saturated, glass panel for `region` directly into
   * `ctx`, sampling from `ctx.canvas` itself — the camera frame the compositor
   * already drew there in step 1 (plan §3.2). This instance's scratch canvas
   * is created once and resized only when the region size actually changes,
   * so steady-state frames (the overwhelming majority — a card's size does
   * not change frame to frame) allocate nothing.
   */
  draw(ctx: Ctx2D, region: GlassRegion, theme: CardTheme): void {
    const sourceWidth = ctx.canvas.width;
    const sourceHeight = ctx.canvas.height;
    const blurPx = theme.blurPx;
    const padding = blurPx * BLUR_PADDING_FACTOR;

    const padX = Math.max(0, region.x - padding);
    const padY = Math.max(0, region.y - padding);
    const padRight = Math.min(sourceWidth, region.x + region.width + padding);
    const padBottom = Math.min(sourceHeight, region.y + region.height + padding);
    const padWidth = Math.max(1, padRight - padX);
    const padHeight = Math.max(1, padBottom - padY);

    const scratchW = Math.max(1, Math.round(padWidth * SCRATCH_SCALE));
    const scratchH = Math.max(1, Math.round(padHeight * SCRATCH_SCALE));
    this.ensureScratch(scratchW, scratchH);
    const scratchCtx = this.scratchCtx!;

    scratchCtx.clearRect(0, 0, scratchW, scratchH);
    scratchCtx.drawImage(
      ctx.canvas as unknown as CanvasImageSource,
      padX,
      padY,
      padWidth,
      padHeight,
      0,
      0,
      scratchW,
      scratchH,
    );

    // Blur radius must scale down with the scratch canvas, or a card-sized
    // blur becomes a much stronger blur once measured against the smaller
    // scratch canvas's own pixels.
    blurAndSaturateInPlace(scratchCtx, scratchW, scratchH, blurPx * SCRATCH_SCALE, theme.saturate, createRenderCanvas);

    ctx.save();
    roundRectPath(ctx, region.x, region.y, region.width, region.height, region.radius);
    ctx.clip();
    // Map the (padded) scratch canvas back onto the (padded) destination
    // region — this is what makes the clip land exactly on the card rect
    // regardless of the blur padding.
    ctx.drawImage(this.scratch as unknown as CanvasImageSource, padX, padY, padWidth, padHeight);
    ctx.fillStyle = theme.surface;
    ctx.fillRect(region.x, region.y, region.width, region.height);
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, region.x, region.y, region.width, region.height, region.radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.border;
    ctx.stroke();
    ctx.restore();
  }

  private ensureScratch(width: number, height: number): void {
    if (this.scratch && this.scratchWidth === width && this.scratchHeight === height) return;
    this.scratch = createRenderCanvas(width, height);
    this.scratchCtx = get2DContext(this.scratch);
    this.scratchWidth = width;
    this.scratchHeight = height;
  }
}

/**
 * Module-level default renderer backing the plain-function API
 * (`drawGlassBackdrop`) the plan and task brief name explicitly. Compositors
 * that want per-instance scratch canvases (e.g. to avoid sharing across
 * concurrently-composited cards) should use `GlassBackdropRenderer` directly
 * instead — `CardCompositor` does.
 */
const defaultRenderer = new GlassBackdropRenderer();

/** `drawGlassBackdrop(ctx, region, theme)` — see `GlassBackdropRenderer.draw`. */
export function drawGlassBackdrop(ctx: Ctx2D, region: GlassRegion, theme: CardTheme): void {
  defaultRenderer.draw(ctx, region, theme);
}

export function roundRectPath(ctx: Ctx2D, x: number, y: number, width: number, height: number, radius: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
