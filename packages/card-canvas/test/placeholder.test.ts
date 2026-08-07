import { describe, it, expect } from 'vitest';
import { createRenderCanvas, get2DContext } from '../src/canvas-factory.js';
import { drawPlaceholderCard, PLACEHOLDER_HEIGHT } from '../src/placeholder.js';
import type { GlassRegion } from '../src/glass-backdrop.js';
import { DEFAULT_THEME } from '@stash/card-core';

function makeRegion(): GlassRegion {
  return { x: 50, y: 50, width: 300, height: 132, radius: 20 };
}

function makeCtx() {
  const canvas = createRenderCanvas(400, 250);
  const ctx = get2DContext(canvas);
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, 400, 250);
  return ctx;
}

describe('drawPlaceholderCard', () => {
  it('generating draw does not throw', () => {
    const ctx = makeCtx();
    const region = makeRegion();
    expect(() => {
      drawPlaceholderCard(ctx, region, DEFAULT_THEME, {
        kind: 'generating',
        title: 'Working on it…',
        elapsedMs: 0,
      });
    }).not.toThrow();
  });

  it('error draw does not throw', () => {
    const ctx = makeCtx();
    const region = makeRegion();
    expect(() => {
      drawPlaceholderCard(ctx, region, DEFAULT_THEME, {
        kind: 'error',
        title: "Couldn't build that card",
        detail: 'The AI generation failed. Please try again.',
        elapsedMs: 0,
      });
    }).not.toThrow();
  });

  it('draws inside the region but not outside it', () => {
    const ctx = makeCtx();
    // Get pixel data before drawing
    const before = ctx.getImageData(0, 0, 400, 250);
    const beforePixels = new Uint32Array(before.data.buffer);

    drawPlaceholderCard(ctx, makeRegion(), DEFAULT_THEME, {
      kind: 'generating',
      title: 'Working on it…',
      elapsedMs: 500,
    });

    const after = ctx.getImageData(0, 0, 400, 250);
    const afterPixels = new Uint32Array(after.data.buffer);

    // Pixels inside the region should have changed
    let insideChanged = false;
    let outsideChanged = false;

    for (let y = 0; y < 250; y++) {
      for (let x = 0; x < 400; x++) {
        const idx = y * 400 + x;
        const changed = beforePixels[idx] !== afterPixels[idx];
        const inside = x >= 50 && x < 350 && y >= 50 && y < 182;
        if (changed && inside) insideChanged = true;
        if (changed && !inside) outsideChanged = true;
      }
    }

    expect(insideChanged).toBe(true);
    expect(outsideChanged).toBe(false);
  });

  it('reducedMotion:true produces identical pixels at two different elapsedMs values', () => {
    const ctx1 = makeCtx();
    drawPlaceholderCard(ctx1, makeRegion(), DEFAULT_THEME, {
      kind: 'generating',
      title: 'Working on it…',
      elapsedMs: 0,
      reducedMotion: true,
    });
    const frame1 = ctx1.getImageData(0, 0, 400, 250);
    const pixels1 = new Uint32Array(frame1.data.buffer);

    const ctx2 = makeCtx();
    drawPlaceholderCard(ctx2, makeRegion(), DEFAULT_THEME, {
      kind: 'generating',
      title: 'Working on it…',
      elapsedMs: 600, // different phase
      reducedMotion: true,
    });
    const frame2 = ctx2.getImageData(0, 0, 400, 250);
    const pixels2 = new Uint32Array(frame2.data.buffer);

    // All pixels should be identical
    for (let i = 0; i < pixels1.length; i++) {
      expect(pixels1[i]).toBe(pixels2[i]);
    }
  });

  it('reducedMotion:false produces different pixels at different elapsedMs (shimmer moves)', () => {
    const ctx1 = makeCtx();
    drawPlaceholderCard(ctx1, makeRegion(), DEFAULT_THEME, {
      kind: 'generating',
      title: 'Working on it…',
      elapsedMs: 0,
      reducedMotion: false,
    });
    const frame1 = ctx1.getImageData(0, 0, 400, 250);

    const ctx2 = makeCtx();
    drawPlaceholderCard(ctx2, makeRegion(), DEFAULT_THEME, {
      kind: 'generating',
      title: 'Working on it…',
      elapsedMs: 600, // half-period — shimmer at different position
      reducedMotion: false,
    });
    const frame2 = ctx2.getImageData(0, 0, 400, 250);

    // Some pixels should differ (the shimmer moved)
    let diffCount = 0;
    for (let i = 0; i < frame1.data.length; i++) {
      if (frame1.data[i] !== frame2.data[i]) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('PLACEHOLDER_HEIGHT has correct values', () => {
    expect(PLACEHOLDER_HEIGHT.generating).toBe(132);
    expect(PLACEHOLDER_HEIGHT.error).toBe(96);
  });
});
