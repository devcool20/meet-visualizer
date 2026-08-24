import type { Point, CardTheme } from '@stash/card-spec';
import { CHART, contentWidth, chartMaxValue, linePoints, gridLineYs, svgPathData } from '@stash/card-core';

/**
 * Line/area chart as inline SVG, using `svgPathData` from `card-core/scales`
 * for the Catmull-Rom smoothed curve — the canvas renderer traces the exact
 * same control points via `bezierCurveTo` from `smoothPath` (plan §3.2).
 */
export function LineChart({
  block,
  theme,
}: {
  block: { series: Point[]; area?: boolean; unit?: string };
  theme: CardTheme;
}) {
  const maxValue = chartMaxValue(block.series);
  const points = linePoints(block.series, maxValue, contentWidth);
  const gridYs = gridLineYs(contentWidth);
  const linePath = svgPathData(points);
  const area = block.area && points.length > 0;
  const areaPath = area
    ? `${linePath} L ${points[points.length - 1].x} ${CHART.height - CHART.paddingBottom} L ${points[0].x} ${CHART.height - CHART.paddingBottom} Z`
    : undefined;
  const gradientId = 'stash-line-grad';
  const last = points[points.length - 1];

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
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
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
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        <path d={linePath} fill="none" stroke={theme.accent} strokeWidth={CHART.lineWidth} strokeLinecap="round" />
        {last && <circle cx={last.x} cy={last.y} r={CHART.dotRadius} fill={theme.accent} />}
        {block.series
          .map((s, idx) => ({ x: points[idx]?.x ?? 0, y: points[idx]?.y ?? 0, label: s.label }))
          .filter((p) => p.label && p.label.trim())
          .map((p, idx, arr) => {
            const isFirst = idx === 0;
            const isLast = idx === arr.length - 1;
            const xPos = isFirst ? 6 : isLast ? contentWidth - 6 : p.x;
            const textAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
            return (
              <text
                key={idx}
                x={xPos}
                y={CHART.height - 8}
                fill={theme.textMuted}
                fontSize={13}
                fontWeight={500}
                textAnchor={textAnchor}
                fontFamily="Inter, -apple-system, sans-serif"
              >
                {p.label}
              </text>
            );
          })}
      </svg>
    </div>
  );
}
