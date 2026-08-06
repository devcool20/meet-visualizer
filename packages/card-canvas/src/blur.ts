/**
 * Blur + saturate for the glass backdrop (plan §3.2 step 2).
 *
 * The fast path is the real `ctx.filter = 'blur(Npx) saturate(S)'` — what
 * Chrome's MAIN world gives us. It is NOT implemented by every 2D canvas
 * backend, though: `node-canvas` (Cairo) accepts the property but silently
 * ignores it (verified empirically — no error, no effect on pixels). Since
 * this package's tests run against `node-canvas` via jsdom, and since a
 * renderer that silently produces an unblurred "glass" card in an
 * unanticipated host is a real degradation, not just a test inconvenience,
 * we feature-detect once and fall back to a manual box-blur + saturation
 * pass that works everywhere `CanvasImageData` works.
 */
import type { Ctx2D } from './canvas-factory.js';

let cachedFilterSupport: boolean | null = null;

/**
 * Draws a black/white half-and-half square through `ctx.filter = 'blur(4px)'`
 * and checks whether the output actually blurred. Runs once per process and
 * caches the result — this must never run per-frame.
 */
export function supportsCanvasFilterBlur(makeCanvas: (w: number, h: number) => { getContext(id: '2d'): unknown }): boolean {
  if (cachedFilterSupport !== null) return cachedFilterSupport;
  try {
    const size = 20;
    const src = makeCanvas(size, size) as unknown as { getContext: (id: '2d') => Ctx2D };
    const srcCtx = src.getContext('2d');
    srcCtx.fillStyle = '#000000';
    srcCtx.fillRect(0, 0, size, size);
    srcCtx.fillStyle = '#ffffff';
    srcCtx.fillRect(0, 0, size / 2, size);

    const dst = makeCanvas(size, size) as unknown as { getContext: (id: '2d') => Ctx2D };
    const dstCtx = dst.getContext('2d');
    dstCtx.filter = 'blur(4px)';
    dstCtx.drawImage(src as unknown as CanvasImageSource, 0, 0);

    // A hard edge at x=10 stays 0/255 if the filter did nothing; blurring
    // spreads it, so a mid-grey shows up a few px either side of the edge.
    const sample = dstCtx.getImageData(size / 2 - 3, size / 2, 1, 1).data;
    cachedFilterSupport = sample[0] > 5 && sample[0] < 250;
  } catch {
    cachedFilterSupport = false;
  }
  return cachedFilterSupport;
}

/** Test-only hook: forces the cached detection result on the next call. */
export function __resetFilterSupportCache(): void {
  cachedFilterSupport = null;
}

/**
 * Blurs and saturates the full contents of `ctx`'s canvas in place.
 *
 * Uses the native filter when available (drawing the canvas onto itself
 * through the filter — the standard trick, since `filter` only affects draw
 * calls, not pixels already committed). Falls back to a 3-pass box blur
 * (a good approximation of a Gaussian, same trick browsers use internally)
 * plus a manual saturation matrix otherwise.
 */
export function blurAndSaturateInPlace(
  ctx: Ctx2D,
  width: number,
  height: number,
  blurPx: number,
  saturate: number,
  makeCanvas: (w: number, h: number) => { getContext(id: '2d'): unknown },
): void {
  if (supportsCanvasFilterBlur(makeCanvas)) {
    const snapshot = makeCanvas(width, height) as unknown as { getContext: (id: '2d') => Ctx2D };
    const snapshotCtx = snapshot.getContext('2d');
    snapshotCtx.drawImage(ctx.canvas as unknown as CanvasImageSource, 0, 0);
    ctx.save();
    ctx.filter = `blur(${blurPx}px) saturate(${saturate})`;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(snapshot as unknown as CanvasImageSource, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
  boxBlurInPlace(ctx, width, height, blurPx);
  saturateInPlace(ctx, width, height, saturate);
}

/**
 * Three-pass box blur, integer radius. Not bit-identical to a Gaussian, but
 * visually equivalent and cheap — this is only the fallback path used by
 * canvas backends without native filter support.
 */
function boxBlurInPlace(ctx: Ctx2D, width: number, height: number, blurPx: number): void {
  const radius = Math.max(1, Math.round(blurPx / 2));
  const passes = 3;
  const image = ctx.getImageData(0, 0, width, height);
  for (let p = 0; p < passes; p++) {
    boxBlurPass(image.data, width, height, radius);
  }
  ctx.putImageData(image, 0, 0);
}

function boxBlurPass(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  // Horizontal pass then vertical pass, using a sliding-window sum so cost is
  // O(w*h) rather than O(w*h*radius).
  const copy = Uint8ClampedArray.from(data);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    const rowStart = y * width * 4;
    for (let x = -radius; x <= radius; x++) {
      const clampedX = Math.min(width - 1, Math.max(0, x));
      const idx = rowStart + clampedX * 4;
      rSum += copy[idx];
      gSum += copy[idx + 1];
      bSum += copy[idx + 2];
      aSum += copy[idx + 3];
    }
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4;
      data[idx] = rSum / windowSize;
      data[idx + 1] = gSum / windowSize;
      data[idx + 2] = bSum / windowSize;
      data[idx + 3] = aSum / windowSize;
      const nextX = x + radius + 1;
      const prevX = x - radius;
      const nextClamped = Math.min(width - 1, Math.max(0, nextX));
      const prevClamped = Math.min(width - 1, Math.max(0, prevX));
      const nextIdx = rowStart + nextClamped * 4;
      const prevIdx = rowStart + prevClamped * 4;
      rSum += copy[nextIdx] - copy[prevIdx];
      gSum += copy[nextIdx + 1] - copy[prevIdx + 1];
      bSum += copy[nextIdx + 2] - copy[prevIdx + 2];
      aSum += copy[nextIdx + 3] - copy[prevIdx + 3];
    }
  }

  const afterHorizontal = Uint8ClampedArray.from(data);
  for (let x = 0; x < width; x++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    for (let y = -radius; y <= radius; y++) {
      const clampedY = Math.min(height - 1, Math.max(0, y));
      const idx = (clampedY * width + x) * 4;
      rSum += afterHorizontal[idx];
      gSum += afterHorizontal[idx + 1];
      bSum += afterHorizontal[idx + 2];
      aSum += afterHorizontal[idx + 3];
    }
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = rSum / windowSize;
      data[idx + 1] = gSum / windowSize;
      data[idx + 2] = bSum / windowSize;
      data[idx + 3] = aSum / windowSize;
      const nextY = y + radius + 1;
      const prevY = y - radius;
      const nextClamped = Math.min(height - 1, Math.max(0, nextY));
      const prevClamped = Math.min(height - 1, Math.max(0, prevY));
      const nextIdx = (nextClamped * width + x) * 4;
      const prevIdx = (prevClamped * width + x) * 4;
      rSum += afterHorizontal[nextIdx] - afterHorizontal[prevIdx];
      gSum += afterHorizontal[nextIdx + 1] - afterHorizontal[prevIdx + 1];
      bSum += afterHorizontal[nextIdx + 2] - afterHorizontal[prevIdx + 2];
      aSum += afterHorizontal[nextIdx + 3] - afterHorizontal[prevIdx + 3];
    }
  }
}

/** Manual saturation adjustment, matching CSS `filter: saturate(S)` math. */
function saturateInPlace(ctx: Ctx2D, width: number, height: number, saturate: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Rec. 601 luma weights, same family CSS uses for its saturate() matrix.
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = clamp8(gray + (r - gray) * saturate);
    data[i + 1] = clamp8(gray + (g - gray) * saturate);
    data[i + 2] = clamp8(gray + (b - gray) * saturate);
  }
  ctx.putImageData(image, 0, 0);
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, v));
}
