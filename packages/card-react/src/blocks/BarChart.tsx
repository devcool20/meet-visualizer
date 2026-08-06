import type { Point, CardTheme } from '@stash/card-spec';
import { CHART, contentWidth, chartMaxValue, barRects, gridLineYs } from '@stash/card-core';

/**
 * Bar chart as inline SVG. Geometry comes ENTIRELY from `card-core/scales` —
 * this component must never compute a bar position itself (plan §3.2/§5.1).
 */
export function BarChart({
  block,
  theme,
}: {
  block: { series: Point[]; unit?: string; maxValue?: number };
  theme: CardTheme;
}) {
  const maxValue = chartMaxValue(block.series, block.maxValue);
  const rects = barRects(block.series, maxValue, contentWidth);
  const gridYs = gridLineYs(contentWidth);

  return (
    <div
      style={{
        width: contentWidth,
        height: CHART.height,
        borderRadius: 12,
        background: 'rgba(26,21,18,0.05)',
        border: '1px solid rgba(26,21,18,0.04)',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <svg viewBox={`0 0 ${contentWidth} ${CHART.height}`} width={contentWidth} height={CHART.height}>
        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={0}
            y1={y}
            x2={contentWidth}
            y2={y}
            stroke="rgba(26,21,18,0.06)"
            strokeDasharray="3,3"
          />
        ))}
        {rects.map((rect, i) => (
          <rect
            key={i}
            x={rect.x}
            y={rect.y}
            width={Math.max(0, rect.width)}
            height={rect.height}
            rx={CHART.barRadius}
            fill={theme.accent}
          />
        ))}
      </svg>
    </div>
  );
}
