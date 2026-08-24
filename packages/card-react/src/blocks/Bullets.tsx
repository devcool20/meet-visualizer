import type { CardTheme } from '@stash/card-spec';
import { BULLETS, TYPE, type TextMeasurer } from '@stash/card-core';

export function Bullets({
  block,
  theme,
}: {
  block: { items: string[] };
  theme: CardTheme;
  measure?: TextMeasurer;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${BULLETS.rowGap}px` }}>
      {block.items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: `${BULLETS.dotGap}px`,
          }}
        >
          <span
            style={{
              width: `${BULLETS.dotRadius * 2}px`,
              height: `${BULLETS.dotRadius * 2}px`,
              minWidth: `${BULLETS.dotRadius * 2}px`,
              borderRadius: '50%',
              background: theme.accent || '#fb8500',
              marginTop: `${(TYPE.body.lineHeight - BULLETS.dotRadius * 2) / 2}px`,
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: `${TYPE.body.size}px`,
              fontWeight: TYPE.body.weight,
              lineHeight: `${TYPE.body.lineHeight}px`,
              color: theme.text,
              wordBreak: 'break-word',
              flex: 1,
            }}
          >
            {item}
          </span>
        </div>
      ))}
    </div>
  );
}
