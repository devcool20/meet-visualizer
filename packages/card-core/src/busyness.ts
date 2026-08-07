/**
 * Pure scoring math over an RGBA buffer — no canvas, no DOM.
 *
 * Score = luma std-dev + 2× edge energy (Sobel-like central differences).
 * Intended use: the compositor downscales the camera frame to ~64×36, reads
 * back the pixels, scores both candidate card regions, and feeds the scores
 * into the hysteresis side-selector (plan §"Concrete math and constants").
 */
import type { FrameSize } from './placement.js';

export interface LumaGrid {
  width: number;
  height: number;
  /** row-major, 0..1 per cell */
  luma: Float32Array;
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionScore {
  mean: number;
  stdDev: number;
  edgeEnergy: number;
  busyness: number;
}

export const DOWNSCALE_WIDTH = 64;

export const BUSYNESS_WEIGHTS = {
  stdDev: 1,
  edgeEnergy: 2,
} as const;

export const PAD_FRACTION = 0.02;

/**
 * Compute the downscale height for a given frame, clamped to [16, 64].
 */
export function downscaleHeightFor(frame: FrameSize, width = DOWNSCALE_WIDTH): number {
  return Math.max(16, Math.min(64, Math.round(width * frame.height / frame.width)));
}

/**
 * Rec.709 luma, normalized to 0..1.
 */
function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Convert an RGBA buffer to a row-major luma grid.
 *
 * Accepts an optional `out` grid for reuse. The grid's `luma` array is filled
 * in-place if it has the right length; otherwise a new one is allocated.
 */
export function toLumaGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  out?: LumaGrid,
): LumaGrid {
  const n = width * height;
  let lumaArr = out?.luma;
  if (!lumaArr || lumaArr.length !== n) {
    lumaArr = new Float32Array(n);
  }

  for (let i = 0; i < n; i++) {
    const offset = i * 4;
    lumaArr[i] = luma(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
  }

  return { width, height, luma: lumaArr };
}

/**
 * Map a frame-space rect onto the grid, inflating by PAD_FRACTION and clamping
 * to the grid bounds. The result is at least 4×4 cells.
 */
export function frameRectToGridRect(
  rect: { x: number; y: number; width: number; height: number },
  frame: FrameSize,
  grid: { width: number; height: number },
): GridRect {
  const pad = frame.width * PAD_FRACTION;
  const sx = grid.width / frame.width;
  const sy = grid.height / frame.height;

  const x1 = Math.max(0, Math.floor((rect.x - pad) * sx));
  const y1 = Math.max(0, Math.floor((rect.y - pad) * sy));
  const x2 = Math.min(grid.width, Math.ceil((rect.x + rect.width + pad) * sx));
  const y2 = Math.min(grid.height, Math.ceil((rect.y + rect.height + pad) * sy));

  let w = Math.max(4, x2 - x1);
  let h = Math.max(4, y2 - y1);

  // Clamp to grid bounds after ensuring minimum size
  if (x1 + w > grid.width) w = grid.width - x1;
  if (y1 + h > grid.height) h = grid.height - y1;

  return { x: x1, y: y1, width: w, height: h };
}

/**
 * Score a region of the luma grid.
 *
 * mean = sum(Y) / n
 * stdDev = sqrt(sum((Y - mean)^2) / n)
 * edge = mean over interior cells of central-difference energy
 * busyness = 1.0 * stdDev + 2.0 * edge
 */
export function scoreRegion(grid: LumaGrid, rect: GridRect): RegionScore {
  const { width, height, luma } = grid;
  const { x, y, width: rw, height: rh } = rect;

  // Collect region samples
  const values: number[] = [];
  for (let gy = y; gy < y + rh && gy < height; gy++) {
    for (let gx = x; gx < x + rw && gx < width; gx++) {
      values.push(luma[gy * width + gx]);
    }
  }

  const n = values.length;
  if (n === 0) {
    return { mean: 0, stdDev: 0, edgeEnergy: 0, busyness: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  let sumSqDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - mean;
    sumSqDiff += diff * diff;
  }
  const stdDev = Math.sqrt(sumSqDiff / n);

  // Edge energy: central differences on interior cells
  let edgeSum = 0;
  let edgeCount = 0;
  for (let gy = y + 1; gy < y + rh - 1 && gy < height - 1; gy++) {
    for (let gx = x + 1; gx < x + rw - 1 && gx < width - 1; gx++) {
      const dx = Math.abs(luma[gy * width + (gx + 1)] - luma[gy * width + (gx - 1)]);
      const dy = Math.abs(luma[(gy + 1) * width + gx] - luma[(gy - 1) * width + gx]);
      edgeSum += dx + dy;
      edgeCount++;
    }
  }

  const edgeEnergy = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const busyness = BUSYNESS_WEIGHTS.stdDev * stdDev + BUSYNESS_WEIGHTS.edgeEnergy * edgeEnergy;

  return { mean, stdDev, edgeEnergy, busyness };
}

/**
 * Compare two region scores and return the less busy side.
 * Returns `null` when the difference is within the switch margin (i.e. inconclusive).
 */
export function compareSides(
  leftScore: number,
  rightScore: number,
): 'left' | 'right' | null {
  if (leftScore < rightScore) return 'left';
  if (rightScore < leftScore) return 'right';
  return null;
}
