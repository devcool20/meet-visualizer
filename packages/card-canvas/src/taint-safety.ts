/**
 * Canvas taint safety (plan §3.2 — CRITICAL).
 *
 * `RasterizeOptions.images` is a preloaded map: the rasterizer itself never
 * fetches an image (task brief, `card-canvas/src/types.ts` docstring). This
 * module provides the two pieces that make that contract safe end to end:
 *
 *  1. `loadImageCorsSafe` — the ONE place a URL is turned into a
 *     `CanvasImageSource`, with `crossOrigin = 'anonymous'` set before the
 *     image starts loading (setting it after `src` is too late).
 *  2. `isImageTainting` — a pre-check that draws the candidate image into a
 *     throwaway 1x1 canvas and calls `getImageData`. If the browser marked
 *     the source canvas tainted (missing/incorrect CORS headers on the image
 *     response), `getImageData` throws a `SecurityError`; we catch it and
 *     report the image as unsafe rather than letting that exception surface
 *     later, inside the frame loop, where it would be the user's turn to
 *     find out their camera just died.
 *
 * The rasterizer (`rasterize.ts`) calls `isImageTainting` before ever handing
 * an image to `ctx.drawImage()` on the real card canvas, and skips the block
 * (incrementing `skippedBlocks`) if it fails.
 */
import { createRenderCanvas, get2DContext } from './canvas-factory.js';

/**
 * Loads `url` as a `CanvasImageSource`, resolving `null` (never rejecting) on
 * any failure — a slow, missing, or hostile image must never stall or crash
 * the caller. Always sets `crossOrigin = 'anonymous'` before assigning `src`.
 */
export function loadImageCorsSafe(url: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draws `image` into a throwaway 1x1 canvas and calls `getImageData` inside a
 * try/catch. Returns `true` if that throws (the image taints the canvas and
 * must never reach the capture canvas), `false` if it's safe to draw.
 *
 * `makeCanvas` is injectable so this is unit-testable against a stubbed
 * context that throws on demand — see `card-canvas/test/taint.test.ts` for
 * exactly what that does and doesn't prove.
 */
export function isImageTainting(
  image: CanvasImageSource,
  makeCanvas: (w: number, h: number) => { getContext(id: '2d'): unknown } = createRenderCanvasAdapter,
): boolean {
  try {
    const probe = makeCanvas(1, 1) as unknown as { getContext: (id: '2d') => CanvasRenderingContext2D };
    const ctx = probe.getContext('2d');
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

function createRenderCanvasAdapter(w: number, h: number) {
  const canvas = createRenderCanvas(w, h);
  return { getContext: () => get2DContext(canvas) };
}
