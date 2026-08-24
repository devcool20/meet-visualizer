/**
 * Generation provider boundary (plan §3.2).
 *
 * Every external AI call sits behind this injectable interface so tests
 * never hit a real API (constraint: "tests must pass with no network access
 * and no real API keys"). The four implementations — Gemini, OpenAI,
 * Anthropic, Mock — follow the same interface+Real/Mock pattern as
 * `engine/src/matching/embedding-provider.ts`.
 */
export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'bedrock' | 'mock';

export interface StructuredRequest {
  system: string;
  user: string;
  /** JSON Schema (draft-07 subset: object/array/string/number/boolean/enum, additionalProperties:false). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface StructuredResult {
  json: unknown; // parsed
  raw: string; // for the repair prompt
  provider: AiProviderId;
  model: string;
}

export interface GenerationProvider {
  readonly id: AiProviderId;
  readonly model: string;
  generateStructured(req: StructuredRequest): Promise<StructuredResult>;
}

export class GenerationTimeoutError extends Error {
  constructor() {
    super('Generation call exceeded the timeout budget');
    this.name = 'GenerationTimeoutError';
  }
}

export class GenerationProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GenerationProviderError';
  }
}

/** Wraps any provider with a timeout. Mirrors `matching/embedding-provider.ts` `withTimeout`. */
export function withGenerationTimeout(
  provider: GenerationProvider,
  timeoutMs: number,
): GenerationProvider {
  return {
    get id() {
      return provider.id;
    },
    get model() {
      return provider.model;
    },
    async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
      let timer: NodeJS.Timeout;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new GenerationTimeoutError()), timeoutMs);
      });
      try {
        return await Promise.race([provider.generateStructured(req), timeout]);
      } finally {
        clearTimeout(timer!);
      }
    },
  };
}
