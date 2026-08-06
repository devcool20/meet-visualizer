import { describe, it, expect } from 'vitest';
import {
  layoutCard,
  approximateMeasurer,
  findIllegibleTypeStyles,
  REVENUE_CARD,
  TEAM_CARD,
  PRODUCT_CARD,
  GROWTH_CARD,
  COVERAGE_CARD,
} from '@stash/card-core';

/**
 * Hardcoded expected numbers, computed once with `approximateMeasurer` and
 * pinned here so arithmetic drift in `layoutCard`/`blockHeight` is caught at
 * the number level rather than requiring a pixel diff (task brief, plan §5.2).
 *
 * If you change `CARD`, `TYPE`, `CHART`, `AVATAR`, `STATUS_LIST`, `BULLETS` or
 * `blockHeight` and these numbers move, that is expected — regenerate them
 * deliberately, don't just bump them to make the test pass.
 */
describe('layoutCard — hardcoded heights for the four approved fixtures', () => {
  it('REVENUE_CARD', () => {
    const layout = layoutCard(REVENUE_CARD, approximateMeasurer);
    expect(layout.height).toBe(288);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 66 },
      { kind: 'line_chart', y: 152, height: 116 },
    ]);
  });

  it('TEAM_CARD', () => {
    const layout = layoutCard(TEAM_CARD, approximateMeasurer);
    expect(layout.height).toBe(294);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 48 },
      { kind: 'avatar_grid', y: 134, height: 60 },
      { kind: 'status_list', y: 208, height: 66 },
    ]);
  });

  it('PRODUCT_CARD', () => {
    const layout = layoutCard(PRODUCT_CARD, approximateMeasurer);
    expect(layout.height).toBe(270);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 48 },
      { kind: 'line_chart', y: 134, height: 116 },
    ]);
  });

  it('GROWTH_CARD', () => {
    const layout = layoutCard(GROWTH_CARD, approximateMeasurer);
    expect(layout.height).toBe(270);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 48 },
      { kind: 'bar_chart', y: 134, height: 116 },
    ]);
  });

  it('COVERAGE_CARD (bullets + text)', () => {
    const layout = layoutCard(COVERAGE_CARD, approximateMeasurer);
    expect(layout.height).toBe(248);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'bullets', y: 72, height: 79 },
      { kind: 'text', y: 165, height: 63 },
    ]);
  });
});

describe('findIllegibleTypeStyles', () => {
  it('returns empty — every TYPE style survives the 4:2:0/720p legibility floor', () => {
    expect(findIllegibleTypeStyles()).toEqual([]);
  });
});
