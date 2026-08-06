import type { CardTheme, StatusRow } from '@stash/card-spec';
import { STATUS_LIST, TYPE, statusColor } from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

export function drawStatusList(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { rows: StatusRow[]; monospace?: boolean },
  theme: CardTheme,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  block.rows.forEach((row, i) => {
    const rowY = y + i * STATUS_LIST.rowHeight + STATUS_LIST.rowHeight / 2;
    ctx.beginPath();
    ctx.arc(x + STATUS_LIST.dotRadius, rowY, STATUS_LIST.dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = statusColor(row.state);
    ctx.fill();

    setFont(ctx, TYPE.mono.size, TYPE.mono.weight, block.monospace);
    ctx.fillStyle = theme.text;
    ctx.fillText(row.text, x + STATUS_LIST.dotRadius * 2 + STATUS_LIST.dotGap, rowY);
  });
  ctx.textBaseline = 'alphabetic';
}
