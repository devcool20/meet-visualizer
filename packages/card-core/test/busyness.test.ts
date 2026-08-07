import { describe, it, expect } from 'vitest';
import {
  toLumaGrid,
  scoreRegion,
  compareSides,
  frameRectToGridRect,
  downscaleHeightFor,
  BUSYNESS_WEIGHTS,
} from '@stash/card-core';
import type { LumaGrid } from '@stash/card-core';
import type { FrameSize } from '@stash/card-core';

describe('toLumaGrid', () => {
  it('converts an RGBA buffer to luma values (0..1)', () => {
    // 2x2 grid, all mid-grey (128,128,128)
    const rgba = new Uint8ClampedArray([
      128, 128, 128, 255,  64, 64, 64, 255,
      192, 192, 192, 255,  32, 32, 32, 255,
    ]);
    const grid = toLumaGrid(rgba, 2, 2);
    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
    // Rec.709: 0.2126*128 + 0.7152*128 + 0.0722*128 = 128 → 128/255 ≈ 0.502
    expect(grid.luma[0]).toBeCloseTo(128 / 255, 3);
    expect(grid.luma[1]).toBeCloseTo(64 / 255, 3);
    expect(grid.luma[2]).toBeCloseTo(192 / 255, 3);
    expect(grid.luma[3]).toBeCloseTo(32 / 255, 3);
  });

  it('reuses an out grid with matching dimensions', () => {
    const rgba = new Uint8ClampedArray(4 * 4); // 2x2
    rgba.fill(128);
    const out: LumaGrid = { width: 2, height: 2, luma: new Float32Array(4) };
    const result = toLumaGrid(rgba, 2, 2, out);
    expect(result.luma).toBe(out.luma);
  });

  it('allocates a new grid when out has wrong dimensions', () => {
    const rgba = new Uint8ClampedArray(4 * 4);
    const out: LumaGrid = { width: 2, height: 2, luma: new Float32Array(2) }; // too small
    const result = toLumaGrid(rgba, 2, 2, out);
    expect(result.luma).not.toBe(out.luma);
    expect(result.luma.length).toBe(4);
  });
});

describe('scoreRegion', () => {
  function makeGrid(width: number, height: number, fill: (x: number, y: number) => number): LumaGrid {
    const luma = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        luma[y * width + x] = fill(x, y);
      }
    }
    return { width, height, luma };
  }

  it('uniform mid-grey has busyness < 0.02', () => {
    const grid = makeGrid(64, 36, () => 0.5);
    const score = scoreRegion(grid, { x: 0, y: 0, width: 64, height: 36 });
    expect(score.busyness).toBeLessThan(0.02);
    expect(score.stdDev).toBeCloseTo(0, 2);
    expect(score.edgeEnergy).toBeCloseTo(0, 2);
  });

  it('bright-left flat block has low busyness despite brightness difference', () => {
    // Left half bright, right half dark — but flat, so low edge energy
    const grid = makeGrid(64, 36, (x) => (x < 32 ? 0.9 : 0.3));
    const leftScore = scoreRegion(grid, { x: 0, y: 0, width: 32, height: 36 });
    const rightScore = scoreRegion(grid, { x: 32, y: 0, width: 32, height: 36 });
    // Both have low edge energy — brightness alone does not count as busy
    expect(leftScore.edgeEnergy).toBeLessThan(0.01);
    expect(rightScore.edgeEnergy).toBeLessThan(0.01);
    // stdDev is high because of the brightness boundary but inside each
    // region individually it's near zero
    expect(leftScore.stdDev).toBeLessThan(0.01);
    expect(rightScore.stdDev).toBeLessThan(0.01);
    expect(leftScore.busyness).toBeLessThan(0.02);
    expect(rightScore.busyness).toBeLessThan(0.02);
  });

  it('vertical-bar noise on the left makes left busyness > right by > 0.06', () => {
    const grid = makeGrid(64, 36, (x) => {
      if (x < 24) {
        // Left region: alternating vertical bars
        return (x % 2 === 0) ? 0.9 : 0.1;
      }
      return 0.5; // flat right
    });
    const leftScore = scoreRegion(grid, { x: 0, y: 0, width: 24, height: 36 });
    const rightScore = scoreRegion(grid, { x: 24, y: 0, width: 40, height: 36 });
    expect(leftScore.busyness - rightScore.busyness).toBeGreaterThan(0.06);
  });

  it('vertical stripes produce edge energy', () => {
    // Vertical stripes of width 2: two light, two dark — central differences
    // at the boundary between stripe 2 and 3 will see a large delta
    const grid = makeGrid(10, 10, (x) => (Math.floor(x / 2) % 2 === 0 ? 0.9 : 0.1));
    const score = scoreRegion(grid, { x: 1, y: 1, width: 8, height: 8 });
    // Edge energy is dominant (central differences at stripe boundaries)
    expect(score.edgeEnergy).toBeGreaterThan(0.4);
    expect(score.busyness).toBeGreaterThan(0.8);
  });

  it('returns zero for an empty region', () => {
    const grid = makeGrid(10, 10, () => 0.5);
    const score = scoreRegion(grid, { x: 100, y: 100, width: 0, height: 0 });
    expect(score.mean).toBe(0);
    expect(score.busyness).toBe(0);
  });
});

describe('compareSides', () => {
  it('returns the quieter side', () => {
    expect(compareSides(0.1, 0.3)).toBe('left');
    expect(compareSides(0.3, 0.1)).toBe('right');
  });

  it('returns null when equal', () => {
    expect(compareSides(0.2, 0.2)).toBeNull();
  });
});

describe('frameRectToGridRect', () => {
  const frame: FrameSize = { width: 1280, height: 720 };
  const grid = { width: 64, height: 36 };

  it('maps a rect to grid coordinates with padding', () => {
    // A rect near the left edge
    const rect = { x: 10, y: 100, width: 300, height: 250 };
    const result = frameRectToGridRect(rect, frame, grid);
    // PAD_FRACTION=0.02 → 1280*0.02=25.6px padding
    // sx = 64/1280 = 0.05, sy = 36/720 = 0.05
    // x1 = floor((10-25.6)*0.05) = floor(-0.78) = 0 (clamped)
    // x2 = ceil((10+300+25.6)*0.05) = ceil(16.78) = 17
    expect(result.x).toBe(0);
    expect(result.width).toBeGreaterThanOrEqual(4);
    // The result should be clamped to at least 4x4
    expect(result.width).toBeGreaterThanOrEqual(4);
    expect(result.height).toBeGreaterThanOrEqual(4);
  });

  it('clamps to grid bounds', () => {
    // A rect at the far right edge
    const rect = { x: 1200, y: 600, width: 200, height: 200 };
    const result = frameRectToGridRect(rect, frame, grid);
    expect(result.x + result.width).toBeLessThanOrEqual(grid.width);
    expect(result.y + result.height).toBeLessThanOrEqual(grid.height);
  });

  it('enforces a 4x4 minimum', () => {
    // Tiny rect in the corner
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    const result = frameRectToGridRect(rect, frame, grid);
    expect(result.width).toBeGreaterThanOrEqual(4);
    expect(result.height).toBeGreaterThanOrEqual(4);
  });
});

describe('downscaleHeightFor', () => {
  it('returns ~36 for a 16:9 frame', () => {
    const h = downscaleHeightFor({ width: 1280, height: 720 });
    expect(h).toBe(36);
  });

  it('clamps to [16, 64]', () => {
    const tall = downscaleHeightFor({ width: 64, height: 1000 });
    expect(tall).toBeGreaterThanOrEqual(16);
    expect(tall).toBeLessThanOrEqual(64);
  });
});

describe('BUSYNESS_WEIGHTS', () => {
  it('has stdDev=1 and edgeEnergy=2', () => {
    expect(BUSYNESS_WEIGHTS.stdDev).toBe(1);
    expect(BUSYNESS_WEIGHTS.edgeEnergy).toBe(2);
  });
});
