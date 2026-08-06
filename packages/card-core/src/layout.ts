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
  subtitle: { size: 13, weight: 400, lineHeight: 18 },
  metricLabel: { size: 14, weight: 500, lineHeight: 18, tracking: 0.6 },
  metricValue: { size: 26, weight: 700, lineHeight: 30 },
  metricValueSmall: { size: 19, weight: 600, lineHeight: 24 },
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
    case 'metric_row': {
      const hasDelta = block.items.some((i) => i.delta);
      const emphasised = block.items.some((i) => i.emphasis);
      const valueLine = emphasised ? TYPE.metricValue.lineHeight : TYPE.metricValueSmall.lineHeight;
      return TYPE.metricLabel.lineHeight + valueLine + (hasDelta ? TYPE.delta.lineHeight : 0);
    }
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
