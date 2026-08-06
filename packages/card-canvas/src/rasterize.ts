/**
 * `rasterize(spec, options)` — draws a `CardSpec` into a transparent-outside
 * OffscreenCanvas at `RENDER_SCALE`, per `RasterizedCard`/`RasterizeOptions`
 * (this package's frozen contract, `card-canvas/src/types.ts`).
 *
 * NO DOM. NO html2canvas. NO foreignObject. Every draw call below is a plain
 * `CanvasRenderingContext2D`/`OffscreenCanvasRenderingContext2D` call, so this
 * module runs unmodified in a Chrome extension MAIN world with no bundler
 * globals (plan §3.2).
 */
import type { CardSpec, CardBlock } from '@stash/card-spec';
import { CARD, TYPE, resolveTheme, layoutCard, RENDER_SCALE } from '@stash/card-core';
import type { RasterizedCard, RasterizeOptions } from './types.js';
import { createRenderCanvas, get2DContext, type Ctx2D } from './canvas-factory.js';
import { roundRectPath } from './glass-backdrop.js';
import { createCanvasTextMeasurer, setFont } from './measure.js';
import { drawMetricRow } from './blocks/metricRow.js';
import { drawBarChart } from './blocks/barChart.js';
import { drawLineChart } from './blocks/lineChart.js';
import { drawAvatarGrid } from './blocks/avatarGrid.js';
import { drawStatusList } from './blocks/statusList.js';
import { drawBullets } from './blocks/bullets.js';
import { drawTextBlock } from './blocks/textBlock.js';
import { drawImageBlock } from './blocks/imageBlock.js';

export function rasterize(spec: CardSpec, options: RasterizeOptions = {}): RasterizedCard {
  const theme = resolveTheme({ ...spec.theme, ...options.theme });
  const scale = options.scale ?? RENDER_SCALE;
  const measure = createCanvasTextMeasurer();
  const layout = layoutCard(spec, measure);

  const canvas = createRenderCanvas(layout.width * scale, layout.height * scale);
  const ctx = get2DContext(canvas);
  ctx.scale(scale, scale);

  // Card is drawn as an OPAQUE white-ish glass surface here: the compositor
  // (`composite.ts`) is what draws the blurred camera behind it and clips to
  // the rounded rect. A bare `rasterize()` call (e.g. in the dashboard's own
  // canvas preview) still needs *something* solid, so we paint the flat
  // `theme.surface` fill + border here too — the compositor overpaints this
  // exact region with the real region-blur before drawing this raster on top,
  // so nothing here is wasted at runtime, it's only a fallback for direct use.
  roundRectPath(ctx, 0, 0, layout.width, layout.height, CARD.radius);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.restore();
  ctx.lineWidth = CARD.borderWidth;
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  setFont(ctx, TYPE.title.size, TYPE.title.weight);
  ctx.fillStyle = theme.text;
  ctx.fillText(spec.title, CARD.paddingX, CARD.paddingTop + TYPE.title.lineHeight * 0.75);

  if (spec.subtitle) {
    setFont(ctx, TYPE.subtitle.size, TYPE.subtitle.weight);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(
      spec.subtitle,
      CARD.paddingX,
      CARD.paddingTop + TYPE.title.lineHeight + TYPE.subtitle.lineHeight * 0.75,
    );
  }

  let skippedBlocks = 0;
  for (const laid of layout.blocks) {
    const x = CARD.paddingX;
    const y = laid.y;
    skippedBlocks += drawBlock(ctx, x, y, laid.block, theme, measure, options);
  }

  return {
    canvas,
    width: layout.width,
    height: layout.height,
    scale,
    cardId: spec.id,
    revision: spec.revision,
    skippedBlocks,
  };
}

function drawBlock(
  ctx: Ctx2D,
  x: number,
  y: number,
  block: CardBlock,
  theme: ReturnType<typeof resolveTheme>,
  measure: ReturnType<typeof createCanvasTextMeasurer>,
  options: RasterizeOptions,
): number {
  switch (block.kind) {
    case 'metric_row':
      drawMetricRow(ctx, x, y, block, theme);
      return 0;
    case 'bar_chart':
      drawBarChart(ctx, x, y, block, theme);
      return 0;
    case 'line_chart':
      drawLineChart(ctx, x, y, block, theme);
      return 0;
    case 'avatar_grid':
      drawAvatarGrid(ctx, x, y, block, theme);
      return 0;
    case 'status_list':
      drawStatusList(ctx, x, y, block, theme);
      return 0;
    case 'bullets':
      drawBullets(ctx, x, y, block, theme, measure);
      return 0;
    case 'text':
      drawTextBlock(ctx, x, y, block, theme, measure);
      return 0;
    case 'image': {
      const image = options.images?.get(block.url);
      const { skipped } = drawImageBlock(ctx, x, y, block, theme, image);
      return skipped ? 1 : 0;
    }
  }
}
