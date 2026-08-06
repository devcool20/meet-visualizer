export type { RasterizedCard, RasterizeOptions, Rasterize } from './types.js';
export { rasterize } from './rasterize.js';

export { createRenderCanvas, get2DContext } from './canvas-factory.js';
export type { RenderCanvas, Ctx2D } from './canvas-factory.js';

export { createCanvasTextMeasurer, setFont } from './measure.js';

export {
  GlassBackdropRenderer,
  drawGlassBackdrop,
  roundRectPath,
} from './glass-backdrop.js';
export type { GlassRegion } from './glass-backdrop.js';

export {
  blurAndSaturateInPlace,
  supportsCanvasFilterBlur,
  __resetFilterSupportCache,
} from './blur.js';

export { loadImageCorsSafe, isImageTainting } from './taint-safety.js';

export { CardCompositor } from './composite.js';
export type { DegradationLevel, CompositorOptions, CompositeResult } from './composite.js';

export { drawMetricRow } from './blocks/metricRow.js';
export { drawBarChart } from './blocks/barChart.js';
export { drawLineChart } from './blocks/lineChart.js';
export { drawAvatarGrid } from './blocks/avatarGrid.js';
export { drawStatusList } from './blocks/statusList.js';
export { drawBullets } from './blocks/bullets.js';
export { drawTextBlock } from './blocks/textBlock.js';
export { drawImageBlock } from './blocks/imageBlock.js';
