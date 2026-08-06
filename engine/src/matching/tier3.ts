import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import type { CardRecord } from '../db/types.js';

export interface Tier3Candidate {
  cardId: string;
  title: string;
  phrases: string[];
}

export interface Tier3Decision {
  cardId: string | null; // null = none of the candidates confirmed
  confidence: number;
}

/**
 * Confirmation LLM boundary (plan §2.4 Tier 3).
 *
 * "only 2-3 candidates in the prompt" is enforced by `pickCandidates`. The
 * "rate limited 6/min/user" requirement is enforced by the caller
 * (`MatchPipeline`), which owns one `RateLimiter` keyed by userId and only
 * calls `confirm()` when the budget allows — keeping this interface simple
 * and independently testable.
 */
export interface Tier3Confirmer {
  confirm(utterance: string, candidates: Tier3Candidate[]): Promise<Tier3Decision>;
}

export function pickCandidates(results: Array<{ card: CardRecord }>, max = 3): Tier3Candidate[] {
  return results.slice(0, max).map((r) => ({ cardId: r.card.id, title: r.card.title, phrases: r.card.phrases }));
}

export class GeminiTier3Confirmer implements Tier3Confirmer {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async confirm(utterance: string, candidates: Tier3Candidate[]): Promise<Tier3Decision> {
    if (candidates.length === 0) return { cardId: null, confidence: 0 };

    const response = await this.ai.models.generateContent({
      model: config.tier3Model,
      contents: `A presenter just said: "${utterance}"\n\nCandidate cards (choose at most one, or none):\n${candidates
        .map((c, i) => `${i + 1}. id=${c.cardId} title="${c.title}" phrases=${JSON.stringify(c.phrases)}`)
        .join('\n')}\n\nDoes the statement clearly intend to reference one of these cards?`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cardId: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
          },
          required: ['confidence'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    return { cardId: parsed.cardId ?? null, confidence: parsed.confidence ?? 0 };
  }
}

/** Deterministic mock — used in STASH_LOCAL and tests. Confirms the top candidate if any exist. */
export class MockTier3Confirmer implements Tier3Confirmer {
  async confirm(_utterance: string, candidates: Tier3Candidate[]): Promise<Tier3Decision> {
    if (candidates.length === 0) return { cardId: null, confidence: 0 };
    return { cardId: candidates[0].cardId, confidence: 0.9 };
  }
}
