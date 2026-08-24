import type { CardTheme } from '@stash/card-spec';
import { TYPE, type TextMeasurer } from '@stash/card-core';

export function TextBlock({
  block,
  theme,
}: {
  block: { paragraphs: string[] };
  theme: CardTheme;
  measure?: TextMeasurer;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {block.paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            fontSize: `${TYPE.body.size}px`,
            fontWeight: TYPE.body.weight,
            lineHeight: `${TYPE.body.lineHeight}px`,
            color: theme.text,
            wordBreak: 'break-word',
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}
