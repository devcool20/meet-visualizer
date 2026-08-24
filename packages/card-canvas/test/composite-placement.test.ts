import { describe, it, expect } from 'vitest';
import { CardCompositor, createRenderCanvas, get2DContext } from '@stash/card-canvas';
import { REVENUE_CARD, SideSelector } from '@stash/card-core';
import type { FrameSize } from '@stash/card-core';
import { BusynessSampler } from '../src/busyness-sampler.js';

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

/**
 * Create a synthetic canvas with dense vertical stripes on one side (busy)
 * and flat grey on the other (quiet).
 */
function makePatternCanvas(busySide: 'left' | 'right'): CanvasImageSource {
  const canvas = createRenderCanvas(1280, 720);
  const ctx = get2DContext(canvas);

  // Fill whole canvas with flat grey
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 1280, 720);

  // Draw vertical stripes on the busy side
  ctx.fillStyle = '#000';
  const stripeX = busySide === 'left' ? 0 : 640;
  for (let x = stripeX; x < stripeX + 300; x += 8) {
    ctx.fillRect(x, 0, 4, 720);
  }

  return canvas;
}

describe('CardCompositor — adaptive placement', { timeout: 15000 }, () => {
  it('with injected sampler and selector, busy-left -> side=right after enough composite() calls', () => {
    const sampler = new BusynessSampler({ intervalMs: 10 });
    const selector = new SideSelector({ cooldownMs: 0, consecutiveSamples: 1 });
    const compositor = new CardCompositor({
      reducedMotion: true,
      now: () => 5000,
      sampler,
      selector,
    });
    compositor.show();

    const ctx = freshCtx();
    const pattern = makePatternCanvas('left');

    // Enter animation + a few samples
    for (let i = 0; i < 10; i++) {
      compositor.composite(ctx, REVENUE_CARD, frame(), 33, 'auto', pattern);
      // Once visible and sampled, check side
    }

    // After enough samples, side should be 'right' (left is busier)
    expect(compositor.side).toBe('right');
  });

  it('busy-right -> side=left after enough composite() calls', () => {
    const sampler = new BusynessSampler({ intervalMs: 10 });
    const selector = new SideSelector({ cooldownMs: 0, consecutiveSamples: 1 });
    const compositor = new CardCompositor({
      reducedMotion: true,
      now: () => 5000,
      sampler,
      selector,
    });
    compositor.show();

    const ctx = freshCtx();
    const pattern = makePatternCanvas('right');

    for (let i = 0; i < 10; i++) {
      compositor.composite(ctx, REVENUE_CARD, frame(), 33, 'auto', pattern);
    }

    expect(compositor.side).toBe('left');
  });

  it('setUserPosition("left") overrides the heuristic', () => {
    const sampler = new BusynessSampler({ intervalMs: 10 });
    const selector = new SideSelector({ cooldownMs: 0, consecutiveSamples: 1 });
    const compositor = new CardCompositor({
      reducedMotion: true,
      now: () => 5000,
      sampler,
      selector,
    });
    compositor.setUserPosition('left');
    compositor.show();

    const ctx = freshCtx();
    const pattern = makePatternCanvas('right'); // would normally suggest 'left'

    for (let i = 0; i < 10; i++) {
      compositor.composite(ctx, REVENUE_CARD, frame(), 33, 'auto', pattern);
    }

    // User position 'left' overrides heuristic — side should stay 'right'
    // Wait — userPosition='left' means the card goes on the left.
    // resolveSide('left', undefined, selector.side)
    // userPosition='left' → returns 'left'
    expect(compositor.side).toBe('left');
  });
});

describe('CardCompositor — sampling gate', { timeout: 15000 }, () => {
  it('during entering phase, sampledThisFrame is false', () => {
    const sampler = new BusynessSampler({ intervalMs: 10 });
    const selector = new SideSelector({ cooldownMs: 0, consecutiveSamples: 1 });
    const compositor = new CardCompositor({
      now: () => 5000,
      sampler,
      selector,
    });

    const ctx = freshCtx();
    compositor.show();

    // Enter animation is in progress, so phase is 'entering'
    const result = compositor.composite(ctx, REVENUE_CARD, frame(), 16, 'auto');

    // During entering, sampling should not happen
    expect(result.sampledThisFrame).toBe(false);
  });

  it('__forceLevel("quarterBlur") disables sampling', () => {
    const sampler = new BusynessSampler({ intervalMs: 10 });
    const selector = new SideSelector({ cooldownMs: 0, consecutiveSamples: 1 });
    const compositor = new CardCompositor({
      reducedMotion: true,
      now: () => 5000,
      sampler,
      selector,
    });
    compositor.__forceLevel('quarterBlur');
    compositor.show();

    const ctx = freshCtx();

    // composite through entering to visible
    let result: ReturnType<typeof compositor.composite>;
    for (let i = 0; i < 20; i++) {
      result = compositor.composite(ctx, REVENUE_CARD, frame(), 33, 'auto');
    }

    // At quarterBlur, sampling is disabled, so sampledThisFrame is always false
    expect(result!.sampledThisFrame).toBe(false);
  });
});
