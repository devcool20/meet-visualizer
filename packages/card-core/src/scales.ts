/**
 * Chart scales and formatters, shared by both renderers.
 *
 * Any arithmetic that decides where a pixel goes lives here. If a renderer
 * computes a bar position itself, the two renderers will drift and the golden
 * fixture tests will (correctly) fail.
 */
import type { Point } from '@stash/card-spec';
import { CHART, contentWidth } from './layout.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function chartMaxValue(series: Point[], explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  const peak = Math.max(0, ...series.map((p) => p.value));
  // A flat all-zero series would otherwise divide by zero.
  return peak === 0 ? 1 : peak * CHART.maxValueHeadroom;
}

export function plotArea(width = contentWidth): Rect {
  return {
    x: CHART.paddingLeft,
    y: CHART.paddingTop,
    width: width - CHART.paddingLeft - CHART.paddingRight,
    height: CHART.height - CHART.paddingTop - CHART.paddingBottom,
  };
}

export function barRects(series: Point[], maxValue: number, width = contentWidth): Rect[] {
  const area = plotArea(width);
  const n = series.length;
  const barWidth = (area.width - CHART.barGap * (n - 1)) / n;
  return series.map((point, i) => {
    const ratio = Math.max(0, Math.min(1, point.value / maxValue));
    const height = Math.max(2, ratio * area.height);
    return {
      x: area.x + i * (barWidth + CHART.barGap),
      y: area.y + area.height - height,
      width: barWidth,
      height,
    };
  });
}

export function linePoints(
  series: Point[],
  maxValue: number,
  width = contentWidth,
): { x: number; y: number }[] {
  const area = plotArea(width);
  const step = series.length > 1 ? area.width / (series.length - 1) : 0;
  return series.map((point, i) => {
    const ratio = Math.max(0, Math.min(1, point.value / maxValue));
    return { x: area.x + i * step, y: area.y + area.height - ratio * area.height };
  });
}

export function gridLineYs(width = contentWidth): number[] {
  const area = plotArea(width);
  const ys: number[] = [];
  for (let i = 1; i <= CHART.gridLines; i++) {
    ys.push(area.y + (area.height / (CHART.gridLines + 1)) * i);
  }
  return ys;
}

/**
 * Catmull-Rom smoothed path through the points, emitted as cubic beziers.
 * Shared so the SVG `d` attribute and the canvas bezierCurveTo calls trace the
 * identical curve.
 */
export function smoothPath(points: { x: number; y: number }[]): {
  from: { x: number; y: number };
  curves: { c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }[];
} {
  if (points.length === 0) return { from: { x: 0, y: 0 }, curves: [] };
  const curves: ReturnType<typeof smoothPath>['curves'] = [];
  const tension = 6;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    curves.push({
      c1x: p1.x + (p2.x - p0.x) / tension,
      c1y: p1.y + (p2.y - p0.y) / tension,
      c2x: p2.x - (p3.x - p1.x) / tension,
      c2y: p2.y - (p3.y - p1.y) / tension,
      x: p2.x,
      y: p2.y,
    });
  }
  return { from: points[0], curves };
}

export function svgPathData(points: { x: number; y: number }[]): string {
  const { from, curves } = smoothPath(points);
  if (curves.length === 0) return `M ${from.x} ${from.y}`;
  return (
    `M ${from.x} ${from.y} ` +
    curves
      .map((c) => `C ${c.c1x} ${c.c1y}, ${c.c2x} ${c.c2y}, ${c.x} ${c.y}`)
      .join(' ')
  );
}
