/**
 * Public API of the React/DOM renderer.
 *
 * Used by the dashboard (card library tiles, the editor's live preview) and by
 * the landing page. Separate from the implementation so callers can be built in
 * parallel.
 */
import type { CardSpec, CardTheme } from '@stash/card-spec';

export interface GlassCardProps {
  spec: CardSpec;
  /**
   * Logical width in px. Defaults to CARD.width (358). The card scales
   * proportionally; blocks are never re-laid-out at different widths, so the
   * dashboard preview and the in-meeting raster stay geometrically identical.
   */
  width?: number;
  theme?: Partial<CardTheme>;
  /** Disable entry animation and use an instant opacity change instead. */
  reducedMotion?: boolean;
  /**
   * Frosted glass needs something behind it. The dashboard editor passes a
   * still frame from the user's camera so contrast is judged against reality
   * rather than against white.
   */
  className?: string;
}
