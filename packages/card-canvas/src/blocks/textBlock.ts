import type { CardTheme } from '@stash/card-spec';
import { TYPE, contentWidth, layoutParagraphs, type TextMeasurer } from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

export function drawTextBlock(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { paragraphs: string[] },
  theme: CardTheme,
  measure: TextMeasurer,
): void {
  const { lines } = layoutParagraphs(block.paragraphs, contentWidth, measure);
  setFont(ctx, TYPE.body.size, TYPE.body.weight);
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.fillText(line.text, x, y + line.y + TYPE.body.lineHeight * 0.75);
  }
}
