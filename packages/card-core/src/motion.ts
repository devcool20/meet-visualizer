/**
 * Spring integrator (plan §3.3).
 *
 * The landing page uses Framer Motion springs (stiffness 120, damping 20). The
 * extension cannot ship Framer Motion into the MAIN world of a Meet page, so
 * this reproduces the same physics in ~40 lines with no dependencies.
 *
 * Critically: animation only changes the canvas TRANSFORM applied around the
 * cached card raster. The card itself is never re-rendered during animation.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  restDelta: number;
  restSpeed: number;
}

export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 120,
  damping: 20,
  mass: 1,
  restDelta: 0.001,
  restSpeed: 0.01,
};

export class Spring {
  private value: number;
  private velocity = 0;
  private target: number;

  constructor(initial: number, private config: SpringConfig = DEFAULT_SPRING) {
    this.value = initial;
    this.target = initial;
  }

  setTarget(target: number): void {
    this.target = target;
  }

  /** Jump instantly, e.g. for reduced-motion or when re-showing a card. */
  snapTo(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  get current(): number {
    return this.value;
  }

  get atRest(): boolean {
    return (
      Math.abs(this.value - this.target) < this.config.restDelta &&
      Math.abs(this.velocity) < this.config.restSpeed
    );
  }

  /**
   * Advance by `dtMs`. Sub-stepped at a fixed 4ms so a dropped frame cannot
   * make the spring explode — important because this runs inside a 30fps
   * capture loop that will occasionally stall.
   */
  step(dtMs: number): number {
    const clamped = Math.min(dtMs, 64);
    const stepMs = 4;
    let remaining = clamped;
    const { stiffness, damping, mass } = this.config;

    while (remaining > 0) {
      const dt = Math.min(stepMs, remaining) / 1000;
      const displacement = this.value - this.target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * this.velocity;
      const acceleration = (springForce + dampingForce) / mass;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
      remaining -= stepMs;
    }

    if (this.atRest) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}

export interface CardTransform {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export type CardPhase = 'entering' | 'visible' | 'leaving' | 'gone';

/**
 * Drives the enter/exit choreography ported from App.tsx (~L1160-1360):
 * the card springs in from slightly outside the frame edge at 0.94 scale while
 * fading up, and leaves the same way.
 */
export class CardAnimator {
  private progress: Spring;
  private phase: CardPhase = 'gone';
  private readonly reducedMotion: boolean;
  private fadeMs = 150;
  private fadeElapsed = 0;

  constructor(opts: { reducedMotion?: boolean } = {}) {
    this.reducedMotion = opts.reducedMotion ?? false;
    this.progress = new Spring(0);
  }

  enter(): void {
    this.phase = 'entering';
    this.fadeElapsed = 0;
    this.progress.setTarget(1);
    if (this.reducedMotion) this.progress.snapTo(1);
  }

  leave(): void {
    if (this.phase === 'gone') return;
    this.phase = 'leaving';
    this.fadeElapsed = 0;
    this.progress.setTarget(0);
    if (this.reducedMotion) this.progress.snapTo(0);
  }

  get currentPhase(): CardPhase {
    return this.phase;
  }

  get isFinished(): boolean {
    return this.phase === 'gone';
  }

  step(dtMs: number, enterOffsetPx: number): CardTransform {
    if (this.reducedMotion) {
      // Reduced motion: no travel, no scale — a 150ms opacity crossfade only.
      this.fadeElapsed = Math.min(this.fadeMs, this.fadeElapsed + dtMs);
      const t = this.fadeElapsed / this.fadeMs;
      const opacity = this.phase === 'leaving' ? 1 - t : t;
      if (this.phase === 'leaving' && t >= 1) this.phase = 'gone';
      if (this.phase === 'entering' && t >= 1) this.phase = 'visible';
      return { x: 0, y: 0, scale: 1, opacity };
    }

    const p = this.progress.step(dtMs);
    if (this.progress.atRest) {
      if (this.phase === 'entering') this.phase = 'visible';
      else if (this.phase === 'leaving') this.phase = 'gone';
    }
    return {
      x: (1 - p) * enterOffsetPx,
      y: 0,
      scale: 0.94 + p * 0.06,
      opacity: Math.max(0, Math.min(1, p)),
    };
  }
}
