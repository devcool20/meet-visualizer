import type { CardTheme } from '@stash/card-spec';
import { BULLETS, TYPE, contentWidth, layoutBullets, type TextMeasurer } from '@stash/card-core';

export function Bullets({
  block,
  theme,
  measure,
}: {
  block: { items: string[] };
  theme: CardTheme;
  measure: TextMeasurer;
}) {
  const { lines } = layoutBullets(block.items, contentWidth, measure);
  const indent = BULLETS.dotGap;

  return (
    <div style={{ position: 'relative' }}>
      {lines.map((line, i) => (
        <div key={i} style={{ position: 'absolute', top: line.y, left: 0, right: 0, height: TYPE.body.lineHeight }}>
          {isLineStart(lines, i) && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: TYPE.body.lineHeight / 2 - BULLETS.dotRadius,
                width: BULLETS.dotRadius * 2,
                height: BULLETS.dotRadius * 2,
                borderRadius: '50%',
                background: theme.accent,
              }}
            />
          )}
          <span
            style={{
              position: 'absolute',
              left: indent,
              right: 0,
              fontSize: TYPE.body.size,
              fontWeight: TYPE.body.weight,
              lineHeight: `${TYPE.body.lineHeight}px`,
              color: theme.text,
            }}
          >
            {line.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The bullet dot only marks the first wrapped line of each item. `layoutBullets`
 * (card-core) does not tag which lines start a new run, so we infer it the same
 * way canvas will: the first line and any line whose gap from the previous one
 * is larger than a single line height starts a new bullet.
 */
function isLineStart(lines: { y: number }[], i: number): boolean {
  if (i === 0) return true;
  return lines[i].y - lines[i - 1].y > TYPE.body.lineHeight + 0.01;
}
