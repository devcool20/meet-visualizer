import { describe, it, expect } from 'vitest';
import { buildPhraseIndex, matchTier1 } from '../matching/tier1.js';
import { normalizeText, tokenize } from '../matching/normalize.js';

describe('normalizeText / tokenize', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeText('  Q2   Revenue!!  Numbers?  ')).toBe('q2 revenue numbers');
  });

  it('keeps unicode letters/digits', () => {
    expect(normalizeText('Café — 42%')).toBe('café 42');
  });

  it('tokenizes on whitespace and returns [] for empty input', () => {
    expect(tokenize(normalizeText('our team'))).toEqual(['our', 'team']);
    expect(tokenize(normalizeText('   '))).toEqual([]);
  });
});

describe('matchTier1 — token-boundary-aware phrase matching', () => {
  const cards = [{ id: 'card-team', phrases: ['our team'] }];
  const index = buildPhraseIndex(cards);

  it('does NOT false-positive on "esteem" containing "team" as a substring', () => {
    // Naive text.includes(phrase) matching for "team" would match inside
    // "esteem" -- this is the exact failure mode called out in plan §2.4.
    const hits = matchTier1('I have a lot of self esteem about this project', index);
    expect(hits).toHaveLength(0);
  });

  it('matches "our team" as a whole-token phrase inside a longer utterance', () => {
    const hits = matchTier1('so if you look at our team this quarter', index);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ cardId: 'card-team', phrase: 'our team' });
  });

  it('does NOT false-negative on a short phrase sitting inside a long rolling window', () => {
    // A naive exact-equality check (window === phrase) would never match
    // here because the window is much longer than the phrase.
    const longWindow =
      'good morning everyone thanks for joining today I wanted to start by talking about ' +
      'our team and how we have grown this year before moving on to the roadmap discussion';
    const hits = matchTier1(longWindow, index);
    expect(hits.map((h) => h.cardId)).toContain('card-team');
  });

  it('matches regardless of punctuation/case differences between phrase and utterance', () => {
    const hits = matchTier1('OUR, TEAM!! is doing great', index);
    expect(hits).toHaveLength(1);
  });

  it('does not match a phrase whose tokens appear in the wrong order', () => {
    const hits = matchTier1('the team of our choosing', index);
    expect(hits).toHaveLength(0);
  });

  it('returns multiple hits when the window matches more than one card phrase', () => {
    const multiIndex = buildPhraseIndex([
      { id: 'card-a', phrases: ['revenue numbers'] },
      { id: 'card-b', phrases: ['our team'] },
    ]);
    const hits = matchTier1('the revenue numbers and our team both look good', multiIndex);
    expect(hits.map((h) => h.cardId).sort()).toEqual(['card-a', 'card-b']);
  });

  it('ignores phrases longer than the window', () => {
    const hits = matchTier1('team', index);
    expect(hits).toHaveLength(0);
  });

  it('skips empty/whitespace-only phrases when building the index', () => {
    const idx = buildPhraseIndex([{ id: 'x', phrases: ['   ', ''] }]);
    expect(idx).toHaveLength(0);
  });
});
