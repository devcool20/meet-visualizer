import type { MetricItem, CardTheme } from '@stash/card-spec';
import {
  TYPE,
  deltaGlyph,
  layoutMetricRow,
  METRIC_ROW,
  type MetricCell,
  type TextMeasurer,
} from '@stash/card-core';

/**
 * Metric row.
 *
 * All geometry comes from `layoutMetricRow` (card-core) — the same function the
 * canvas rasterizer calls — so this DOM surface and the overlay drawn into a
 * meeting cannot drift.
 *
 * Two layouts, chosen by measurement rather than by item count:
 *  - `inline`: three short values across (e.g. "+40% YoY", "1.8%"), compact.
 *  - `stacked`: one hero figure at full size, the rest in a two-column grid.
 *    A row like "17 hectares / Yamuna / Shah Jahan" cannot survive three
 *    columns in 318px — it ellipsised the name — so the emphasised metric is
 *    promoted instead of truncated.
 */
export function MetricRow({
  block,
  theme,
  measure,
}: {
  block: { items: MetricItem[] };
  theme: CardTheme;
  measure: TextMeasurer;
}) {
  const layout = layoutMetricRow(block.items, measure);

  if (layout.mode === 'inline') {
    return (
      <div style={{ position: 'relative', width: '100%', height: layout.height }}>
        {layout.cells.map((cell, i) => (
          <Cell key={i} cell={cell} theme={theme} x={cell.x} width={cell.width} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: layout.height }}>
      <Cell cell={layout.hero} theme={theme} x={0} width={layout.hero.width} hero />

      {layout.support.length > 0 && (
        <>
          {/* Hairline separating the hero figure from its supporting metrics. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: layout.hero.y + TYPE.metricValue.lineHeight + METRIC_ROW.heroGap / 2,
              width: '100%',
              height: 1,
              background: theme.border || 'rgba(26,21,18,0.08)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: layout.hero.y + TYPE.metricValue.lineHeight + METRIC_ROW.heroGap,
              width: '100%',
            }}
          >
            {layout.support.map((cell, i) => (
              <Cell
                key={i}
                cell={cell}
                theme={theme}
                x={cell.x}
                width={cell.width}
                support
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Delta text renders at TYPE.delta.size, below LEGIBILITY.TEXT_ACCENT_MIN_PX. */
function Cell({
  cell,
  theme,
  x,
  width,
  hero,
  support,
}: {
  cell: MetricCell;
  theme: CardTheme;
  x: number;
  width: number;
  hero?: boolean;
  support?: boolean;
}) {
  const item = cell.item as MetricItem;
  const emphasis = hero || (!support && Boolean(item.emphasis));
  const valueStyle = hero
    ? TYPE.metricValue
    : support
      ? TYPE.metricSupportValue
      : item.emphasis
        ? TYPE.metricValue
        : TYPE.metricValueSmall;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: TYPE.metricLabel.size,
          fontWeight: TYPE.metricLabel.weight,
          lineHeight: `${TYPE.metricLabel.lineHeight}px`,
          letterSpacing: TYPE.metricLabel.tracking,
          textTransform: 'uppercase',
          color: theme.textMuted,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
      </p>

      {cell.lines.map((line, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            fontSize: valueStyle.size,
            fontWeight: valueStyle.weight,
            lineHeight: `${valueStyle.lineHeight}px`,
            color: emphasis ? theme.accent : theme.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {line}
        </p>
      ))}

      {/* Delta only makes sense inline, on the emphasised figure. */}
      {item.delta && !support && (
        <p
          style={{
            margin: 0,
            fontSize: TYPE.delta.size,
            fontWeight: TYPE.delta.weight,
            lineHeight: `${TYPE.delta.lineHeight}px`,
            color: theme.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {deltaGlyph(item.delta.direction)} {item.delta.value}
        </p>
      )}
    </div>
  );
}