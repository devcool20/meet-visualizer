import type { CardTheme } from '@stash/card-spec';
import { TYPE, contentWidth, layoutParagraphs, type TextMeasurer } from '@stash/card-core';

export function TextBlock({
  block,
  theme,
  measure,
}: {
  block: { paragraphs: string[] };
  theme: CardTheme;
  measure: TextMeasurer;
}) {
  const { lines } = layoutParagraphs(block.paragraphs, contentWidth, measure);
  return (
    <div style={{ position: 'relative' }}>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: line.y,
            left: 0,
            right: 0,
            fontSize: TYPE.body.size,
            fontWeight: TYPE.body.weight,
            lineHeight: `${TYPE.body.lineHeight}px`,
            color: theme.text,
          }}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}
