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
    <img
      src={block.url}
      alt={block.alt ?? ''}
      style={{
        width: contentWidth,
        height,
        objectFit: 'cover',
        borderRadius: IMAGE.radius,
        border: `1px solid ${theme.border}`,
        display: 'block',
      }}
    />
  );
}
