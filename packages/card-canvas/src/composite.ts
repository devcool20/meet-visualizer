/**
 * `CardCompositor` — the per-frame entry point the extension's MAIN-world
 * capture loop calls (plan §3.2 "Per-frame composite", §3.3 animation,
 * §3.4 placement, §3.7 degradation).
 *
 * Per frame, `composite()`:
 *  1. Assumes the camera frame is already drawn into `ctx` by the caller
 *     (the compositor does not own the camera source — it only draws the
 *     card on top, exactly like `drawGlassBackdrop` samples `ctx.canvas`).
 *  2. Re-rasterizes the card ONLY when `spec.id`/`spec.revision` changes —
 *     the cached `RasterizedCard` is otherwise reused untouched (plan §3.3:
 *     "the card itself is never re-rendered during animation").
 *  3. Advances the `CardAnimator` by `dtMs` and applies the resulting
 *     `{x,y,scale,opacity}` as a canvas transform around the cached raster.
 *  4. Draws the glass backdrop (`GlassBackdropRenderer`) for the placed
 *     region, then the raster on top.
 *  5. Feeds its own draw cost into a degradation ladder: rolling average
 *     of per-frame cost, target <=8ms of the 33ms budget; if the rolling
 *     average exceeds 12ms for a sustained 2s, step down
 *     30fps -> 24fps -> quarter-res blur -> flat translucent fill (plan
 *     §3.2 "Degradation ladder", §3.7).
 */
import type { CardSpec, CardPosition } from '@stash/card-spec';
import { CardAnimator, resolveTheme } from '@stash/card-core';
import { computePlacement, type FrameSize } from '@stash/card-core';
import type { Ctx2D } from './canvas-factory.js';
import { rasterize } from './rasterize.js';
import type { RasterizedCard, RasterizeOptions } from './types.js';
import { GlassBackdropRenderer } from './glass-backdrop.js';

export type DegradationLevel = 'full' | 'fps24' | 'quarterBlur' | 'flatFill';

/** Order the ladder steps down through as sustained cost stays high. */
const LADDER: DegradationLevel[] = ['full', 'fps24', 'quarterBlur', 'flatFill'];

/** Target per-frame draw budget (plan §3.2): 8ms of the 33ms (30fps) frame. */
const TARGET_MS = 8;
/** Rolling-average threshold that triggers a step-down. */
const STEP_DOWN_THRESHOLD_MS = 12;
/** How long the rolling average must stay over threshold before stepping down. */
const SUSTAINED_MS = 2000;
/** Number of samples the rolling average is computed over. */
const ROLLING_WINDOW = 30;
/** Once degraded, require this many ms of a healthy rolling average before recovering one step. */
const RECOVER_AFTER_MS = 3000;

export interface CompositorOptions {
  reducedMotion?: boolean;
  images?: RasterizeOptions['images'];
  theme?: RasterizeOptions['theme'];
  /** Injectable for tests; defaults to `performance.now`. */
  now?: () => number;
}

export interface CompositeResult {
  /** Whether anything was drawn this frame (false only if there is no active card). */
  drew: boolean;
  degradationLevel: DegradationLevel;
  /** Rolling average draw cost in ms, for callers that want to report it. */
  rollingAverageMs: number;
}

/**
 * Owns the cached raster, the spring animator, and the degradation ladder
 * for ONE on-screen card slot. The extension creates one instance per active
 * card.
 */
export class CardCompositor {
  private cached: RasterizedCard | null = null;
  private cachedSpecId: string | null = null;
  private cachedRevision: number | null = null;
  private animator: CardAnimator;
  private backdrop = new GlassBackdropRenderer();
  private now: () => number;

  private samples: number[] = [];
  private overThresholdSinceMs: number | null = null;
  private underThresholdSinceMs: number | null = null;
  private level: DegradationLevel = 'full';
  private lastFrameAtMs: number | null = null;

  constructor(private options: CompositorOptions = {}) {
    this.animator = new CardAnimator({ reducedMotion: options.reducedMotion });
    this.now = options.now ?? (() => performance.now());
  }

  /** Starts the enter choreography for a (possibly new) card. */
  show(): void {
    this.animator.enter();
  }

  /** Starts the leave choreography; the card keeps compositing until `isFinished`. */
  hide(): void {
    this.animator.leave();
  }

  get isFinished(): boolean {
    return this.animator.isFinished;
  }

  get degradationLevel(): DegradationLevel {
    return this.level;
  }

  get rollingAverageMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  /**
   * Composites `spec` into `ctx` (which already has the camera frame drawn
   * into it) at the placement computed for `frame`, advancing the animator
   * by `dtMs`. `position` mirrors `CardSpec.position` and defaults to
   * `spec.position ?? 'auto'`.
   */
  composite(ctx: Ctx2D, spec: CardSpec, frame: FrameSize, dtMs: number, position?: CardPosition): CompositeResult {
    const start = this.now();

    if (this.level === 'fps24' && !this.shouldRenderThisFrame(start)) {
      // Frame-skip step: hold the previous composite (no draw), but still
      // advance bookkeeping so the ladder can recover.
      return { drew: false, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs };
    }

    const raster = this.getRaster(spec);
    const transform = this.animator.step(dtMs, this.enterOffsetFor(frame, spec.position ?? position));

    if (this.level === 'flatFill') {
      this.drawFlatFill(ctx, spec, frame, transform);
    } else {
      const placement = computePlacement(frame, raster.height, spec.position ?? position ?? 'auto');
      const region = {
        x: placement.x,
        y: placement.y,
        width: raster.width * placement.scale,
        height: raster.height * placement.scale,
        radius: 20 * placement.scale,
      };
      const theme = resolveTheme({ ...spec.theme, ...this.options.theme });
      if (this.level !== 'quarterBlur') {
        this.backdrop.draw(ctx, region, theme);
      } else {
        this.backdrop.draw(ctx, region, { ...theme, blurPx: theme.blurPx / 4 });
      }
      this.drawRaster(ctx, raster, placement, transform);
    }

    const cost = this.now() - start;
    this.recordSample(cost, start);
    return { drew: true, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs };
  }

  private drawRaster(
    ctx: Ctx2D,
    raster: RasterizedCard,
    placement: { x: number; y: number; scale: number },
    transform: { x: number; y: number; scale: number; opacity: number },
  ): void {
    ctx.save();
    ctx.globalAlpha = transform.opacity;
    ctx.translate(placement.x + transform.x, placement.y + transform.y);
    ctx.scale((placement.scale * transform.scale) / raster.scale, (placement.scale * transform.scale) / raster.scale);
    ctx.drawImage(raster.canvas as unknown as CanvasImageSource, 0, 0);
    ctx.restore();
  }

  private drawFlatFill(
    ctx: Ctx2D,
    spec: CardSpec,
    frame: FrameSize,
    transform: { x: number; y: number; scale: number; opacity: number },
  ): void {
    // Cheapest possible degraded state (plan §3.2 ladder's floor): no blur,
    // no re-blit of the raster's pixels — a translucent rounded rect only,
    // so a thermally-throttled machine still shows *something* at near-zero
    // cost rather than nothing.
    const raster = this.cached;
    const height = raster?.height ?? 200;
    const placement = computePlacement(frame, height, spec.position ?? 'auto');
    ctx.save();
    ctx.globalAlpha = transform.opacity;
    ctx.translate(placement.x + transform.x, placement.y + transform.y);
    ctx.scale(placement.scale * transform.scale, placement.scale * transform.scale);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, 0, raster?.width ?? 358, height);
    ctx.restore();
  }

  private getRaster(spec: CardSpec): RasterizedCard {
    if (this.cached && this.cachedSpecId === spec.id && this.cachedRevision === spec.revision) {
      return this.cached;
    }
    this.cached = rasterize(spec, { images: this.options.images, theme: this.options.theme });
    this.cachedSpecId = spec.id;
    this.cachedRevision = spec.revision;
    return this.cached;
  }

  private enterOffsetFor(frame: FrameSize, position: CardPosition | undefined): number {
    const placement = computePlacement(frame, this.cached?.height ?? 200, position ?? 'auto');
    return placement.enterOffset;
  }

  private shouldRenderThisFrame(nowMs: number): boolean {
    // 24fps step: skip every 5th frame of a nominal 30fps loop (30 * 4/5 = 24).
    if (this.lastFrameAtMs === null) {
      this.lastFrameAtMs = nowMs;
      return true;
    }
    const elapsed = nowMs - this.lastFrameAtMs;
    if (elapsed < 1000 / 24) return false;
    this.lastFrameAtMs = nowMs;
    return true;
  }

  private recordSample(costMs: number, nowMs: number): void {
    this.samples.push(costMs);
    if (this.samples.length > ROLLING_WINDOW) this.samples.shift();
    const avg = this.rollingAverageMs;

    if (avg > STEP_DOWN_THRESHOLD_MS) {
      this.underThresholdSinceMs = null;
      if (this.overThresholdSinceMs === null) this.overThresholdSinceMs = nowMs;
      if (nowMs - this.overThresholdSinceMs >= SUSTAINED_MS) {
        this.stepDown();
        this.overThresholdSinceMs = null;
      }
    } else {
      this.overThresholdSinceMs = null;
      if (avg <= TARGET_MS) {
        if (this.underThresholdSinceMs === null) this.underThresholdSinceMs = nowMs;
        if (nowMs - this.underThresholdSinceMs >= RECOVER_AFTER_MS) {
          this.stepUp();
          this.underThresholdSinceMs = null;
        }
      } else {
        this.underThresholdSinceMs = null;
      }
    }
  }

  private stepDown(): void {
    const idx = LADDER.indexOf(this.level);
    if (idx < LADDER.length - 1) {
      this.level = LADDER[idx + 1];
      this.samples = [];
    }
  }

  private stepUp(): void {
    const idx = LADDER.indexOf(this.level);
    if (idx > 0) {
      this.level = LADDER[idx - 1];
      this.samples = [];
    }
  }

  /** Test/debug hook: force a ladder level without waiting for real cost samples. */
  __forceLevel(level: DegradationLevel): void {
    this.level = level;
    this.samples = [];
    this.overThresholdSinceMs = null;
    this.underThresholdSinceMs = null;
  }
}

