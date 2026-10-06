/**
 * Design recipes for AI-generated cards (plan §3.5).
 *
 * The exported shape — AccentKey (exactly six keys), ACCENTS, LayoutKey
 * (exactly four keys), LayoutRecipe, LAYOUT_RECIPES, resolveAccentTheme — is
 * **frozen** by the AI generation plan. The design agent supplies the content
 * (accent hex values and layout recipes); any shape change is a plan amendment.
 */
import type { CardTheme } from '@stash/card-spec';

export type AccentKey = 'amber' | 'teal' | 'indigo' | 'rose' | 'emerald' | 'slate';

export const ACCENTS: Record<AccentKey, { accent: string; label: string }> = {
  amber: { accent: '#fb8500', label: 'Amber' },
  teal: { accent: '#0F766E', label: 'Teal' },
  indigo: { accent: '#4338CA', label: 'Indigo' },
  rose: { accent: '#E11D48', label: 'Rose' },
  emerald: { accent: '#059669', label: 'Emerald' },
  slate: { accent: '#475569', label: 'Slate' },
};

export type LayoutKey = 'profile' | 'explainer' | 'stat' | 'list';

export interface LayoutRecipe {
  key: LayoutKey;
  /**
   * Ordered preference the assembler uses to sort blocks.
   *
   * Amendment: chart kinds were missing from this union even though
   * `CardBlock` has always allowed `bar_chart`/`line_chart`. Anything absent
   * sorted to the end (99) and was then cut by `maxContentBlocks`, so a
   * generated card physically could not carry a chart. Both kinds are now
   * orderable and placed next to `metric_row`, which is the block they sit
   * alongside.
   */
  blockOrder: Array<
    'image' | 'metric_row' | 'bar_chart' | 'line_chart' | 'text' | 'bullets' | 'status_list'
  >;
  maxContentBlocks: number; // ≤ 4; the source footer is added on top, cap 6 total
  preferImage: boolean;
}

export const LAYOUT_RECIPES: Record<LayoutKey, LayoutRecipe> = {
  profile: {
    key: 'profile',
    blockOrder: ['image', 'metric_row', 'line_chart', 'bar_chart', 'text', 'bullets', 'status_list'],
    maxContentBlocks: 3,
    preferImage: true,
  },
  explainer: {
    key: 'explainer',
    blockOrder: ['text', 'bullets', 'metric_row', 'line_chart', 'bar_chart', 'status_list', 'image'],
    maxContentBlocks: 4,
    preferImage: false,
  },
  stat: {
    key: 'stat',
    // A stat card leads with the numbers and then shows the shape of them.
    blockOrder: ['metric_row', 'line_chart', 'bar_chart', 'text', 'bullets', 'status_list', 'image'],
    maxContentBlocks: 3,
    preferImage: false,
  },
  list: {
    key: 'list',
    blockOrder: ['bullets', 'status_list', 'text', 'metric_row', 'bar_chart', 'line_chart', 'image'],
    maxContentBlocks: 4,
    preferImage: false,
  },
};

/**
 * Resolve an accent key to a partial CardTheme.
 * Only ever returns { accent } — text/textMuted/surface are never model-controlled.
 */
export function resolveAccentTheme(key: AccentKey): Pick<CardTheme, 'accent'> {
  return { accent: ACCENTS[key].accent };
}
