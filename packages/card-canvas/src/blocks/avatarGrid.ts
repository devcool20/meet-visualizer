import type { CardTheme, Person } from '@stash/card-spec';
import { AVATAR, TYPE, contentWidth, avatarTint, personStatusColor } from '@stash/card-core';
import { setFont } from '../measure.js';
import type { Ctx2D } from '../canvas-factory.js';

export function drawAvatarGrid(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: { people: Person[]; columns?: number },
  theme: CardTheme,
): void {
  const columns = block.columns ?? AVATAR.defaultColumns;
  const cellWidth = (contentWidth - AVATAR.gap * (columns - 1)) / columns;
  const rowHeight = AVATAR.size + AVATAR.labelGap + TYPE.personName.lineHeight;

  block.people.forEach((person, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cellX = x + col * (cellWidth + AVATAR.gap);
    const cellY = y + row * (rowHeight + AVATAR.gap);
    const cx = cellX + cellWidth / 2;
    const cy = cellY + AVATAR.size / 2;

    const tint = avatarTint(person.name);
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = tint.bg;
    ctx.fill();

    setFont(ctx, TYPE.initials.size, TYPE.initials.weight);
    ctx.fillStyle = tint.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(person.initials, cx, cy + 1);

    const dotR = AVATAR.statusDotRadius;
    const dotCx = cellX + cellWidth / 2 + AVATAR.size / 2 - AVATAR.statusDotInset - dotR;
    const dotCy = cellY + AVATAR.size - AVATAR.statusDotInset - dotR;
    ctx.beginPath();
    ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dotCx, dotCy, dotR - 1, 0, Math.PI * 2);
    ctx.fillStyle = personStatusColor(person.status);
    ctx.fill();

    setFont(ctx, TYPE.personName.size, TYPE.personName.weight);
    ctx.fillStyle = theme.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const firstName = person.name.split(' ')[0];
    const nameY = cellY + AVATAR.size + AVATAR.labelGap + TYPE.personName.lineHeight * 0.75;
    drawEllipsized(ctx, firstName, cx, nameY, cellWidth);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawEllipsized(ctx: Ctx2D, text: string, cx: number, y: number, maxWidth: number): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, cx, y);
    return;
  }
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}…`, cx, y);
}
