import { describe, it, expect } from 'vitest';
import { CardGenerator } from '../generation/card-generator.js';
import { MockGroundingProvider } from '../generation/grounding.js';
import { MockGenerationProvider } from '../generation/mock-provider.js';
import { MockImageFetcher, createImageByteCache, ProxyImageResolver } from '../images/image-fetcher.js';
import { MemoryStore } from '../db/memory-store.js';
import { AesGcmEncryptor } from '../util/encryption.js';
import { AiKeyResolver } from '../generation/ai-credentials.js';
import { DriveDocsAggregator } from '../drive/aggregator.js';
import { DriveGroundingProvider, CompositeGroundingProvider } from '../drive/grounding.js';
import type { ICache } from '../services/cache.js';

class TestCache implements ICache {
  private store = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
  async flush(): Promise<void> {
    this.store.clear();
  }
}

describe('CardGenerator with AI providers and Drive grounding', () => {
  async function setupGenerator(mockFailMode?: 'timeout' | 'garbage' | 'http') {
    const store = new MemoryStore();
    const encryptor = new AesGcmEncryptor(Buffer.alloc(32, 1).toString('base64'));
    const keyResolver = new AiKeyResolver(store, encryptor);
    // Seed a per-user credential so key resolution exercises the real
    // "user key" path instead of depending on env-key/mock fallbacks.
    await store.upsertAiCredential('demo-user', {
      provider: 'mock',
      apiKey: encryptor.encrypt('test-key-0123456789'),
      model: 'mock-model/v0',
    });
    const driveAggregator = new DriveDocsAggregator();
    const driveGrounding = new DriveGroundingProvider(driveAggregator);
    const mockWiki = new MockGroundingProvider();
    const compositeGrounding = new CompositeGroundingProvider(driveGrounding, mockWiki);

    const imageFetcher = new MockImageFetcher();
    const imageCache = createImageByteCache();
    const images = new ProxyImageResolver(imageFetcher, imageCache, 'http://localhost:3001');
    const cache = new TestCache();

    const generator = new CardGenerator({
      keyResolver,
      providerFactory: () => new MockGenerationProvider({ failMode: mockFailMode }),
      grounding: compositeGrounding,
      images,
      cache,
    });

    return { generator, store, driveAggregator };
  }

  it('rejects utterances shorter than 3 tokens', async () => {
    const { generator } = await setupGenerator();
    const result = await generator.generate('user-1', 'hi there', { autoDismissMs: 15000 });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('empty');
    }
  });

  it('generates a complete CardSpec for valid utterance with Drive grounding', async () => {
    const { generator } = await setupGenerator();
    const result = await generator.generate('demo-user', 'What is our YC pitch ARR and metrics?', {
      autoDismissMs: 15000,
    });

    expect(result.kind).toBe('card');
    if (result.kind === 'card') {
      expect(result.card.id).toMatch(/^gen_/);
      expect(result.card.title).toBeDefined();
      expect(result.card.blocks.length).toBeGreaterThan(0);
      expect(result.fromCache).toBe(false);
      expect(result.provider).toBe('mock');
    }
  });

  it('serves subsequent identical generation from cache', async () => {
    const { generator } = await setupGenerator();
    const utterance = 'Tell me about the executive leadership team';
    const first = await generator.generate('demo-user', utterance, { autoDismissMs: 15000 });
    expect(first.kind).toBe('card');

    const second = await generator.generate('demo-user', utterance, { autoDismissMs: 15000 });
    expect(second.kind).toBe('card');
    if (second.kind === 'card') {
      expect(second.fromCache).toBe(true);
      expect(second.provider).toBe('cache');
    }
  });

  it('handles provider timeout gracefully', async () => {
    const { generator } = await setupGenerator('timeout');
    const result = await generator.generate('demo-user', 'Explain quantum computing architecture in detail', {
      autoDismissMs: 15000,
    });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.code).toBe('timeout');
    }
  });
});
