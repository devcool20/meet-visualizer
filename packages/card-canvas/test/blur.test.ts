import { describe, it, expect, beforeEach } from 'vitest';
import {
  supportsCanvasFilterBlur,
  __resetFilterSupportCache,
  blurAndSaturateInPlace,
  createRenderCanvas,
  get2DContext,
} from '@stash/card-canvas';

/**
 * `node-canvas` (Cairo-backed) sets `ctx.filter` without error but does not
 * actually blur pixels — verified empirically (see `blur.ts`'s module
 * docstring). That means in THIS test environment,
 * `supportsCanvasFilterBlur` is expected to report `false`, and
 * `blurAndSaturateInPlace` always exercises the manual box-blur fallback,
 * never the native `ctx.filter` path. These tests assert exactly that
 * boundary rather than pretending the native path is covered here — the
 * native path only runs for real in Chrome's MAIN world (plan §3.2).
 */
describe('supportsCanvasFilterBlur', () => {
  beforeEach(() => {
    __resetFilterSupportCache();
  });

  it('reports false for node-canvas (the fallback box-blur path is what tests exercise)', () => {
    expect(supportsCanvasFilterBlur(createRenderCanvas)).toBe(false);
  });

  it('caches its result across calls (does not re-probe every call)', () => {
    const first = supportsCanvasFilterBlur(createRenderCanvas);
    const second = supportsCanvasFilterBlur(createRenderCanvas);
    expect(second).toBe(first);
  });
});

describe('blurAndSaturateInPlace (fallback box-blur + saturate path)', () => {
  beforeEach(() => {
    __resetFilterSupportCache();
  });

  it('actually blurs a hard edge — the sharp boundary softens after blurring', () => {
    const size = 40;
    const canvas = createRenderCanvas(size, size);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size / 2, size);

    blurAndSaturateInPlace(ctx, size, size, 8, 1, createRenderCanvas);

    const edgePixel = ctx.getImageData(size / 2, size / 2, 1, 1).data;
    // A hard, unblurred edge would still be exactly 0 or 255 right at the
    // boundary; after blurring it must land somewhere in between.
    expect(edgePixel[0]).toBeGreaterThan(5);
    expect(edgePixel[0]).toBeLessThan(250);
  });

  it('desaturating (saturate < 1) pulls a saturated colour toward grey', () => {
    const size = 8;
    const canvas = createRenderCanvas(size, size);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, size, size);

    blurAndSaturateInPlace(ctx, size, size, 0, 0, createRenderCanvas);

    const pixel = ctx.getImageData(size / 2, size / 2, 1, 1).data;
    // At saturate=0 every channel should collapse to the same luma value.
    expect(Math.abs(pixel[0] - pixel[1])).toBeLessThan(2);
    expect(Math.abs(pixel[1] - pixel[2])).toBeLessThan(2);
  });

  it('does not throw for a 1x1 canvas (minimum size edge case)', () => {
    const canvas = createRenderCanvas(1, 1);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 1, 1);
    expect(() => blurAndSaturateInPlace(ctx, 1, 1, 4, 1.2, createRenderCanvas)).not.toThrow();
  });
});
