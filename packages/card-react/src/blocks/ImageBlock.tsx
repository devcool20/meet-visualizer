import type { CardTheme } from '@stash/card-spec';
import { IMAGE, contentWidth } from '@stash/card-core';

/**
 * DOM `<img>` has no canvas-tainting concern — that risk is specific to
 * `ctx.drawImage()` feeding a `captureStream()`'d canvas (plan §3.2), which is
 * exclusively a `card-canvas` problem. The dashboard can render the image
 * directly.
 */
export function ImageBlock({
  block,
  theme,
}: {
  block: { url: string; alt?: string; aspect?: number };
  theme: CardTheme;
}) {
  const aspect = block.aspect ?? IMAGE.defaultAspect;
  const height = Math.min(contentWidth / aspect, IMAGE.maxHeight);
  return (
    <div
      style={{
        width: contentWidth,
        height,
        borderRadius: IMAGE.radius,
        border: `1px solid ${theme.border || 'rgba(26,21,18,0.08)'}`,
        overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.4), rgba(240,230,220,0.4))',
      }}
    >
      <img
        src={block.url}
        alt={block.alt ?? ''}
        loading="eager"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
      />
    </div>
  );
}
