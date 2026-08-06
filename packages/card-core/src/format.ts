/**
 * Formatters. Both renderers must produce byte-identical strings, so no
 * locale-dependent defaults: everything pins en-US explicitly.
 */
import type { StatusState } from '@stash/card-spec';
import { COLORS } from './tokens.js';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Axis and tooltip numbers. Compacts above 10k so labels stay legible. */
export function formatNumber(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const body = abs >= 10_000 ? compact.format(value) : plain.format(value);
  return unit ? `${body}${unit}` : body;
}

export function statusColor(state: StatusState): string {
  switch (state) {
    case 'ok':
      return COLORS.ok;
    case 'warn':
      return COLORS.warn;
    case 'error':
      return COLORS.error;
    case 'info':
      return COLORS.info;
  }
}

export function personStatusColor(status: 'active' | 'idle' | 'offline'): string {
  switch (status) {
    case 'active':
      return COLORS.ok;
    case 'idle':
      return COLORS.warn;
    case 'offline':
      return 'rgba(26,21,18,0.25)';
  }
}

/**
 * Deterministic avatar tint. The mockup hand-picks a palette per member; a card
 * spec carries no colours, so we derive one stably from the name — the same
 * person always gets the same tint in the dashboard and in the meeting.
 */
const AVATAR_TINTS = [
  { bg: 'rgba(251,133,0,0.12)', fg: '#B45309' },
  { bg: 'rgba(245,158,11,0.14)', fg: '#92400E' },
  { bg: 'rgba(59,130,246,0.12)', fg: '#1D4ED8' },
  { bg: 'rgba(139,92,246,0.12)', fg: '#6D28D9' },
  { bg: 'rgba(244,63,94,0.12)', fg: '#BE123C' },
  { bg: 'rgba(20,184,166,0.14)', fg: '#0F766E' },
] as const;

export function avatarTint(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export function deltaGlyph(direction: 'up' | 'down' | 'flat'): string {
  return direction === 'up' ? '\u2191' : direction === 'down' ? '\u2193' : '\u2192';
}
