/**
 * Reusable downscale canvas sampler for adaptive card placement
 * (plan §"Sampling cadence and cost").
 *
 * Downsamples a video/camera frame to 64px wide, reads back the pixels,
 * and scores both candidate card regions. Throttled to ~6x/second at full
 * rate, ~3x/second at fps24. Permanently disables itself on any failure
 * (tainted canvas, OOM, etc.) so the render loop is never disrupted.
 *
 * Uses `createRenderCanvas` from canvas-factory.ts (never `new OffscreenCanvas`
 * directly), and one reused `LumaGrid` across samples.
 */
import type { Ctx2D, RenderCanvas } from './canvas-factory.js';
import { createRenderCanvas, get2DContext } from './canvas-factory.js';
import {
  toLumaGrid,
  scoreRegion,
  frameRectToGridRect,
  downscaleHeightFor,
  candidateRects,
} from '@stash/card-core';
import type { LumaGrid, FrameSize } from '@stash/card-core';

export interface BusynessSamplerOptions {
  downscaleWidth?: number;
  intervalMs?: number;
}

export interface BusynessReading {
  left: number;
  right: number;
  costMs: number;
}

export class BusynessSampler {
  private canvas: RenderCanvas | null = null;
  private ctx: Ctx2D | null = null;
  private canvasW = 0;
  private canvasH = 0;
  private lumaGrid: LumaGrid | null = null;
  private disabled = false;
  private disableReason: 'readback-failed' | 'no-canvas' | null = null;
  private lastSampleAtMs = 0;
  private intervalMs: number;
  private downscaleWidth: number;
  private enabled = true;

  constructor(opts?: BusynessSamplerOptions) {
    this.downscaleWidth = opts?.downscaleWidth ?? 64;
    this.intervalMs = opts?.intervalMs ?? 160;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  get disabledReason(): 'readback-failed' | 'no-canvas' | null {
    return this.disableReason;
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
  }

  /** Set whether sampling is currently enabled (ladder gating). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Full reset: clear disabled state and cached resources. */
  reset(): void {
    this.disabled = false;
    this.disableReason = null;
    this.canvas = null;
    this.ctx = null;
    this.canvasW = 0;
    this.canvasH = 0;
    this.lumaGrid = null;
    this.lastSampleAtMs = 0;
  }

  /**
   * Sample a video/camera source and return busyness scores for both sides.
   *
   * Returns `null` when throttled, disabled, or on any failure. Never throws.
   */
  sample(
    source: CanvasImageSource,
    frame: FrameSize,
    cardHeight: number,
    nowMs: number,
  ): BusynessReading | null {
    // Never throw — permanent-disable on any failure
    try {
      if (this.disabled) return null;
      if (!this.enabled) return null;

      // Throttle check
      if (nowMs - this.lastSampleAtMs < this.intervalMs) return null;

      const start = performance.now();

      // Ensure downscale canvas
      const dw = this.downscaleWidth;
      const dh = downscaleHeightFor(frame, dw);
      if (!this.canvas || this.canvasW !== dw || this.canvasH !== dh) {
        this.canvas = createRenderCanvas(dw, dh);
        this.ctx = get2DContext(this.canvas);
        this.canvasW = dw;
        this.canvasH = dh;
        this.lumaGrid = null; // will be recreated
      }
      const ctx = this.ctx!;

      // Downscale the source frame into our tiny canvas
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(source, 0, 0, dw, dh);

      // Readback pixels
      const imageData = ctx.getImageData(0, 0, dw, dh);
      const grid = toLumaGrid(imageData.data, dw, dh, this.lumaGrid ?? undefined);
      this.lumaGrid = grid;

      // Score both candidate regions
      const rects = candidateRects(frame, cardHeight);
      const leftRect = frameRectToGridRect(rects.left, frame, grid);
      const rightRect = frameRectToGridRect(rects.right, frame, grid);

      const leftScore = scoreRegion(grid, leftRect);
      const rightScore = scoreRegion(grid, rightRect);

      const cost = performance.now() - start;
      this.lastSampleAtMs = nowMs;

      return {
        left: leftScore.busyness,
        right: rightScore.busyness,
        costMs: cost,
      };
    } catch (err) {
      // Permanent-disable on any error (tainted canvas, OOM, etc.)
      this.disabled = true;
      this.disableReason = 'readback-failed';
      return null;
    }
  }
}
