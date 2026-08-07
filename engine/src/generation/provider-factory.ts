/**
 * Provider factory (plan §3.2).
 *
 * Resolves a key to a concrete GenerationProvider instance. Caches instances
 * in a small LRU keyed by (provider, model, apiKey prefix) so the same key
 * used across requests reuses the instance.
 */
import { LRUCache } from 'lru-cache';
import type { GenerationProvider, AiProviderId } from './provider.js';
import { GeminiGenerationProvider } from './gemini-provider.js';
import { OpenAiGenerationProvider } from './openai-provider.js';
import { AnthropicGenerationProvider } from './anthropic-provider.js';
import { MockGenerationProvider } from './mock-provider.js';
import type { ResolvedAiKey } from './ai-credentials.js';

const instanceCache = new LRUCache<string, GenerationProvider>({ max: 50 });

function cacheKey(key: ResolvedAiKey): string {
  return `${key.provider}:${key.model}:${key.apiKey.slice(0, 12)}`;
}

export function providerFactory(key: ResolvedAiKey): GenerationProvider {
  const ck = cacheKey(key);
  const existing = instanceCache.get(ck);
  if (existing) return existing;

  let provider: GenerationProvider;
  switch (key.provider) {
    case 'gemini':
      provider = new GeminiGenerationProvider(key.apiKey, key.model);
      break;
    case 'openai':
      provider = new OpenAiGenerationProvider(key.apiKey, key.model);
      break;
    case 'anthropic':
      provider = new AnthropicGenerationProvider(key.apiKey, key.model);
      break;
    case 'mock':
      provider = new MockGenerationProvider();
      break;
    default:
      throw new Error(`Unknown AI provider: ${key.provider}`);
  }

  instanceCache.set(ck, provider);
  return provider;
}
