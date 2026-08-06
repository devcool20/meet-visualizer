import type { CardTheme, Point } from '@stash/card-spec';
import { CHART, contentWidth, chartMaxValue, linePoints, gridLineYs, smoothPath } from '@stash/card-core';
import { roundRectPath } from '../glass-backdrop.js';
import type { Ctx2D } from '../canvas-factory.js';

/**
 * Line/area chart, traced with `bezierCurveTo` from the SAME control points
 * `smoothPath` (card-core/scales) hands to the SVG `<path d>` on the React
 * side — this is what makes the two renderers trace the identical curve
 * rather than two curves that merely look similar (plan §3.2).
 */
export function drawLineChart(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { series: Point[]; area?: boolean; unit?: string },
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

  const maxValue = chartMaxValue(block.series);
  const points = linePoints(block.series, maxValue, contentWidth);
  const { from, curves } = smoothPath(points);

  if (block.area && points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    for (const c of curves) ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
    const last = points[points.length - 1];
    const baseline = CHART.height - CHART.paddingBottom;
    ctx.lineTo(last.x, baseline);
    ctx.lineTo(from.x, baseline);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, CHART.height);
    gradient.addColorStop(0, hexToRgba(theme.accent, 0.25));
    gradient.addColorStop(1, hexToRgba(theme.accent, 0));
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  for (const c of curves) ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = CHART.lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  const last = points[points.length - 1];
  if (last) {
    ctx.beginPath();
    ctx.arc(last.x, last.y, CHART.dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/** `theme.accent` is a hex colour (`#fb8500`) — canvas gradients need rgba() for opacity stops. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
