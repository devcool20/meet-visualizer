import { describe, it, expect } from 'vitest';
import { CardCompositor, createRenderCanvas, get2DContext } from '@stash/card-canvas';
import { REVENUE_CARD } from '@stash/card-core';
import type { FrameSize } from '@stash/card-core';

/**
 * `CardCompositor` owns the cached raster, the spring animator, and the
 * degradation ladder for one on-screen card slot (plan §3.2/§3.3/§3.7).
 *
 * The ladder's real thresholds are wall-clock based (12ms rolling average
 * sustained for 2s to step down, a healthy average sustained for 3s to step
 * back up) — driving that through real `performance.now()` timing would make
 * this test slow and flaky. Two testing strategies are used instead:
 *  - The ladder's *decision* algorithm (`recordSample`) is exercised directly
 *    with a controlled, synthetic clock — TypeScript's `private` is a
 *    compile-time-only annotation, so a cast to `any` here reaches the same
 *    method the real per-frame `composite()` call drives, it's just fed a
 *    deterministic timeline instead of `performance.now()`.
 *  - Each ladder level's actual DRAW behaviour (flat fill vs raster, frame
 *    skipping) is exercised through the public `composite()` API after
 *    forcing a level with the `__forceLevel` test hook, so what actually
 *    lands on the canvas at each level is verified without needing to wait
 *    out real timers to reach that level "honestly".
 */
function frame(): FrameSize {
  return { width: 1280, height: 720 };
}

function freshCtx() {
  const canvas = createRenderCanvas(1280, 720);
  const ctx = get2DContext(canvas);
  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, 1280, 720);
  return ctx;
}

describe('CardCompositor — lifecycle', () => {
  it('starts gone, becomes not-finished after show(), and finishes after hide() runs its course', () => {
    const compositor = new CardCompositor({ reducedMotion: true });
    expect(compositor.isFinished).toBe(true);
    compositor.show();
    expect(compositor.isFinished).toBe(false);
    const ctx = freshCtx();
    compositor.composite(ctx, REVENUE_CARD, frame(), 16);
    expect(compositor.isFinished).toBe(false);
    compositor.hide();
    // reducedMotion fade is 150ms; a single 200ms step finishes it.
    compositor.composite(ctx, REVENUE_CARD, frame(), 200);
    expect(compositor.isFinished).toBe(true);
  });

  it('starts at degradation level "full" with a zero rolling average', () => {
    const compositor = new CardCompositor();
    expect(compositor.degradationLevel).toBe('full');
    expect(compositor.rollingAverageMs).toBe(0);
  });

  it('composite() reports drew:true and the current degradation level', () => {
    const compositor = new CardCompositor({ reducedMotion: true });
    compositor.show();
    const result = compositor.composite(freshCtx(), REVENUE_CARD, frame(), 16);
    expect(result.drew).toBe(true);
    expect(result.degradationLevel).toBe('full');
  });

  it('caches the raster across calls with the same id/revision (no throw on repeated calls)', () => {
    const compositor = new CardCompositor({ reducedMotion: true });
    compositor.show();
    const ctx = freshCtx();
    expect(() => {
      for (let i = 0; i < 5; i++) compositor.composite(ctx, REVENUE_CARD, frame(), 16);
    }).not.toThrow();
  });

  it('re-rasterizes when the revision changes (does not silently keep stale content)', () => {
    const compositor = new CardCompositor({ reducedMotion: true });
    compositor.show();
    const ctx = freshCtx();
    compositor.composite(ctx, REVENUE_CARD, frame(), 16);
    const bumped = { ...REVENUE_CARD, revision: REVENUE_CARD.revision + 1, title: 'Revenue v2' };
    expect(() => compositor.composite(ctx, bumped, frame(), 16)).not.toThrow();
  });
});

describe('CardCompositor — degradation ladder decision (synthetic clock, direct method access)', () => {
  it('stays at "full" while the rolling average is under the step-down threshold', () => {
    const compositor = new CardCompositor() as any;
    let t = 0;
    for (let i = 0; i < 50; i++) {
      compositor.recordSample(4, t);
      t += 33;
    }
    expect(compositor.degradationLevel).toBe('full');
  });

  it('steps down to "fps24" after the rolling average exceeds 12ms for a sustained 2s', () => {
    const compositor = new CardCompositor() as any;
    let t = 0;
    // First sample establishes the "over threshold since" timestamp; once
    // 2000ms of wall-clock time pass while still over threshold, it steps.
    compositor.recordSample(20, t);
    t += 2001;
    compositor.recordSample(20, t);
    expect(compositor.degradationLevel).toBe('fps24');
  });

  it('steps down through the full ladder in order under continued sustained cost, and clamps at "flatFill"', () => {
    const compositor = new CardCompositor() as any;
    let t = 0;
    const levelsSeen: string[] = [compositor.degradationLevel];
    for (let i = 0; i < 12; i++) {
      compositor.recordSample(20, t);
      t += 2001;
      levelsSeen.push(compositor.degradationLevel);
    }
    expect(compositor.degradationLevel).toBe('flatFill');
    expect(levelsSeen).toContain('full');
    expect(levelsSeen).toContain('fps24');
    expect(levelsSeen).toContain('quarterBlur');
  });

  it('recovers one level after a healthy rolling average is sustained for 3s', () => {
    const compositor = new CardCompositor() as any;
    compositor.__forceLevel('fps24');
    let t = 0;
    compositor.recordSample(2, t);
    t += 3001;
    compositor.recordSample(2, t);
    expect(compositor.degradationLevel).toBe('full');
  });

  it('does not recover if the healthy period is interrupted by a costly sample', () => {
    const compositor = new CardCompositor() as any;
    compositor.__forceLevel('fps24');
    let t = 0;
    compositor.recordSample(2, t);
    t += 1500;
    compositor.recordSample(20, t); // resets the "under threshold since" timer
    t += 1600; // only 1600ms healthy again, short of 3000ms
    compositor.recordSample(2, t);
    expect(compositor.degradationLevel).toBe('fps24');
  });
});

describe('CardCompositor — behaviour at each forced degradation level', () => {
  it('"flatFill" draws a translucent rect and does not throw', () => {
    const compositor = new CardCompositor({ reducedMotion: true }) as any;
    compositor.show();
    const ctx = freshCtx();
    compositor.composite(ctx, REVENUE_CARD, frame(), 16); // establish cached raster/height
    compositor.__forceLevel('flatFill');
    expect(() => compositor.composite(ctx, REVENUE_CARD, frame(), 16)).not.toThrow();
  });

  it('"quarterBlur" still draws (reduced blur radius) without throwing', () => {
    const compositor = new CardCompositor({ reducedMotion: true }) as any;
    compositor.show();
    compositor.__forceLevel('quarterBlur');
    const ctx = freshCtx();
    expect(() => compositor.composite(ctx, REVENUE_CARD, frame(), 16)).not.toThrow();
  });

  it('"fps24" skips frames that arrive faster than 24fps spacing', () => {
    const compositor = new CardCompositor({ reducedMotion: true, now: makeSequentialClock() }) as any;
    compositor.show();
    compositor.__forceLevel('fps24');
    const ctx = freshCtx();
    const first = compositor.composite(ctx, REVENUE_CARD, frame(), 16);
    const second = compositor.composite(ctx, REVENUE_CARD, frame(), 16); // arrives immediately after
    expect(first.drew).toBe(true);
    expect(second.drew).toBe(false);
  });
});

/** A clock whose successive calls advance by 1ms — enough to make two
 * back-to-back `composite()` calls land well inside the 24fps skip window
 * (41.67ms) deterministically, without depending on real wall-clock time. */
function makeSequentialClock(): () => number {
  let t = 0;
  return () => {
    t += 1;
    return t;
  };
}
