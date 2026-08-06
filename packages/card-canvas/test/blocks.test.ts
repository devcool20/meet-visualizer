import { describe, it, expect } from 'vitest';
import {
  drawMetricRow,
  drawBarChart,
  drawLineChart,
  drawAvatarGrid,
  drawStatusList,
  drawBullets,
  drawTextBlock,
  drawImageBlock,
  createRenderCanvas,
  get2DContext,
  createCanvasTextMeasurer,
} from '@stash/card-canvas';
import { DEFAULT_THEME, REVENUE_CARD, TEAM_CARD, GROWTH_CARD, COVERAGE_CARD } from '@stash/card-core';
import type { CardBlock } from '@stash/card-spec';

function blockOfKind(spec: { blocks: CardBlock[] }, kind: CardBlock['kind']): CardBlock {
  const block = spec.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`fixture is missing a ${kind} block`);
  return block;
}

describe('per-block-kind draw functions (smoke)', () => {
  const canvas = createRenderCanvas(400, 400);
  const ctx = get2DContext(canvas);
  const measure = createCanvasTextMeasurer();

  it('drawMetricRow does not throw', () => {
    const block = blockOfKind(REVENUE_CARD, 'metric_row') as Extract<CardBlock, { kind: 'metric_row' }>;
    expect(() => drawMetricRow(ctx, 20, 20, block, DEFAULT_THEME)).not.toThrow();
  });

  it('drawLineChart does not throw, with and without area fill', () => {
    const block = blockOfKind(REVENUE_CARD, 'line_chart') as Extract<CardBlock, { kind: 'line_chart' }>;
    expect(() => drawLineChart(ctx, 20, 20, block, DEFAULT_THEME)).not.toThrow();
    expect(() => drawLineChart(ctx, 20, 20, { ...block, area: !block.area }, DEFAULT_THEME)).not.toThrow();
  });

  it('drawBarChart does not throw', () => {
    const block = blockOfKind(GROWTH_CARD, 'bar_chart') as Extract<CardBlock, { kind: 'bar_chart' }>;
    expect(() => drawBarChart(ctx, 20, 20, block, DEFAULT_THEME)).not.toThrow();
  });

  it('drawAvatarGrid does not throw', () => {
    const block = blockOfKind(TEAM_CARD, 'avatar_grid') as Extract<CardBlock, { kind: 'avatar_grid' }>;
    expect(() => drawAvatarGrid(ctx, 20, 20, block, DEFAULT_THEME)).not.toThrow();
  });

  it('drawStatusList does not throw, monospace and not', () => {
    const block = blockOfKind(TEAM_CARD, 'status_list') as Extract<CardBlock, { kind: 'status_list' }>;
    expect(() => drawStatusList(ctx, 20, 20, block, DEFAULT_THEME)).not.toThrow();
    expect(() => drawStatusList(ctx, 20, 20, { ...block, monospace: true }, DEFAULT_THEME)).not.toThrow();
  });

  it('drawBullets does not throw', () => {
    const block = blockOfKind(COVERAGE_CARD, 'bullets') as Extract<CardBlock, { kind: 'bullets' }>;
    expect(() => drawBullets(ctx, 20, 20, block, DEFAULT_THEME, measure)).not.toThrow();
  });

  it('drawTextBlock does not throw', () => {
    const block = blockOfKind(COVERAGE_CARD, 'text') as Extract<CardBlock, { kind: 'text' }>;
    expect(() => drawTextBlock(ctx, 20, 20, block, DEFAULT_THEME, measure)).not.toThrow();
  });

  it('drawImageBlock returns skipped:true and never throws when no image is supplied', () => {
    const block: Extract<CardBlock, { kind: 'image' }> = { kind: 'image', url: 'https://example.com/x.png' };
    const result = drawImageBlock(ctx, 20, 20, block, DEFAULT_THEME, undefined);
    expect(result.skipped).toBe(true);
  });

  it('drawImageBlock draws (skipped:false) for a real, same-process image source', () => {
    const source = createRenderCanvas(32, 18);
    const srcCtx = get2DContext(source);
    srcCtx.fillStyle = '#123456';
    srcCtx.fillRect(0, 0, 32, 18);
    const block: Extract<CardBlock, { kind: 'image' }> = { kind: 'image', url: 'https://example.com/x.png', aspect: 16 / 9 };
    const result = drawImageBlock(ctx, 20, 20, block, DEFAULT_THEME, source as unknown as CanvasImageSource);
    expect(result.skipped).toBe(false);
  });
});
