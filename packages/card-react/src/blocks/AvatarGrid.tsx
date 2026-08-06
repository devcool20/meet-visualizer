import type { Person, CardTheme } from '@stash/card-spec';
import { AVATAR, TYPE, contentWidth, avatarTint, personStatusColor } from '@stash/card-core';

export function AvatarGrid({
  block,
  theme,
}: {
  block: { people: Person[]; columns?: number };
  theme: CardTheme;
}) {
  const columns = block.columns ?? AVATAR.defaultColumns;
  const cellWidth = (contentWidth - AVATAR.gap * (columns - 1)) / columns;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`,
        columnGap: AVATAR.gap,
        rowGap: AVATAR.gap,
      }}
    >
      {block.people.map((person, i) => {
        const tint = avatarTint(person.name);
        return (
          <div
            key={i}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVATAR.labelGap }}
          >
            <div style={{ position: 'relative', width: AVATAR.size, height: AVATAR.size }}>
              <div
                style={{
                  width: AVATAR.size,
                  height: AVATAR.size,
                  borderRadius: '50%',
                  background: tint.bg,
                  color: tint.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: TYPE.initials.size,
                  fontWeight: TYPE.initials.weight,
                  boxShadow: '0 1px 2px rgba(26,21,18,0.08)',
                }}
              >
                {person.initials}
              </div>
              <span
                style={{
                  position: 'absolute',
                  bottom: AVATAR.statusDotInset,
                  right: AVATAR.statusDotInset,
                  width: AVATAR.statusDotRadius * 2,
                  height: AVATAR.statusDotRadius * 2,
                  borderRadius: '50%',
                  background: personStatusColor(person.status),
                  border: '1px solid white',
                }}
              />
            </div>
            <span
              style={{
                fontSize: TYPE.personName.size,
                fontWeight: TYPE.personName.weight,
                lineHeight: `${TYPE.personName.lineHeight}px`,
                color: theme.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: cellWidth,
              }}
            >
              {person.name.split(' ')[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
