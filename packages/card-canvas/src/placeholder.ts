/**
 * Generating/error placeholder draw for the compositor (plan §"Placeholder
 * timings", D6).
 *
 * Placeholders are a separate draw path — NOT a CardSpec — to avoid extending
 * the frozen contract and to avoid calling `rasterize()` for a simple skeleton.
 *
 * Visuals (colours, type sizes, bar dimensions, shimmer treatment) come from
 * the design agent's mockups. This module provides geometry and behavior only.
 */
import { TYPE, DEFAULT_THEME } from '@stash/card-core';
import type { Ctx2D } from './canvas-factory.js';
import type { GlassRegion } from './glass-backdrop.js';
import type { CardTheme } from '@stash/card-spec';

export type PlaceholderKind = 'generating' | 'error';

export interface PlaceholderOptions {
  kind: PlaceholderKind;
  title: string;
  detail?: string;
  /** Millis since the placeholder was shown, used for shimmer animation. */
  elapsedMs: number;
  /** Skips the shimmer animation; renders the static frame. */
  reducedMotion?: boolean;
}

export const PLACEHOLDER_HEIGHT: Record<PlaceholderKind, number> = {
  generating: 132,
  error: 96,
};

export const SHIMMER_PERIOD_MS = 1200;

/**
 * Draw a placeholder card (generating shimmer or error) into the given context.
 *
 * The caller is responsible for drawing the glass backdrop first, then calling
 * this to draw the placeholder content on top. The `region` defines the card
 * bounds (glass backdrop already drawn there).
 */
export function drawPlaceholderCard(
  ctx: Ctx2D,
  region: GlassRegion,
  theme: CardTheme,
  opts: PlaceholderOptions,
): void {
  const { kind, title, detail, elapsedMs, reducedMotion } = opts;
  const { x, y, width, height } = region;
  const textColor = theme.text ?? DEFAULT_THEME.text;
  const mutedColor = theme.textMuted ?? DEFAULT_THEME.textMuted;

  ctx.save();

  // Clip to the card region
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, region.radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  const padX = Math.max(8, Math.min(20, width * 0.06));
  const padY = Math.max(8, Math.min(20, height * 0.15));

  // Title line
  const titleSize = TYPE.title.size;
  ctx.font = `${TYPE.title.weight} ${titleSize}px sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  const titleY = y + padY;
  ctx.fillText(title, x + padX, titleY);

  if (kind === 'generating') {
    // Two rounded shimmer bars
    const barY1 = titleY + titleSize + 12;
    const barY2 = barY1 + 14;
    const barW = Math.max(20, width - padX * 2);
    const barH = 12;

    drawShimmerBar(ctx, x + padX, barY1, barW, barH, elapsedMs, mutedColor, reducedMotion);
    drawShimmerBar(ctx, x + padX, barY2, barW, barH, elapsedMs, mutedColor, reducedMotion);
  } else if (kind === 'error') {
    // Detail line (error message)
    if (detail) {
      ctx.font = `${TYPE.body.weight} ${TYPE.body.size}px sans-serif`;
      ctx.fillStyle = mutedColor;
      const detailY = titleY + titleSize + 10;
      ctx.fillText(detail, x + padX, detailY);
    }
  }

  ctx.restore();
}

/**
 * Draw a single shimmer bar — a rounded rectangle with a moving highlight.
 * When `reducedMotion` is true, the highlight is static (no animation).
 */
function drawShimmerBar(
  ctx: Ctx2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  elapsedMs: number,
  baseColor: string,
  reducedMotion?: boolean,
): void {
  const radius = bh / 2;

  // Base bar
  ctx.fillStyle = baseColor;
  ctx.globalAlpha = 0.15;
  roundRect(ctx, bx, by, bw, bh, radius);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Shimmer highlight
  const highlightW = bw * 0.4;
  let highlightX: number;
  if (reducedMotion) {
    // Static position at the left edge
    highlightX = bx;
  } else {
    // Animate from left to right across the bar
    const progress = (elapsedMs % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
    highlightX = bx + progress * (bw + highlightW) - highlightW;
  }

  ctx.fillStyle = baseColor;
  ctx.globalAlpha = 0.25;
  roundRect(ctx, highlightX, by, highlightW, bh, radius);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
