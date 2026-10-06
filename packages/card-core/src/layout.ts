/**
 * Layout constants and measurement.
 *
 * Both renderers derive every position from this module so the React preview in
 * the dashboard and the canvas draw in the meeting agree. Golden fixture tests
 * assert that agreement; this file is what makes it achievable.
 *
 * All values are in CSS pixels at 1x, for a card of width CARD.width.
 */
import type { CardBlock, CardSpec } from '@stash/card-spec';
import { LEGIBILITY } from './tokens.js';
import { deltaGlyph } from './format.js';

export const CARD = {
  /** ~28% of a 1280px frame, matching the approved mockup. */
  width: 358,
  radius: 20,
  paddingX: 20,
  paddingTop: 18,
  paddingBottom: 20,
  /** Vertical gap between blocks. */
  blockGap: 14,
  borderWidth: 1,
} as const;

export const TYPE = {
  title: { size: 17, weight: 600, lineHeight: 22 },
  subtitle: { size: 14, weight: 400, lineHeight: 18 },
  metricLabel: { size: 14, weight: 500, lineHeight: 18, tracking: 0.6 },
  metricValue: { size: 26, weight: 700, lineHeight: 30 },
  metricValueSmall: { size: 19, weight: 600, lineHeight: 24 },
  /** Value of a supporting metric in the `stacked` metric-row layout. */
  metricSupportValue: { size: 16, weight: 600, lineHeight: 20 },
  delta: { size: 14, weight: 600, lineHeight: 18 },
  axis: { size: 14, weight: 500, lineHeight: 16 },
  body: { size: 15, weight: 400, lineHeight: 21 },
  mono: { size: 14, weight: 400, lineHeight: 20 },
  personName: { size: 14, weight: 500, lineHeight: 16 },
  initials: { size: 15, weight: 600, lineHeight: 15 },
} as const;

/**
 * Every text style must survive 4:2:0 subsampling at 720p.
 *
 * This is checked by a unit test, deliberately NOT by a module-level throw:
 * this module is evaluated in the MAIN world of the Meet page, and a throw at
 * script-eval time there would take down the compositor that owns the user's
 * outbound camera. A token regression must fail CI, never a live call (§3.7).
 */
export function findIllegibleTypeStyles(): string[] {
  return Object.entries(TYPE)
    .filter(([, style]) => style.size < LEGIBILITY.MIN_EFFECTIVE_FONT_PX)
    .map(([name, style]) => `${name} (${style.size}px)`);
}

export const CHART = {
  height: 116,
  paddingTop: 10,
  paddingBottom: 22,
  paddingLeft: 4,
  paddingRight: 4,
  barGap: 8,
  barRadius: 4,
  /** Headroom above the tallest bar so it never touches the block edge. */
  maxValueHeadroom: 1.15,
  gridLines: 3,
  lineWidth: 2.5,
  dotRadius: 3,
} as const;

export const AVATAR = {
  size: 40,
  gap: 10,
  defaultColumns: 6,
  statusDotRadius: 4,
  statusDotInset: 2,
  labelGap: 4,
} as const;

export const STATUS_LIST = {
  rowHeight: 22,
  dotRadius: 3,
  dotGap: 10,
} as const;

export const BULLETS = {
  rowGap: 8,
  dotRadius: 2.5,
  dotGap: 12,
} as const;

export const IMAGE = {
  radius: 12,
  defaultAspect: 16 / 9,
  maxHeight: 200,
} as const;

export const contentWidth = CARD.width - CARD.paddingX * 2;

/** Shared metric-row geometry. Both renderers read these, never their own copy. */
export const METRIC_ROW = {
  /** Gutter between columns, in px at CARD.width. */
  gap: 12,
  /**
   * Relative resistance to shrinking when a row cannot fit its natural widths.
   * The emphasised column is the primary datum, so it keeps its digits longest.
   */
  emphasisWeight: 2,
  normalWeight: 1,
  /** Vertical gap between the hero and the support grid in `stacked` mode. */
  heroGap: 11,
  /** Support metrics are laid out this many per row in `stacked` mode. */
  supportColumns: 2,
  /** Support values wrap to at most this many lines before ellipsising. */
  maxSupportLines: 2,
} as const;

/** The subset of a metric item this function needs. */
export interface MetricColumn {
  label: string;
  value: string;
  emphasis?: boolean;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
}

/**
 * Column widths for a metric row, allocated from measured content.
 *
 * This used to be a fixed 1.4 : 1 : 1 flex ratio, which handed the emphasised
 * column 121px at CARD.width. The approved fixtures need more than that —
 * "$240,000" measures ~126px and "142 Active" ~131px — so the primary number
 * was being ellipsised to "$240,0…" on *every* surface that renders a card:
 * the landing demo, the dashboard library, the editor preview, and the overlay
 * drawn into the call.
 *
 * Allocation is now measured rather than assumed:
 *  - If the natural widths fit, they are scaled up proportionally so the row
 *    still spans the card and no text is ever cut.
 *  - If they do not fit, the available width is shared out by weight so the
 *    emphasised value keeps its digits for as long as possible, and only then
 *    does anything truncate.
 *
 * Both renderers call this, so the DOM preview and the canvas raster agree by
 * construction rather than by two copies of the same magic number.
 */
export function metricColumnWidths(
  items: readonly MetricColumn[],
  measure: TextMeasurer,
  width: number = contentWidth,
): number[] {
  const n = items.length;
  if (n === 0) return [];

  const available = width - METRIC_ROW.gap * (n - 1);

  const natural = items.map((item) => {
    const valueStyle = item.emphasis ? TYPE.metricValue : TYPE.metricValueSmall;
    // `measureText` ignores letter-spacing, so add the DOM tracking back in -
    // uppercase labels are the widest strings in the row.
    const label = item.label.toUpperCase();
    let need =
      measure(label, TYPE.metricLabel.size, TYPE.metricLabel.weight) +
      TYPE.metricLabel.tracking * label.length;
    need = Math.max(need, measure(item.value, valueStyle.size, valueStyle.weight));
    if (item.delta) {
      need = Math.max(
        need,
        measure(`${deltaGlyph(item.delta.direction)} ${item.delta.value}`, TYPE.delta.size, TYPE.delta.weight),
      );
    }
    return need;
  });

  const totalNatural = natural.reduce((a, b) => a + b, 0);
  if (totalNatural <= available) {
    const scale = totalNatural > 0 ? available / totalNatural : 1;
    return natural.map((w) => w * scale);
  }

  const weights = items.map((item) =>
    item.emphasis ? METRIC_ROW.emphasisWeight : METRIC_ROW.normalWeight,
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (available * w) / totalWeight);
}

/** One resolved metric cell, in card-local coordinates relative to the block. */
export interface MetricCell {
  item: MetricColumn;
  /** x offset from the block's left edge. */
  x: number;
  /** Allocated width. */
  width: number;
  /** y offset from the block's top edge, for the value baseline box. */
  y: number;
  /** Value text, already wrapped in `stacked` mode. */
  lines: string[];
}

/**
 * A fully resolved metric row. Both renderers draw from this and never from
 * their own copy of the geometry, which is what keeps the DOM preview and the
 * overlay rasterised into a meeting identical.
 */
export type MetricRowLayout =
  | {
      mode: 'inline';
      cells: MetricCell[];
      height: number;
    }
  | {
      mode: 'stacked';
      hero: MetricCell;
      support: MetricCell[];
      /** Width of each support column. */
      supportWidth: number;
      supportRows: number;
      height: number;
    };

/** Label + value height of one support row. */
function supportRowHeight(maxLines: number): number {
  return TYPE.metricLabel.lineHeight + maxLines * TYPE.metricSupportValue.lineHeight;
}

/**
 * Resolve a metric row into one of two layouts.
 *
 * `inline` is the original three-across row, kept because short values
 * ("+40% YoY", "1.8%") read well that way and it keeps the card short.
 *
 * `stacked` exists because the inline row cannot hold long values. A card such
 * as Taj Mahal has "17 hectares / Yamuna / Shah Jahan": sharing 318px three ways
 * gives the third column ~85px, which ellipsised it to "Shah …". Rather than
 * truncate a person's name, the row promotes the emphasised metric to a hero
 * figure and lays the rest out in a two-column grid, where each cell has ~153px
 * and wraps to two lines.
 *
 * The mode is chosen by measurement, not by item count, so a row is never made
 * taller than it needs to be.
 */
export function layoutMetricRow(
  items: readonly MetricColumn[],
  measure: TextMeasurer,
  width: number = contentWidth,
): MetricRowLayout {
  if (items.length === 0) return { mode: 'inline', cells: [], height: 0 };

  const widths = metricColumnWidths(items, measure, width);

  // Does every value survive the inline allocation on a single line?
  const valueStyle = (item: MetricColumn) =>
    item.emphasis ? TYPE.metricValue : TYPE.metricValueSmall;
  const fitsInline = items.every((item, i) => {
    const need = measure(item.value, valueStyle(item).size, valueStyle(item).weight);
    const labelNeed =
      measure(
        item.label.toUpperCase(),
        TYPE.metricLabel.size,
        TYPE.metricLabel.weight,
      ) +
      TYPE.metricLabel.tracking * item.label.length;
    return Math.max(need, labelNeed) <= widths[i] + 0.5;
  });

  const hasDelta = items.some((i) => i.delta);

  if (fitsInline) {
    const valueLine = items.some((i) => i.emphasis)
      ? TYPE.metricValue.lineHeight
      : TYPE.metricValueSmall.lineHeight;
    return {
      mode: 'inline',
      cells: items.map((item, i) => ({
        item,
        x: widths.slice(0, i).reduce((a, b) => a + b, 0) + METRIC_ROW.gap * i,
        width: widths[i],
        y: TYPE.metricLabel.lineHeight,
        lines: [item.value],
      })),
      height:
        TYPE.metricLabel.lineHeight + valueLine + (hasDelta ? TYPE.delta.lineHeight : 0),
    };
  }

  // Stacked: the emphasised item is the hero, otherwise the widest value.
  const heroIndex = items.findIndex((i) => i.emphasis);
  const fallbackIndex = items.reduce(
    (best, item, i) =>
      measure(item.value, TYPE.metricValue.size, TYPE.metricValue.weight) >
      measure(items[best].value, TYPE.metricValue.size, TYPE.metricValue.weight)
        ? i
        : best,
    0,
  );
  const heroAt = heroIndex >= 0 ? heroIndex : fallbackIndex;
  const hero = items[heroAt];
  const rest = items.filter((_, i) => i !== heroAt);

  // A lone support metric should use the full width rather than sit in the left
  // half beside dead space, so the grid never has more columns than it needs.
  const columns = Math.max(1, Math.min(METRIC_ROW.supportColumns, rest.length));
  const supportWidth = (width - METRIC_ROW.gap * (columns - 1)) / columns;

  const support: MetricCell[] = rest.map((item, i) => {
    const wrapped = wrapText(
      item.value,
      supportWidth,
      TYPE.metricSupportValue.size,
      TYPE.metricSupportValue.weight,
      measure,
    );
    const lines =
      wrapped.length > METRIC_ROW.maxSupportLines
        ? wrapped.slice(0, METRIC_ROW.maxSupportLines)
        : wrapped.length
          ? wrapped
          : [''];
    return {
      item,
      x: (i % columns) * (supportWidth + METRIC_ROW.gap),
      width: supportWidth,
      y: 0,
      lines,
    };
  });

  const supportRows = Math.ceil(support.length / columns);
  const maxLines = support.reduce((m, c) => Math.max(m, c.lines.length), 1);
  const heroHeight = TYPE.metricLabel.lineHeight + TYPE.metricValue.lineHeight;

  return {
    mode: 'stacked',
    hero: {
      item: hero,
      x: 0,
      width,
      y: TYPE.metricLabel.lineHeight,
      lines: [hero.value],
    },
    support,
    supportWidth,
    supportRows,
    height:
      heroHeight +
      (support.length ? METRIC_ROW.heroGap + supportRowHeight(maxLines) : 0),
  };
}

/**
 * Height of a single block at `contentWidth`.
 *
 * Text-wrapping blocks need a measurer because canvas and DOM measure text
 * differently; callers pass one so both renderers can share this arithmetic.
 */
export type TextMeasurer = (text: string, fontSize: number, weight: number, mono?: boolean) => number;

/**
 * Coarse width estimate for tests and SSR.
 *
 * Never used as a default: `blockHeight` and `layoutCard` require an explicit
 * measurer so a renderer that forgets to pass its real one is a type error
 * rather than a silent parity break between DOM and canvas text metrics.
 */
export const approximateMeasurer: TextMeasurer = (text, fontSize, _weight, mono) =>
  text.length * fontSize * (mono ? 0.6 : 0.52);

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: number,
  measure: TextMeasurer,
  mono = false,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (measure(candidate, fontSize, weight, mono) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** A single wrapped line with its y offset relative to the block's top. */
export interface TextLine {
  text: string;
  y: number;
}

/**
 * Lay out a stack of wrapped text runs (bullets or paragraphs).
 *
 * Both renderers call this rather than reimplementing the wrap-and-gap loop.
 * The inter-run gap is applied BEFORE every run except the first; duplicating
 * that conditional in two renderers is exactly the off-by-one that golden
 * fixtures catch late and expensively.
 */
export function layoutTextRuns(
  runs: string[],
  width: number,
  measure: TextMeasurer,
  opts: { fontSize: number; weight: number; lineHeight: number; runGap: number; mono?: boolean },
): { lines: TextLine[]; height: number } {
  const lines: TextLine[] = [];
  let y = 0;
  runs.forEach((run, i) => {
    if (i > 0) y += opts.runGap;
    const wrapped = wrapText(run, width, opts.fontSize, opts.weight, measure, opts.mono);
    for (const text of wrapped.length ? wrapped : ['']) {
      lines.push({ text, y });
      y += opts.lineHeight;
    }
  });
  return { lines, height: y };
}

/** Bullet rows, indented past the bullet dot. */
export function layoutBullets(items: string[], width: number, measure: TextMeasurer) {
  return layoutTextRuns(items, width - BULLETS.dotGap, measure, {
    fontSize: TYPE.body.size,
    weight: TYPE.body.weight,
    lineHeight: TYPE.body.lineHeight,
    runGap: BULLETS.rowGap,
  });
}

/** Body paragraphs at full content width. */
export function layoutParagraphs(paragraphs: string[], width: number, measure: TextMeasurer) {
  return layoutTextRuns(paragraphs, width, measure, {
    fontSize: TYPE.body.size,
    weight: TYPE.body.weight,
    lineHeight: TYPE.body.lineHeight,
    runGap: BULLETS.rowGap,
  });
}

export function blockHeight(
  block: CardBlock,
  measure: TextMeasurer,
  width = contentWidth,
): number {
  switch (block.kind) {
    case 'metric_row':
      return layoutMetricRow(block.items, measure, width).height;
    case 'bar_chart':
    case 'line_chart':
      return CHART.height;
    case 'avatar_grid': {
      const columns = block.columns ?? AVATAR.defaultColumns;
      const rows = Math.ceil(block.people.length / columns);
      const rowHeight = AVATAR.size + AVATAR.labelGap + TYPE.personName.lineHeight;
      return rows * rowHeight + (rows - 1) * AVATAR.gap;
    }
    case 'status_list':
      return block.rows.length * STATUS_LIST.rowHeight;
    case 'bullets':
      return layoutBullets(block.items, width, measure).height;
    case 'text':
      return layoutParagraphs(block.paragraphs, width, measure).height;
    case 'image': {
      const aspect = block.aspect ?? IMAGE.defaultAspect;
      return Math.min(width / aspect, IMAGE.maxHeight);
    }
  }
}

export interface LaidOutBlock {
  block: CardBlock;
  y: number;
  height: number;
}

export interface CardLayout {
  width: number;
  height: number;
  headerHeight: number;
  blocks: LaidOutBlock[];
}

/** Compute the full card geometry. Deterministic given the same measurer. */
export function layoutCard(spec: CardSpec, measure: TextMeasurer): CardLayout {
  const headerHeight =
    TYPE.title.lineHeight + (spec.subtitle ? TYPE.subtitle.lineHeight : 0);

  let y = CARD.paddingTop + headerHeight + CARD.blockGap;
  const blocks: LaidOutBlock[] = spec.blocks.map((block, i) => {
    if (i > 0) y += CARD.blockGap;
    const height = blockHeight(block, measure);
    const entry = { block, y, height };
    y += height;
    return entry;
  });

  return {
    width: CARD.width,
    height: Math.round(y + CARD.paddingBottom),
    headerHeight,
    blocks,
  };
}
