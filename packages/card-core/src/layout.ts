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

// Every text style must survive 4:2:0 subsampling at 720p.
for (const [name, style] of Object.entries(TYPE)) {
  if (style.size < LEGIBILITY.MIN_EFFECTIVE_FONT_PX) {
    throw new Error(
      `Type style "${name}" is ${style.size}px, below the ${LEGIBILITY.MIN_EFFECTIVE_FONT_PX}px ` +
        `compression floor. See tokens.ts LEGIBILITY.`,
    );
  }
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

/** Rough fallback used when no real measurer is available (tests, SSR). */
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

export function blockHeight(
  block: CardBlock,
  measure: TextMeasurer = approximateMeasurer,
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
    case 'bullets': {
      const textWidth = width - BULLETS.dotGap;
      let h = 0;
      block.items.forEach((item, i) => {
        const lines = wrapText(item, textWidth, TYPE.body.size, TYPE.body.weight, measure);
        h += Math.max(1, lines.length) * TYPE.body.lineHeight;
        if (i > 0) h += BULLETS.rowGap;
      });
      return h;
    }
    case 'text': {
      let h = 0;
      block.paragraphs.forEach((p, i) => {
        const lines = wrapText(p, width, TYPE.body.size, TYPE.body.weight, measure);
        h += Math.max(1, lines.length) * TYPE.body.lineHeight;
        if (i > 0) h += BULLETS.rowGap;
      });
      return h;
    }
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
export function layoutCard(spec: CardSpec, measure: TextMeasurer = approximateMeasurer): CardLayout {
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
