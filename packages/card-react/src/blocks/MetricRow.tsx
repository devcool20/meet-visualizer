import type { MetricItem, CardTheme } from '@stash/card-spec';
import { TYPE, deltaGlyph } from '@stash/card-core';

export function MetricRow({ block, theme }: { block: { items: MetricItem[] }; theme: CardTheme }) {
  return (
    <div style={{ display: 'flex', gap: 12, height: '100%' }}>
      {block.items.map((item, i) => {
        const valueStyle = item.emphasis ? TYPE.metricValue : TYPE.metricValueSmall;
        // Delta text renders at TYPE.delta.size (14px), below
        // LEGIBILITY.TEXT_ACCENT_MIN_PX (20px) — accent is reserved for fills,
        // bars and dots at this size (card-core/tokens.ts), never small text,
        // because #fb8500 on white has almost no luminance contrast and
        // smears under 4:2:0 chroma subsampling. Use the neutral text colour
        // instead; the glyph (↑/↓/→) already carries the direction.
        const deltaColor = theme.text;
        return (
          <div
            key={i}
            style={{
              flex: item.emphasis ? '1.4 0 0%' : '1 0 0%',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
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
            <p
              style={{
                margin: 0,
                fontSize: valueStyle.size,
                fontWeight: valueStyle.weight,
                lineHeight: `${valueStyle.lineHeight}px`,
                color: item.emphasis ? theme.accent : theme.text,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.value}
            </p>
            {item.delta && (
              <p
                style={{
                  margin: 0,
                  fontSize: TYPE.delta.size,
                  fontWeight: TYPE.delta.weight,
                  lineHeight: `${TYPE.delta.lineHeight}px`,
                  color: deltaColor,
                  whiteSpace: 'nowrap',
                }}
              >
                {deltaGlyph(item.delta.direction)} {item.delta.value}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
