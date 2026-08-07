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
import type { CardSpec, CardPosition, CardTheme } from '@stash/card-spec';
import { CardAnimator, resolveTheme, Spring, DEFAULT_SPRING } from '@stash/card-core';
import { computePlacement, computePlacementForSide, resolveSide, type FrameSize, type CardSide } from '@stash/card-core';
import type { Ctx2D } from './canvas-factory.js';
import { rasterize } from './rasterize.js';
import type { RasterizedCard, RasterizeOptions } from './types.js';
import { GlassBackdropRenderer } from './glass-backdrop.js';
import type { BusynessSampler } from './busyness-sampler.js';
import type { SideSelector } from '@stash/card-core';
import type { PlaceholderKind } from './placeholder.js';
import { drawPlaceholderCard, PLACEHOLDER_HEIGHT } from './placeholder.js';
import { CardTtlTimer } from './ttl.js';

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

/** Sampling interval for each ladder level. */
const SAMPLE_INTERVAL_MS = {
  full: 160,
  fps24: 320,
} as const;

export interface CompositorOptions {
  reducedMotion?: boolean;
  images?: RasterizeOptions['images'];
  theme?: RasterizeOptions['theme'];
  /** Injectable for tests; defaults to `performance.now`. */
  now?: () => number;
  /** Default true. False keeps the legacy fixed placement. */
  autoPlacement?: boolean;
  /** Injectable for tests. */
  sampler?: BusynessSampler;
  /** Injectable for tests. */
  selector?: SideSelector;
}

export interface CompositeResult {
  /** Whether anything was drawn this frame (false only if there is no active card). */
  drew: boolean;
  degradationLevel: DegradationLevel;
  /** Rolling average draw cost in ms, for callers that want to report it. */
  rollingAverageMs: number;
  /** Current placement side (NEW). */
  side: CardSide;
  /** Whether the sampler ran this frame (NEW). */
  sampledThisFrame: boolean;
  /** How much the last sample cost in ms (NEW). */
  lastSampleCostMs: number;
}

/**
 * Owns the cached raster, the spring animator, and the degradation ladder
 * for ONE on-screen card slot. The extension creates one instance per active
 * card.
 *
 * Extended additively with adaptive placement (busyness sampler + side
 * selector), x-spring transitions, placeholder mode, and TTL auto-dismiss.
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

  // Adaptive placement fields
  private autoPlacement: boolean;
  private sampler: BusynessSampler | null = null;
  private selector: SideSelector | null = null;
  private currentSide: CardSide = 'right';
  private xSpring: Spring;
  private userPosition: CardPosition = 'auto';
  private sampledThisFrame = false;
  private lastSampleCostMs = 0;

  // Placeholder fields
  private placeholderMode = false;
  private placeholderKind: PlaceholderKind = 'generating';
  private placeholderTitle = '';
  private placeholderDetail: string | undefined;
  private placeholderElapsed = 0;

  // TTL
  private ttlTimer = new CardTtlTimer();
  private ttlExpiredFlag = false;

  constructor(private options: CompositorOptions = {}) {
    this.animator = new CardAnimator({ reducedMotion: options.reducedMotion });
    this.now = options.now ?? (() => performance.now());
    this.autoPlacement = options.autoPlacement ?? true;
    this.xSpring = new Spring(0, DEFAULT_SPRING);
    if (options.sampler) this.sampler = options.sampler;
    if (options.selector) this.selector = options.selector;
  }

  /** Starts the enter choreography for a (possibly new) card. */
  show(): void {
    this.animator.enter();
  }

  /** Starts the leave choreography; the card keeps compositing until `isFinished`. */
  hide(): void {
    this.animator.leave();
    this.ttlTimer.clear();
    this.placeholderMode = false;
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

  /** Current placement side (after side-resolution). */
  get side(): CardSide {
    return this.currentSide;
  }

  /** True on exactly the frame the card's TTL expires. */
  get ttlExpired(): boolean {
    return this.ttlExpiredFlag;
  }

  /** Update the reduced-motion flag mid-lifecycle. */
  setReducedMotion(value: boolean): void {
    this.animator.setReducedMotion(value);
    if (value) {
      this.xSpring.snapTo(this.xSpring.current);
    }
  }

  /** Update the user position setting (from UserSettings.position). */
  setUserPosition(position: CardPosition): void {
    this.userPosition = position;
  }

  /** Switch to placeholder mode (generating or error). */
  showPlaceholder(kind: PlaceholderKind, title: string, detail?: string): void {
    this.placeholderMode = true;
    this.placeholderKind = kind;
    this.placeholderTitle = title;
    this.placeholderDetail = detail;
    this.placeholderElapsed = 0;
    this.ttlTimer.clear(); // placeholders don't use TTL
    this.animator.enter();
  }

  /**
   * Composites `spec` into `ctx` (which already has the camera frame drawn
   * into it) at the placement computed for `frame`, advancing the animator
   * by `dtMs`. `position` mirrors `CardSpec.position` and defaults to
   * `spec.position ?? 'auto'`.
   *
   * Updated with adaptive placement: samples the provided `sampleSource`
   * (defaults to `ctx.canvas`), feeds the side selector, resolves the
   * effective side, and drives the x-spring for smooth transitions.
   */
  composite(ctx: Ctx2D, spec: CardSpec, frame: FrameSize, dtMs: number,
            position?: CardPosition, sampleSource?: CanvasImageSource): CompositeResult {
    const start = this.now();
    this.sampledThisFrame = false;
    this.lastSampleCostMs = 0;
    this.ttlExpiredFlag = false;

    if (this.level === 'fps24' && !this.shouldRenderThisFrame(start)) {
      // Frame-skip step: hold the previous composite (no draw), but still
      // advance bookkeeping so the ladder can recover.
      return {
        drew: false, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs,
        side: this.currentSide, sampledThisFrame: false, lastSampleCostMs: 0,
      };
    }

    // --- Adaptive placement: sample gate + side resolution ---
    const canSample = this.autoPlacement &&
      this.userPosition === 'auto' &&
      spec.position !== 'left' && spec.position !== 'right' &&
      this.animator.currentPhase === 'visible' &&
      (this.level === 'full' || this.level === 'fps24');

    if (canSample && this.sampler && this.selector) {
      const source = sampleSource ?? ctx.canvas;
      const reading = this.sampler.sample(source, frame, this.getPlacementHeight(), start);
      if (reading) {
        this.sampledThisFrame = true;
        this.lastSampleCostMs = reading.costMs;
        this.selector.sample(reading.left, reading.right, start);
      }
    }

    const specPos = spec.position ?? position;
    this.currentSide = resolveSide(this.userPosition, specPos, this.selector?.side ?? 'right');

    // --- Placement with x-spring ---
    const raster = this.getRaster(spec);
    const placement = computePlacementForSide(frame, raster.height, this.currentSide);

    // Drive x-spring: snap on first frame or reduced motion
    if (this.animator.currentPhase === 'entering' || this.animator.currentPhase === 'gone') {
      this.xSpring.snapTo(placement.x);
    } else if (this.options.reducedMotion) {
      this.xSpring.snapTo(placement.x);
    } else {
      this.xSpring.setTarget(placement.x);
      this.xSpring.step(dtMs);
    }
    const drawX = this.options.reducedMotion ? placement.x : this.xSpring.current;

    const transform = this.animator.step(dtMs, placement.enterOffset);

    if (this.level === 'flatFill') {
      this.drawFlatFill(ctx, spec, frame, transform);
    } else {
      const region = {
        x: drawX + transform.x,
        y: placement.y + transform.y,
        width: raster.width * placement.scale * transform.scale,
        height: raster.height * placement.scale * transform.scale,
        radius: 20 * placement.scale * transform.scale,
      };
      const theme = resolveTheme({ ...spec.theme, ...this.options.theme });
      if (this.level !== 'quarterBlur') {
        this.backdrop.draw(ctx, region, theme);
      } else {
        this.backdrop.draw(ctx, region, { ...theme, blurPx: theme.blurPx / 4 });
      }
      this.drawRaster(ctx, raster, { x: drawX, y: placement.y, scale: placement.scale }, transform);
    }

    // --- TTL tick: once card is visible ---
    if (this.animator.currentPhase === 'visible') {
      if (this.ttlTimer.isRunning) {
        this.ttlExpiredFlag = this.ttlTimer.tick(dtMs);
      }
    }

    const cost = this.now() - start;
    this.recordSample(cost, start);
    return {
      drew: true, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs,
      side: this.currentSide, sampledThisFrame: this.sampledThisFrame, lastSampleCostMs: this.lastSampleCostMs,
    };
  }

  /**
   * Composite a placeholder card (generating or error) instead of a real CardSpec.
   * Follows the same ladder, placement, and animation as composite().
   */
  compositePlaceholder(ctx: Ctx2D, frame: FrameSize, dtMs: number,
                       sampleSource?: CanvasImageSource): CompositeResult {
    if (!this.placeholderMode) {
      return {
        drew: false, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs,
        side: this.currentSide, sampledThisFrame: false, lastSampleCostMs: 0,
      };
    }

    // Build a minimal spec-like object just for placement
    const phHeight = PLACEHOLDER_HEIGHT[this.placeholderKind];
    const phWidth = 358; // CARD.width
    const scaledWidth = frame.width * 0.28;
    const scale = scaledWidth / phWidth;
    const radius = 20 * scale;

    const start = this.now();
    this.sampledThisFrame = false;
    this.lastSampleCostMs = 0;
    this.ttlExpiredFlag = false;

    if (this.level === 'fps24' && !this.shouldRenderThisFrame(start)) {
      return {
        drew: false, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs,
        side: this.currentSide, sampledThisFrame: false, lastSampleCostMs: 0,
      };
    }

    // --- Adaptive placement: same sampling gate ---
    const canSample = this.autoPlacement &&
      this.userPosition === 'auto' &&
      this.animator.currentPhase === 'visible' &&
      (this.level === 'full' || this.level === 'fps24');

    if (canSample && this.sampler && this.selector) {
      const source = sampleSource ?? ctx.canvas;
      const reading = this.sampler.sample(source, frame, phHeight, start);
      if (reading) {
        this.sampledThisFrame = true;
        this.lastSampleCostMs = reading.costMs;
        this.selector.sample(reading.left, reading.right, start);
      }
    }

    this.currentSide = resolveSide(this.userPosition, undefined, this.selector?.side ?? 'right');
    const placement = computePlacementForSide(frame, phHeight, this.currentSide);
    this.placeholderElapsed += dtMs;

    // x-spring
    if (this.animator.currentPhase === 'entering' || this.animator.currentPhase === 'gone') {
      this.xSpring.snapTo(placement.x);
    } else if (this.options.reducedMotion) {
      this.xSpring.snapTo(placement.x);
    } else {
      this.xSpring.setTarget(placement.x);
      this.xSpring.step(dtMs);
    }
    const drawX = this.options.reducedMotion ? placement.x : this.xSpring.current;

    const transform = this.animator.step(dtMs, placement.enterOffset);

    const theme: CardTheme = {
      surface: 'rgba(255,255,255,0.45)',
      border: 'rgba(26,21,18,0.06)',
      text: '#1A1512',
      textMuted: '#5A5550',
      accent: '#fb8500',
      blurPx: 20,
      saturate: 1.2,
    };

    if (this.level === 'flatFill') {
      ctx.save();
      ctx.globalAlpha = transform.opacity;
      ctx.translate(placement.x + transform.x, placement.y + transform.y);
      ctx.scale(scale * transform.scale, scale * transform.scale);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(0, 0, phWidth, phHeight);
      ctx.restore();
    } else {
      const region = {
        x: drawX,
        y: placement.y,
        width: phWidth * scale,
        height: phHeight * scale,
        radius,
      };

      if (this.level !== 'quarterBlur') {
        this.backdrop.draw(ctx, region, theme);
      } else {
        this.backdrop.draw(ctx, region, { ...theme, blurPx: theme.blurPx / 4 });
      }

      // Draw the placeholder content on top of the backdrop
      drawPlaceholderCard(ctx, region, theme, {
        kind: this.placeholderKind,
        title: this.placeholderTitle,
        detail: this.placeholderDetail,
        elapsedMs: this.placeholderElapsed,
        reducedMotion: this.options.reducedMotion,
      });
    }

    const cost = this.now() - start;
    this.recordSample(cost, start);
    return {
      drew: true, degradationLevel: this.level, rollingAverageMs: this.rollingAverageMs,
      side: this.currentSide, sampledThisFrame: this.sampledThisFrame, lastSampleCostMs: this.lastSampleCostMs,
    };
  }

  /** Start the TTL timer for the current card. */
  startTtl(durationMs: number): void {
    this.ttlTimer.start(durationMs);
  }

  /** Clear the TTL timer. */
  clearTtl(): void {
    this.ttlTimer.clear();
  }

  /** Get the placeholder height for the current state. */
  private getPlacementHeight(): number {
    if (this.placeholderMode) {
      return PLACEHOLDER_HEIGHT[this.placeholderKind];
    }
    return this.cached?.height ?? 200;
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

  private updateSamplerForLevel(): void {
    if (!this.sampler) return;
    if (this.level === 'full') {
      this.sampler.setEnabled(true);
      this.sampler.setIntervalMs(SAMPLE_INTERVAL_MS.full);
    } else if (this.level === 'fps24') {
      this.sampler.setEnabled(true);
      this.sampler.setIntervalMs(SAMPLE_INTERVAL_MS.fps24);
    } else {
      this.sampler.setEnabled(false);
    }
  }

  private stepDown(): void {
    const idx = LADDER.indexOf(this.level);
    if (idx < LADDER.length - 1) {
      this.level = LADDER[idx + 1];
      this.samples = [];
      this.updateSamplerForLevel();
    }
  }

  private stepUp(): void {
    const idx = LADDER.indexOf(this.level);
    if (idx > 0) {
      this.level = LADDER[idx - 1];
      this.samples = [];
      this.updateSamplerForLevel();
    }
  }

  /** Test/debug hook: force a ladder level without waiting for real cost samples. */
  __forceLevel(level: DegradationLevel): void {
    this.level = level;
    this.samples = [];
    this.overThresholdSinceMs = null;
    this.underThresholdSinceMs = null;
    this.updateSamplerForLevel();
  }
}

