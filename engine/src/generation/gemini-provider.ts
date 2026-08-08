/**
 * Gemini generation provider (plan §3.2).
 *
 * Uses `@google/genai` structured output with `responseJsonSchema`.
 * Injectable client so tests never hit the real API.
 */
import type { GenerationProvider, AiProviderId, StructuredRequest, StructuredResult } from './provider.js';
import { GenerationProviderError } from './provider.js';

/** Minimal shape we call on the genai client. */
export interface GenaiLike {
  models: {
    generateContent(config: {
      model: string;
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      config?: {
        responseMimeType?: string;
        responseJsonSchema?: Record<string, unknown>;
        maxOutputTokens?: number;
      };
    }): Promise<{ response?: { text?: () => string | null; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } }>;
  };
}

export class GeminiGenerationProvider implements GenerationProvider {
  readonly id: AiProviderId = 'gemini';
  readonly model: string;

  constructor(
    private apiKey: string,
    model: string,
    private deps?: { client?: GenaiLike },
  ) {
    this.model = model;
  }

  private getClient(): GenaiLike {
    if (this.deps?.client) return this.deps.client;
    // Lazy import so tests never need the real package resolved.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleGenAI } = require('@google/genai');
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    return client as GenaiLike;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const client = this.getClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const generatePromise = client.models.generateContent({
        model: this.model,
        contents: [
          { role: 'user', parts: [{ text: req.system }] },
          { role: 'user', parts: [{ text: req.user }] },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: req.schema as Record<string, unknown>,
          maxOutputTokens: req.maxOutputTokens,
        },
      });

      const abortPromise = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) {
          reject(new GenerationProviderError('Gemini request timed out', true));
          return;
        }
        controller.signal.addEventListener('abort', () => {
          reject(new GenerationProviderError('Gemini request timed out', true));
        });
      });

      const response: any = await Promise.race([generatePromise, abortPromise]);

      let raw: string | null = null;
      if (typeof response?.text === 'string') {
        raw = response.text;
      } else if (typeof response?.text === 'function') {
        raw = response.text();
      } else if (typeof response?.response?.text === 'string') {
        raw = response.response.text;
      } else if (typeof response?.response?.text === 'function') {
        raw = response.response.text();
      }

      if (!raw) {
        const candidates = response?.candidates || response?.response?.candidates;
        if (candidates?.length) {
          raw = candidates[0]?.content?.parts?.[0]?.text ?? null;
        }
      }

      if (!raw) throw new GenerationProviderError('Empty response from Gemini', false);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new GenerationProviderError(`Gemini returned non-JSON: ${raw.slice(0, 200)}`, true);
      }
      return { json: parsed, raw, provider: 'gemini', model: this.model };
    } catch (err: any) {
      if (err instanceof GenerationProviderError) throw err;
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new GenerationProviderError('Gemini request timed out', true);
      }
      const status = err?.status ?? 0;
      throw new GenerationProviderError(
        err?.message ?? 'Gemini request failed',
        status >= 500 || status === 429,
        status,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
