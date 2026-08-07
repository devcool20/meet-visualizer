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

export { BusynessSampler } from './busyness-sampler.js';
export type { BusynessSamplerOptions, BusynessReading } from './busyness-sampler.js';

export { drawPlaceholderCard, PLACEHOLDER_HEIGHT, SHIMMER_PERIOD_MS } from './placeholder.js';
export type { PlaceholderKind, PlaceholderOptions } from './placeholder.js';

export { CardTtlTimer, resolveTtlMs, TTL_MIN_MS, DEFAULT_AUTO_DISMISS_MS } from './ttl.js';
export type { TtlResolution } from './ttl.js';

export { drawMetricRow } from './blocks/metricRow.js';
export { drawBarChart } from './blocks/barChart.js';
export { drawLineChart } from './blocks/lineChart.js';
export { drawAvatarGrid } from './blocks/avatarGrid.js';
export { drawStatusList } from './blocks/statusList.js';
export { drawBullets } from './blocks/bullets.js';
export { drawTextBlock } from './blocks/textBlock.js';
export { drawImageBlock } from './blocks/imageBlock.js';
