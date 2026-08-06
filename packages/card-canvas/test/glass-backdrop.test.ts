import { describe, it, expect } from 'vitest';
import { drawGlassBackdrop, GlassBackdropRenderer, createRenderCanvas, get2DContext } from '@stash/card-canvas';
import { DEFAULT_THEME } from '@stash/card-core';

describe('drawGlassBackdrop / GlassBackdropRenderer', () => {
  it('draws into the destination without throwing for a typical card region', () => {
    const canvas = createRenderCanvas(400, 300);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#448844';
    ctx.fillRect(0, 0, 400, 300);
    expect(() => drawGlassBackdrop(ctx, { x: 20, y: 20, width: 358, height: 288, radius: 20 }, DEFAULT_THEME)).not.toThrow();
  });

  it('paints something inside the clipped region (alpha channel is non-zero)', () => {
    const canvas = createRenderCanvas(400, 300);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#448844';
    ctx.fillRect(0, 0, 400, 300);
    drawGlassBackdrop(ctx, { x: 20, y: 20, width: 358, height: 200, radius: 20 }, DEFAULT_THEME);
    const pixel = ctx.getImageData(200, 120, 1, 1).data;
    expect(pixel[3]).toBeGreaterThan(0);
  });

  it('reuses its scratch canvas across draws of the same size (no throw on repeat)', () => {
    const renderer = new GlassBackdropRenderer();
    const canvas = createRenderCanvas(400, 300);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#889900';
    ctx.fillRect(0, 0, 400, 300);
    const region = { x: 20, y: 20, width: 358, height: 200, radius: 20 };
    expect(() => {
      renderer.draw(ctx, region, DEFAULT_THEME);
      renderer.draw(ctx, region, DEFAULT_THEME);
      renderer.draw(ctx, region, DEFAULT_THEME);
    }).not.toThrow();
  });

  it('handles a region near the canvas edge (padding must clamp, not throw)', () => {
    const canvas = createRenderCanvas(100, 100);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#112233';
    ctx.fillRect(0, 0, 100, 100);
    expect(() => drawGlassBackdrop(ctx, { x: 0, y: 0, width: 90, height: 90, radius: 12 }, DEFAULT_THEME)).not.toThrow();
  });

  it('handles a region larger than the source canvas without throwing', () => {
    const canvas = createRenderCanvas(50, 50);
    const ctx = get2DContext(canvas);
    ctx.fillStyle = '#112233';
    ctx.fillRect(0, 0, 50, 50);
    expect(() => drawGlassBackdrop(ctx, { x: 0, y: 0, width: 200, height: 200, radius: 12 }, DEFAULT_THEME)).not.toThrow();
  });
});
