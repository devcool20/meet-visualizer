import { describe, it, expect } from 'vitest';
import { rasterize } from '@stash/card-canvas';
import {
  REVENUE_CARD,
  TEAM_CARD,
  PRODUCT_CARD,
  GROWTH_CARD,
  COVERAGE_CARD,
  APPROVED_CARDS,
  CARD,
} from '@stash/card-core';

describe('rasterize', () => {
  it('draws every approved card plus the coverage card without throwing', () => {
    for (const spec of [...APPROVED_CARDS, COVERAGE_CARD]) {
      expect(() => rasterize(spec)).not.toThrow();
    }
  });

  it('returns a RasterizedCard whose canvas is scaled by RENDER_SCALE', () => {
    const result = rasterize(REVENUE_CARD);
    expect(result.canvas.width).toBe(Math.round(result.width * result.scale));
    expect(result.canvas.height).toBe(Math.round(result.height * result.scale));
  });

  it('carries the spec id and revision through unchanged', () => {
    const result = rasterize(TEAM_CARD);
    expect(result.cardId).toBe(TEAM_CARD.id);
    expect(result.revision).toBe(TEAM_CARD.revision);
  });

  it('reports zero skipped blocks when there is no image block', () => {
    for (const spec of [REVENUE_CARD, TEAM_CARD, PRODUCT_CARD, GROWTH_CARD, COVERAGE_CARD]) {
      expect(rasterize(spec).skippedBlocks).toBe(0);
    }
  });

  it('honours an explicit scale option', () => {
    const result = rasterize(REVENUE_CARD, { scale: 1 });
    expect(result.scale).toBe(1);
    expect(result.canvas.width).toBe(Math.round(result.width));
  });

  it('produces a card at least as wide as CARD.width at scale 1', () => {
    const result = rasterize(REVENUE_CARD, { scale: 1 });
    expect(result.width).toBe(CARD.width);
  });

  it('draws non-transparent pixels for the title text region', () => {
    // A weak but real smoke check that *something* was actually painted,
    // not just that no exception was thrown: sample a pixel inside the
    // card body (well past any transparent corner-radius padding) and
    // confirm the alpha channel is non-zero.
    const result = rasterize(REVENUE_CARD, { scale: 1 });
    const ctx = (result.canvas as HTMLCanvasElement).getContext('2d')!;
    const pixel = ctx.getImageData(Math.round(result.width / 2), Math.round(result.height / 2), 1, 1).data;
    expect(pixel[3]).toBeGreaterThan(0);
  });
});
