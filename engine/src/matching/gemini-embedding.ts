import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import type { EmbeddingProvider } from './embedding-provider.js';

/**
 * Real Gemini embedding provider (plan §2.4).
 *
 * `output_dimensionality: 768` is set EXPLICITLY — the model's default is
 * 3072, which would fail to write into the `vector(768)` column. This is
 * called out in the plan as a v1 mistake; do not remove this option.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: config.embeddingModel,
      contents: text,
      config: {
        outputDimensionality: config.embeddingDimensions,
      },
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== config.embeddingDimensions) {
      throw new Error(
        `Gemini embedding returned ${values?.length ?? 0} dims, expected ${config.embeddingDimensions}`,
      );
    }
    return values;
  }
}

/**
 * Deterministic mock embedding provider — used in STASH_LOCAL and in tests.
 * Hashes the normalized text into a stable pseudo-random 768-dim unit
 * vector so that identical text always embeds identically (needed for the
 * LRU cache test) and different text embeds differently (needed for the
 * threshold test), without any network call.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  constructor(private dims: number = 768) {}

  async embed(text: string): Promise<number[]> {
    const vec = new Array(this.dims).fill(0);
    let seed = 0;
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    for (let i = 0; i < this.dims; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      vec[i] = (seed / 0xffffffff) * 2 - 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}
