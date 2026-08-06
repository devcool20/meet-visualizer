import type { CardTheme } from '@stash/card-spec';
import { BULLETS, TYPE, contentWidth, layoutBullets, type TextMeasurer } from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

export function drawBullets(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { items: string[] },
  theme: CardTheme,
  measure: TextMeasurer,
): void {
  const { lines } = layoutBullets(block.items, contentWidth, measure);
  const indent = BULLETS.dotGap;

  setFont(ctx, TYPE.body.size, TYPE.body.weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, i) => {
    const isStart = i === 0 || line.y - lines[i - 1].y > TYPE.body.lineHeight + 0.01;
    if (isStart) {
      ctx.beginPath();
      ctx.arc(x + BULLETS.dotRadius, y + line.y + TYPE.body.lineHeight / 2, BULLETS.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
    }
    ctx.fillStyle = theme.text;
    ctx.fillText(line.text, x + indent, y + line.y + TYPE.body.lineHeight * 0.75);
  });
}
