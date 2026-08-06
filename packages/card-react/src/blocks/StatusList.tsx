import type { StatusRow, CardTheme } from '@stash/card-spec';
import { STATUS_LIST, TYPE, FONTS, statusColor } from '@stash/card-core';

export function StatusList({
  block,
  theme,
}: {
  block: { rows: StatusRow[]; monospace?: boolean };
  theme: CardTheme;
}) {
  return (
    <div>
      {block.rows.map((row, i) => (
        <div
          key={i}
          style={{
            height: STATUS_LIST.rowHeight,
            display: 'flex',
            alignItems: 'center',
            gap: STATUS_LIST.dotGap,
          }}
        >
          <span
            style={{
              width: STATUS_LIST.dotRadius * 2,
              height: STATUS_LIST.dotRadius * 2,
              minWidth: STATUS_LIST.dotRadius * 2,
              borderRadius: '50%',
              background: statusColor(row.state),
            }}
          />
          <span
            style={{
              fontSize: TYPE.mono.size,
              fontWeight: TYPE.mono.weight,
              lineHeight: `${TYPE.mono.lineHeight}px`,
              fontFamily: block.monospace ? FONTS.mono : FONTS.sans,
              color: theme.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}
