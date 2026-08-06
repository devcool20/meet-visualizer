import type { CardTheme } from '@stash/card-spec';
import { IMAGE, contentWidth } from '@stash/card-core';
import { roundRectPath } from '../glass-backdrop.js';
import { isImageTainting } from '../taint-safety.js';
import type { Ctx2D } from '../canvas-factory.js';

/**
 * Draws a preloaded image block, or does nothing (plan §3.2 — CRITICAL).
 *
 * `image` must already be in `RasterizeOptions.images` (never fetched here —
 * see `taint-safety.ts`'s module docstring). Even a preloaded image gets a
 * taint pre-check immediately before drawing: `crossOrigin` can be set
 * correctly and the image can still taint the canvas if the server's
 * `Access-Control-Allow-Origin` response header was wrong or missing.
 * Drawing a tainting image into the card canvas — which itself gets drawn
 * into the capture canvas — would make `captureStream()` throw
 * `SecurityError` and break the user's camera permanently. Returns `true` if
 * the block was skipped so the caller can increment `skippedBlocks`.
 */
export function drawImageBlock(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { url: string; alt?: string; aspect?: number },
  theme: CardTheme,
  image: CanvasImageSource | undefined,
): { skipped: boolean } {
  if (!image) return { skipped: true };
  if (isImageTainting(image)) return { skipped: true };

  const aspect = block.aspect ?? IMAGE.defaultAspect;
  const height = Math.min(contentWidth / aspect, IMAGE.maxHeight);

  ctx.save();
  roundRectPath(ctx, x, y, contentWidth, height, IMAGE.radius);
  ctx.clip();
  drawCover(ctx, image, x, y, contentWidth, height);
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, contentWidth, height, IMAGE.radius);
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.restore();

  return { skipped: false };
}

/** `object-fit: cover` equivalent for `drawImage`. */
function drawCover(ctx: Ctx2D, image: CanvasImageSource, x: number, y: number, width: number, height: number): void {
  const naturalWidth = getIntrinsicWidth(image);
  const naturalHeight = getIntrinsicHeight(image);
  if (!naturalWidth || !naturalHeight) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function getIntrinsicWidth(image: CanvasImageSource): number {
  if ('naturalWidth' in image) return (image as HTMLImageElement).naturalWidth;
  if ('width' in image) return Number((image as { width: number }).width);
  return 0;
}

function getIntrinsicHeight(image: CanvasImageSource): number {
  if ('naturalHeight' in image) return (image as HTMLImageElement).naturalHeight;
  if ('height' in image) return Number((image as { height: number }).height);
  return 0;
}
