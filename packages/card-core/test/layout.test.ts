import { describe, it, expect } from 'vitest';
import {
  layoutCard,
  layoutMetricRow,
  approximateMeasurer,
  findIllegibleTypeStyles,
  TYPE,
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

  // TEAM_CARD goes `stacked`: "Headcount / Performance / Open Roles" needs ~301px
  // of natural width against 294px available, so the inline row ellipsised it.
  it('TEAM_CARD', () => {
    const layout = layoutCard(TEAM_CARD, approximateMeasurer);
    expect(layout.height).toBe(343);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 97 },
      { kind: 'avatar_grid', y: 183, height: 60 },
      { kind: 'status_list', y: 257, height: 66 },
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

  // GROWTH_CARD goes `stacked` for the same reason, and it is the clearest case:
  // the label "Monthly Recurring Revenue" measures ~197px on its own, over half
  // the 318px content width, so inline it could only ever read
  // "Monthly Recurr…". As the hero label it gets the full width and fits.
  it('GROWTH_CARD', () => {
    const layout = layoutCard(GROWTH_CARD, approximateMeasurer);
    expect(layout.height).toBe(319);
    expect(layout.blocks.map((b) => ({ kind: b.block.kind, y: b.y, height: b.height }))).toEqual([
      { kind: 'metric_row', y: 72, height: 97 },
      { kind: 'bar_chart', y: 183, height: 116 },
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

describe('layoutMetricRow — adaptive inline vs stacked', () => {
  const m = approximateMeasurer;

  it('stays inline when every value fits on one line', () => {
    const l = layoutMetricRow(
      [
        { label: 'Q2 Revenue', value: '$240,000', emphasis: true },
        { label: 'Growth', value: '+40%', delta: { value: 'YoY', direction: 'up' } },
        { label: 'Churn', value: '1.8%' },
      ],
      m,
    );
    expect(l.mode).toBe('inline');
    expect(l.height).toBe(66);
    // Delta only fits inline, so the height accounts for it.
  });

  it('promotes the emphasised metric to a hero when values are long', () => {
    const l = layoutMetricRow(
      [
        { label: 'Area', value: '17 hectares', emphasis: true },
        { label: 'River', value: 'Yamuna' },
        { label: 'Built By', value: 'Shah Jahan' },
      ],
      m,
    );
    expect(l.mode).toBe('stacked');
    if (l.mode !== 'stacked') return;
    expect(l.hero.item.value).toBe('17 hectares');
    expect(l.support.map((c) => c.item.value)).toEqual(['Yamuna', 'Shah Jahan']);
  });

  it('gives a person\'s name a full support cell instead of ellipsising it', () => {
    // The bug this layout exists for: inline, "Shah Jahan" only ever got ~85px.
    const l = layoutMetricRow(
      [
        { label: 'Area', value: '17 hectares', emphasis: true },
        { label: 'River', value: 'Yamuna' },
        { label: 'Built By', value: 'Shah Jahan' },
      ],
      m,
    );
    if (l.mode !== 'stacked') throw new Error('expected stacked');
    for (const cell of l.support) {
      expect(m(cell.item.value, TYPE.metricSupportValue.size, TYPE.metricSupportValue.weight)).toBeLessThanOrEqual(
        cell.width,
      );
    }
  });

  it('picks the hero as the widest value when nothing is emphasised', () => {
    const l = layoutMetricRow(
      [
        { label: 'Area', value: '17 hectares' },
        { label: 'Commissioned', value: 'By Shah Jahan in 1631' },
      ],
      m,
    );
    if (l.mode !== 'stacked') throw new Error('expected stacked');
    expect(l.hero.item.value).toBe('By Shah Jahan in 1631');
    expect(l.support.map((c) => c.item.value)).toEqual(['17 hectares']);
  });

  it('handles an empty row without dividing by zero', () => {
    const l = layoutMetricRow([], m);
    expect(l.mode).toBe('inline');
    expect(l.height).toBe(0);
  });
});

describe('findIllegibleTypeStyles', () => {
  it('returns empty — every TYPE style survives the 4:2:0/720p legibility floor', () => {
    expect(findIllegibleTypeStyles()).toEqual([]);
  });
});
