import { LRUCache } from 'lru-cache';
import { normalizeText } from './normalize.js';
import { withTimeout, EmbeddingTimeoutError, type EmbeddingProvider } from './embedding-provider.js';
import type { Store, CardRecord } from '../db/types.js';
import { config } from '../config.js';

export interface Tier2Result {
  card: CardRecord;
  score: number;
}

export interface Tier2Outcome {
  /** null means: timed out or failed — caller must drop, never block (plan §2.4). */
  results: Tier2Result[] | null;
  fromCache: boolean;
}

/**
 * Tier 2 — query embedding + pgvector cosine search (plan §2.4).
 *
 * - Embeds the unmatched utterance with the configured provider.
 * - 300ms timeout -> drop (never throws to the caller, never blocks the
 *   pipeline waiting past the budget).
 * - LRU cache keyed on the normalized window, since repeated phrasing within
 *   a meeting is common and re-embedding it is wasted cost/latency.
 */
export class Tier2Matcher {
  private provider: EmbeddingProvider;
  private cache: LRUCache<string, number[]>;

  constructor(provider: EmbeddingProvider, opts?: { timeoutMs?: number; cacheMax?: number }) {
    this.provider = withTimeout(provider, opts?.timeoutMs ?? config.tier2TimeoutMs);
    this.cache = new LRUCache<string, number[]>({ max: opts?.cacheMax ?? config.tier2LruMax });
  }

  async match(store: Store, userId: string, utterance: string, limit = 3): Promise<Tier2Outcome> {
    const key = normalizeText(utterance);
    if (!key) return { results: [], fromCache: false };

    let fromCache = true;
    let embedding = this.cache.get(key);
    if (!embedding) {
      fromCache = false;
      try {
        embedding = await this.provider.embed(key);
      } catch (err) {
        if (err instanceof EmbeddingTimeoutError) {
          return { results: null, fromCache: false };
        }
        // Any other embedding failure also falls through to "drop, don't block".
        return { results: null, fromCache: false };
      }
      this.cache.set(key, embedding);
    }

    const results = await store.searchCardsByEmbedding(userId, embedding, limit);
    return { results: results.map((r) => ({ card: r.card, score: r.score })), fromCache };
  }

  /** Test helper. */
  cacheSize(): number {
    return this.cache.size;
  }
}
