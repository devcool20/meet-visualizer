import { describe, it, expect } from 'vitest';
import { parseCardSpec } from '@stash/card-spec';
import { APPROVED_CARDS, COVERAGE_CARD } from '@stash/card-core';

describe('parseCardSpec — accepts every approved fixture', () => {
  for (const card of [...APPROVED_CARDS, COVERAGE_CARD]) {
    it(`accepts ${card.id}`, () => {
      const result = parseCardSpec(card);
      expect(result.ok).toBe(true);
    });
  }
});

describe('parseCardSpec — rejects malformed specs', () => {
  const base = APPROVED_CARDS[0];

  it('rejects an unknown block kind', () => {
    const bad = { ...base, blocks: [{ kind: 'gauge', value: 1 }] };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects an http:// image url (must be https:// — plan §3.2 taint note)', () => {
    const bad = {
      ...base,
      blocks: [{ kind: 'image', url: 'http://example.com/a.png' }],
    };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects an image aspect ratio above the allowed max (4)', () => {
    const bad = {
      ...base,
      blocks: [{ kind: 'image', url: 'https://example.com/a.png', aspect: 10 }],
    };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a negative/zero revision', () => {
    const bad = { ...base, revision: -1 };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a theme.saturate above the allowed max (3)', () => {
    const bad = { ...base, theme: { saturate: 10 } };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a bar_chart with more than 12 series points', () => {
    const bad = {
      ...base,
      blocks: [
        {
          kind: 'bar_chart',
          series: Array.from({ length: 13 }, (_, i) => ({ label: String(i), value: i })),
        },
      ],
    };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a card with zero blocks', () => {
    const bad = { ...base, blocks: [] };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a ttlMs outside [1000, 120000]', () => {
    const bad = { ...base, ttlMs: 500 };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-1 version', () => {
    const bad = { ...base, v: 2 };
    const result = parseCardSpec(bad);
    expect(result.ok).toBe(false);
  });
});
