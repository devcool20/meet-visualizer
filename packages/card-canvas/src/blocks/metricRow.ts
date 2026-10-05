import type { CardTheme, MetricItem } from '@stash/card-spec';
import { TYPE, deltaGlyph, metricColumnWidths, METRIC_ROW, type TextMeasurer } from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

/**
 * Same proportional, measurement-driven column layout as
 * `card-react/blocks/MetricRow.tsx` - both call `metricColumnWidths`, so the two
 * renderers cannot drift.
 */
export function drawMetricRow(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { items: MetricItem[] },
  theme: CardTheme,
  measure: TextMeasurer,
): void {
  const colWidths = metricColumnWidths(block.items, measure);
  const gap = METRIC_ROW.gap;

  let cursorX = x;
  block.items.forEach((item, i) => {
    const colWidth = colWidths[i];
    const valueStyle = item.emphasis ? TYPE.metricValue : TYPE.metricValueSmall;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    setFont(ctx, TYPE.metricLabel.size, TYPE.metricLabel.weight);
    ctx.fillStyle = theme.textMuted;
    drawEllipsized(ctx, item.label.toUpperCase(), cursorX, y + TYPE.metricLabel.lineHeight * 0.75, colWidth);

    let rowY = y + TYPE.metricLabel.lineHeight;
    setFont(ctx, valueStyle.size, valueStyle.weight);
    ctx.fillStyle = item.emphasis ? theme.accent : theme.text;
    drawEllipsized(ctx, item.value, cursorX, rowY + valueStyle.lineHeight * 0.75, colWidth);
    rowY += valueStyle.lineHeight;

    if (item.delta) {
      setFont(ctx, TYPE.delta.size, TYPE.delta.weight);
      // Delta text is below LEGIBILITY.TEXT_ACCENT_MIN_PX - never accent
      // (see the matching note in card-react/blocks/MetricRow.tsx).
      ctx.fillStyle = theme.text;
      const label = `${deltaGlyph(item.delta.direction)} ${item.delta.value}`;
      drawEllipsized(ctx, label, cursorX, rowY + TYPE.delta.lineHeight * 0.75, colWidth);
    }

    cursorX += colWidth + gap;
  });
}

function drawEllipsized(ctx: Ctx2D, text: string, x: number, y: number, maxWidth: number): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}.`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}.`, x, y);
}