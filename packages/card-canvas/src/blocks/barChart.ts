import type { CardTheme, Point } from '@stash/card-spec';
import { CHART, contentWidth, chartMaxValue, barRects, gridLineYs } from '@stash/card-core';
import { roundRectPath } from '../glass-backdrop.js';
import type { Ctx2D } from '../canvas-factory.js';

/**
 * Bar chart. Geometry comes ENTIRELY from `card-core/scales` — this function
 * must never compute a bar position itself (plan §3.2/§5.1). This is the
 * canvas-side twin of `card-react/blocks/BarChart.tsx`; the two must trace
 * identical rectangles because both call the same `barRects`.
 */
export function drawBarChart(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { series: Point[]; unit?: string; maxValue?: number },
  theme: CardTheme,
): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(26,21,18,0.05)';
  roundRectPath(ctx, 0, 0, contentWidth, CHART.height, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(26,21,18,0.04)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, 0, 0, contentWidth, CHART.height, 12);
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, 0, 0, contentWidth, CHART.height, 12);
  ctx.clip();

  ctx.strokeStyle = 'rgba(26,21,18,0.06)';
  ctx.setLineDash([3, 3]);
  for (const gy of gridLineYs(contentWidth)) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(contentWidth, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const maxValue = chartMaxValue(block.series, block.maxValue);
  const rects = barRects(block.series, maxValue, contentWidth);
  ctx.fillStyle = theme.accent;
  for (const rect of rects) {
    roundRectPath(ctx, rect.x, rect.y, Math.max(0, rect.width), rect.height, CHART.barRadius);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}
