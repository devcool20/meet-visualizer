import type { CardTheme, MetricItem } from '@stash/card-spec';
import {
  TYPE,
  deltaGlyph,
  layoutMetricRow,
  METRIC_ROW,
  type MetricCell,
  type TextMeasurer,
} from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

/**
 * Draws from `layoutMetricRow` — the identical structure `card-react`'s
 * MetricRow consumes — so the DOM preview and the overlay rasterised into a
 * meeting allocate the same cells by construction rather than by two copies of
 * the same arithmetic.
 */
export function drawMetricRow(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { items: MetricItem[] },
  theme: CardTheme,
  measure: TextMeasurer,
): void {
  const layout = layoutMetricRow(block.items, measure);

  if (layout.mode === 'inline') {
    for (const cell of layout.cells) {
      drawCell(ctx, x + cell.x, y, cell, theme, {
        emphasised: Boolean(cell.item.emphasis),
      });
    }
    return;
  }

  drawCell(ctx, x, y, layout.hero, theme, { emphasised: true });

  if (layout.support.length === 0) return;

  const supportTop =
    y + layout.hero.y + TYPE.metricValue.lineHeight + METRIC_ROW.heroGap;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 1, 400);
  ctx.fillStyle = theme.border || 'rgba(26,21,18,0.08)';
  ctx.fillRect(x, supportTop - METRIC_ROW.heroGap / 2, layout.hero.width, 1);

  for (const cell of layout.support) {
    drawCell(ctx, x + cell.x, supportTop, cell, theme, { support: true });
  }
}

function drawCell(
  ctx: Ctx2D,
  x: number,
  y: number,
  cell: MetricCell,
  theme: CardTheme,
  opts: { emphasised?: boolean; support?: boolean },
): void {
  const item = cell.item as MetricItem;
  const emphasised = Boolean(opts.emphasised);
  const valueStyle = opts.support
    ? TYPE.metricSupportValue
    : emphasised
      ? TYPE.metricValue
      : TYPE.metricValueSmall;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  setFont(ctx, TYPE.metricLabel.size, TYPE.metricLabel.weight);
  ctx.fillStyle = theme.textMuted;
  drawEllipsized(
    ctx,
    // `measureText` ignores letter-spacing, so track it manually.
    item.label.toUpperCase(),
    x,
    y + TYPE.metricLabel.lineHeight * 0.75,
    cell.width,
    TYPE.metricLabel.tracking * item.label.length,
  );

  setFont(ctx, valueStyle.size, valueStyle.weight);
  // Accent text is only allowed at or above LEGIBILITY.TEXT_ACCENT_MIN_PX.
  ctx.fillStyle = emphasised && valueStyle.size >= 20 ? theme.accent : theme.text;

  cell.lines.forEach((line, i) => {
    drawEllipsized(
      ctx,
      line,
      x,
      y + TYPE.metricLabel.lineHeight + valueStyle.lineHeight * (i + 0.75),
      cell.width,
    );
  });

  if (item.delta && !opts.support) {
    setFont(ctx, TYPE.delta.size, TYPE.delta.weight);
    ctx.fillStyle = theme.text;
    const bottom =
      TYPE.metricLabel.lineHeight + cell.lines.length * valueStyle.lineHeight;
    drawEllipsized(
      ctx,
      `${deltaGlyph(item.delta.direction)} ${item.delta.value}`,
      x,
      y + bottom + TYPE.delta.lineHeight * 0.75,
      cell.width,
    );
  }
}

function drawEllipsized(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  tracking = 0,
): void {
  const measured = () => ctx.measureText(text).width + tracking * text.length;
  if (measured() <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}.`).width + tracking * truncated.length > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}.`, x, y);
}