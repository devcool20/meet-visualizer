import { normalizeText, tokenize } from './normalize.js';

/**
 * Tier 1 — normalized, token-boundary-aware phrase matching (plan §2.4).
 *
 * Two failure modes the plan calls out explicitly, and this implementation
 * must get both right (tested in tier1.test.ts):
 *
 * 1. A naive `text.includes(phrase)` substring check matches "team" inside
 *    "esteem" — false positive across a token boundary.
 * 2. A naive `text === phrase` exact-equality check would never match a
 *    short phrase ("our team") sitting inside a two-sentence rolling window
 *    — false negative.
 *
 * The fix: normalize both sides, tokenize on whitespace, and slide the
 * phrase's token sequence across the window's token sequence looking for an
 * exact contiguous token match. This is a substring match at the TOKEN
 * level, not the character level, which gets both cases right at once.
 */
export interface Tier1Match {
  phrase: string;
  cardId: string;
  /** Character offset (in the normalized window) where the match starts. */
  index: number;
}

export interface PhraseIndexEntry {
  cardId: string;
  phrase: string;
  normalizedPhrase: string;
  phraseTokens: string[];
}

/** Precompute per-card phrase tokens once; call again when phrases change. */
export function buildPhraseIndex(cards: Array<{ id: string; phrases: string[] }>): PhraseIndexEntry[] {
  const index: PhraseIndexEntry[] = [];
  for (const card of cards) {
    for (const phrase of card.phrases) {
      const normalizedPhrase = normalizeText(phrase);
      if (!normalizedPhrase) continue;
      index.push({
        cardId: card.id,
        phrase,
        normalizedPhrase,
        phraseTokens: tokenize(normalizedPhrase),
      });
    }
  }
  return index;
}

function containsTokenSequence(windowTokens: string[], phraseTokens: string[]): boolean {
  if (phraseTokens.length === 0 || phraseTokens.length > windowTokens.length) return false;
  for (let start = 0; start <= windowTokens.length - phraseTokens.length; start++) {
    let matched = true;
    for (let i = 0; i < phraseTokens.length; i++) {
      if (windowTokens[start + i] !== phraseTokens[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Matches the rolling transcript window against every phrase in the index.
 * Returns all hits (a window may match more than one card's phrase; caller
 * applies single-active-card / cooldown policy on top of this).
 */
export function matchTier1(window: string, index: PhraseIndexEntry[]): Tier1Match[] {
  const normalizedWindow = normalizeText(window);
  const windowTokens = tokenize(normalizedWindow);
  const hits: Tier1Match[] = [];
  for (const entry of index) {
    if (containsTokenSequence(windowTokens, entry.phraseTokens)) {
      const idx = normalizedWindow.indexOf(entry.normalizedPhrase);
      hits.push({ phrase: entry.phrase, cardId: entry.cardId, index: idx });
    }
  }
  return hits;
}
