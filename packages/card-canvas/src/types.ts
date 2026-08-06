/**
 * Public API of the canvas renderer.
 *
 * This file is the contract the extension's MAIN-world compositor codes
 * against. It is deliberately separate from the implementation so the two can
 * be built in parallel.
 */
import type { CardSpec, CardTheme } from '@stash/card-spec';

export interface RasterizedCard {
  /** The card drawn at RENDER_SCALE, transparent outside the rounded rect. */
  canvas: OffscreenCanvas | HTMLCanvasElement;
  /** Logical (1x) card size. `canvas` is this multiplied by `scale`. */
  width: number;
  height: number;
  scale: number;
  /** Identity of the raster, so the compositor knows when to re-rasterize. */
  cardId: string;
  revision: number;
  /** Blocks skipped because their image could not be loaded CORS-safely. */
  skippedBlocks: number;
}

export interface RasterizeOptions {
  /**
   * Preloaded, CORS-verified images keyed by url. The rasterizer never fetches:
   * loading is the caller's job so a slow or hostile image can never stall the
   * render loop, and a tainting image never reaches the capture canvas.
   */
  images?: Map<string, CanvasImageSource>;
  theme?: Partial<CardTheme>;
  scale?: number;
}

export type Rasterize = (spec: CardSpec, options?: RasterizeOptions) => RasterizedCard;
