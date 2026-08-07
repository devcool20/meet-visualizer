/**
 * Design tokens. This module is the single source of truth for both renderers.
 *
 * Values come from design.md §1.1 and src/imports/pasted_text/stash-live-ui-ux.md.
 * `textMuted` (#5A5550) is used throughout the app but is NOT an exact token in
 * design.md, so it is defined here explicitly rather than inferred (plan §2.3).
 */
import type { CardTheme } from '@stash/card-spec';

export const COLORS = {
  /** Warm Alabaster — canvas base background. */
  canvas: '#FBF9F6',
  /** Deep Espresso — primary text and solids. */
  text: '#1A1512',
  /** Muted Earth Slate — secondary contextual type. */
  textMuted: '#4A4540',
  /** System accent. Fills and dots only — see LEGIBILITY below. */
  accent: '#fb8500',
  ok: '#059669',
  warn: '#B45309',
  error: '#B91C1C',
  info: '#5A5550',
} as const;

export const DEFAULT_THEME: CardTheme = {
  surface: 'rgba(255,255,255,0.62)',
  border: 'rgba(26,21,18,0.06)',
  text: COLORS.text,
  textMuted: COLORS.textMuted,
  accent: COLORS.accent,
  blurPx: 20,
  saturate: 1.2,
};

export function resolveTheme(partial?: Partial<CardTheme>): CardTheme {
  return partial ? { ...DEFAULT_THEME, ...partial } : DEFAULT_THEME;
}

export const FONTS = {
  /** UI/body. Bundled with the extension as a web-accessible resource. */
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  /** Activity logs and any tabular figures. */
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

/**
 * Compression legibility rules (plan §3.2).
 *
 * Video conferencing uses 4:2:0 chroma subsampling: colour is stored at a
 * quarter of luma resolution. Two consequences drive every size below.
 *
 *  1. Contrast must be carried in LUMINANCE, not hue. #fb8500 on white has
 *     plenty of hue contrast and almost no luminance contrast, so small accent
 *     text smears into mush. Accent is therefore restricted to fills, bars and
 *     dots — never to text below TEXT_ACCENT_MIN_PX.
 *  2. Effective glyph size at 720p must stay at or above MIN_EFFECTIVE_FONT_PX.
 *     The landing-page mockup's ~6px labels are mockup scale, not video scale.
 */
export const LEGIBILITY = {
  MIN_EFFECTIVE_FONT_PX: 14,
  TEXT_ACCENT_MIN_PX: 20,
} as const;

/** Render at 2x and downsample exactly once (plan §3.2). */
export const RENDER_SCALE = 2;
