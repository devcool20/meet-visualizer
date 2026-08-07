/**
 * Card generator orchestrator (plan §3.8).
 *
 * Flow: cache → rate limit → key resolution → grounding → provider →
 * repair → assemble → image → result.
 * Never throws — all failures map to GenerateOutcome.
 */
import { parseCardSpec } from '@stash/card-spec';
import type { CardSpec } from '@stash/card-spec';
import type { ICache } from '../services/cache.js';
import { userKey } from '../services/cache.js';
import { RateLimiter } from '../util/rate-limiter.js';
import { config } from '../config.js';
import type { AiKeyResolver, ResolvedAiKey } from './ai-credentials.js';
import type { GenerationProvider } from './provider.js';
import { withGenerationTimeout } from './provider.js';
import { providerFactory } from './provider-factory.js';
import type { GroundingProvider } from './grounding.js';
import { extractSearchQuery } from './grounding.js';
import type { ImageResolver } from '../images/image-fetcher.js';
import { generatedDraftSchema, type GeneratedDraft } from './draft-schema.js';
import { buildSystemPrompt, buildUserPrompt, buildRepairPrompt } from './prompt.js';
import { assembleCardSpec, type AssembleContext } from './assemble.js';
import { buildDraftJsonSchema } from './draft-schema.js';

export type GenerateOutcome =
  | {
      kind: 'card';
      card: CardSpec;
      fromCache: boolean;
      provider: string;
      model: string;
      grounded: boolean;
    }
  | { kind: 'failed'; code: 'empty' | 'no_provider' | 'timeout' | 'invalid_output' | 'rate_limited' | 'internal'; message: string };

export interface CardGeneratorDeps {
  keyResolver: AiKeyResolver;
  providerFactory?: (key: ResolvedAiKey) => GenerationProvider;
  grounding: GroundingProvider;
  images: ImageResolver;
  cache: ICache;
  clock?: () => number;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export class CardGenerator {
  private rateLimiterPerMinute = new RateLimiter(config.generationRateLimitPerMinute, 60_000);
  private rateLimiterPerHour = new RateLimiter(config.generationRateLimitPerHour, 3_600_000);

  constructor(private deps: CardGeneratorDeps) {}

  async generate(
    userId: string,
    utterance: string,
    opts: { autoDismissMs: number },
  ): Promise<GenerateOutcome> {
    const start = this.now();
    const deadline = start + config.generationTotalBudgetMs;

    try {
      // 1. Normalize and check minimum length
      const norm = normalize(utterance);
      const tokens = norm.split(/\s+/).filter(Boolean);
      if (tokens.length < 3) {
        return { kind: 'failed', code: 'empty', message: 'Utterance too short (minimum 3 tokens)' };
      }

      // 2. Cache check
      const hash = normalize(utterance);
      const cacheKey = userKey(userId, 'gen', hash);
      const cached = await this.deps.cache.get(cacheKey);
      if (cached) {
        const spec = JSON.parse(cached);
        const parsed = parseCardSpec(spec);
        if (parsed.ok) {
          console.log(`[CardGenerator] cache hit for user ${userId}`);
          return { kind: 'card', card: parsed.value, fromCache: true, provider: 'cache', model: 'cache', grounded: true };
        }
      }

      // 3. Rate limit
      if (!this.rateLimiterPerMinute.tryConsume(userId, this.now())) {
        return { kind: 'failed', code: 'rate_limited', message: 'Too many generations per minute (max 6)' };
      }
      if (!this.rateLimiterPerHour.tryConsume(userId, this.now())) {
        return { kind: 'failed', code: 'rate_limited', message: 'Too many generations per hour (max 40)' };
      }

      // 4. Key resolution
      const key = await this.deps.keyResolver.resolve(userId);
      if (!key) {
        return { kind: 'failed', code: 'no_provider', message: 'No AI provider configured. Add a key in Settings.' };
      }

      // 5. Grounding
      const searchQuery = extractSearchQuery(utterance);
      const groundingBudget = Math.min(config.groundingTimeoutMs, deadline - this.now());
      const candidates = await this.deps.grounding.search(searchQuery, 3, groundingBudget);

      // 6. Provider call
      const provider = (this.deps.providerFactory ?? providerFactory)(key);
      const timedProvider = withGenerationTimeout(provider, config.generationProviderTimeoutMs);

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(utterance, candidates);
      const schema = buildDraftJsonSchema();
      const schemaName = 'generated_card';

      let result: GeneratedDraft;
      let raw: string;
      let currentProvider: string;
      let currentModel: string;

      try {
        const genResult = await timedProvider.generateStructured({
          system: systemPrompt,
          user: userPrompt,
          schema,
          schemaName,
          maxOutputTokens: config.generationMaxOutputTokens,
          timeoutMs: config.generationProviderTimeoutMs,
        });
        raw = genResult.raw;
        currentProvider = genResult.provider;
        currentModel = genResult.model;

        const parsed = generatedDraftSchema.safeParse(genResult.json);
        if (!parsed.success) {
          // 7. One repair attempt if budget allows
          const remaining = deadline - this.now();
          if (remaining >= 1500) {
            const repairPrompt = buildRepairPrompt(raw, parsed.error.message);
            const repairResult = await timedProvider.generateStructured({
              system: systemPrompt,
              user: repairPrompt,
              schema,
              schemaName,
              maxOutputTokens: config.generationMaxOutputTokens,
              timeoutMs: Math.min(config.generationProviderTimeoutMs, remaining),
            });
            currentProvider = repairResult.provider;
            currentModel = repairResult.model;
            const reparsed = generatedDraftSchema.safeParse(repairResult.json);
            if (!reparsed.success) {
              return { kind: 'failed', code: 'invalid_output', message: 'Model output failed validation after repair attempt' };
            }
            result = reparsed.data;
          } else {
            return { kind: 'failed', code: 'invalid_output', message: 'Model output failed validation' };
          }
        } else {
          result = parsed.data;
        }
      } catch (providerErr: any) {
        if (providerErr?.name === 'GenerationTimeoutError') {
          return { kind: 'failed', code: 'timeout', message: 'Provider request timed out' };
        }
        const retryable = providerErr?.retryable;
        return {
          kind: 'failed',
          code: retryable ? 'timeout' : 'internal',
          message: providerErr?.message ?? 'Provider request failed',
        };
      }

      // Check relevant
      if (!result.relevant) {
        return { kind: 'failed', code: 'empty', message: 'Topic not relevant enough for a card' };
      }

      // 8. Image resolution
      let imageUrl: string | null = null;
      if (result.imageWanted && candidates.length > 0) {
        const targetCandidate = result.sourceIndex !== null ? candidates[result.sourceIndex] : candidates[0];
        if (targetCandidate?.imageUrl) {
          const imageBudget = Math.min(config.imageVerifyTimeoutMs, deadline - this.now());
          imageUrl = await this.deps.images.resolve(targetCandidate.imageUrl, imageBudget);
        }
      }

      // 9. Assembly
      const ctx: AssembleContext = {
        utterance,
        candidates,
        imageUrl,
        autoDismissMs: opts.autoDismissMs,
      };
      const assembled = assembleCardSpec(result, ctx);
      if (!assembled.ok) {
        return { kind: 'failed', code: 'invalid_output', message: `Assembly failed: ${assembled.error}` };
      }

      // 10. Cache
      await this.deps.cache.set(cacheKey, JSON.stringify(assembled.value), config.generationCacheTtlSeconds);

      const grounded = candidates.length > 0;
      console.log(
        `[CardGenerator] generated card for user ${userId} | provider=${currentProvider} | model=${currentModel} | grounded=${grounded} | ms=${this.now() - start}`,
      );

      return {
        kind: 'card',
        card: assembled.value,
        fromCache: false,
        provider: currentProvider,
        model: currentModel,
        grounded,
      };
    } catch (err: any) {
      console.error('[CardGenerator] unexpected error:', err);
      return { kind: 'failed', code: 'internal', message: 'An unexpected error occurred' };
    }
  }

  private now(): number {
    return this.deps.clock ? this.deps.clock() : Date.now();
  }
}
