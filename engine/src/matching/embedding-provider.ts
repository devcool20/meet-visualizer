/**
 * Embedding provider boundary (plan §2.4 Tier 2).
 *
 * Kept as an interface so tests never call the real Gemini API (constraint:
 * "tests must pass with no network access and no real API keys"). The real
 * implementation is the only place that talks to `@google/genai`.
 */
export interface EmbeddingProvider {
  /** Returns a 768-dim embedding vector, or throws on failure/timeout. */
  embed(text: string): Promise<number[]>;
}

export class EmbeddingTimeoutError extends Error {
  constructor() {
    super('Embedding call exceeded the tier-2 timeout budget');
  }
}

/** Wraps any provider with the 300ms timeout the plan mandates (§2.4). */
export function withTimeout(provider: EmbeddingProvider, timeoutMs: number): EmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      let timer: NodeJS.Timeout;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EmbeddingTimeoutError()), timeoutMs);
      });
      try {
        return await Promise.race([provider.embed(text), timeout]);
      } finally {
        clearTimeout(timer!);
      }
    },
  };
}
