import { describe, it, expect, vi } from 'vitest';
import { Tier2Matcher } from '../matching/tier2.js';
import type { EmbeddingProvider } from '../matching/embedding-provider.js';
import { MemoryStore } from '../db/memory-store.js';
import type { CardRecord } from '../db/types.js';
import { assertCardSpec } from '@stash/card-spec';

function makeCardInput(id: string, embedding: number[]): Omit<CardRecord, 'id' | 'userId' | 'revision'> {
  return {
    title: id,
    spec: assertCardSpec({ v: 1, id, revision: 1, title: id, blocks: [{ kind: 'text', paragraphs: ['x'] }] }),
    phrases: [],
    phrasesEditedByUser: false,
    embedding,
    status: 'approved',
    approvedAt: new Date(),
    enabled: true,
    source: 'sample',
    sourceRef: null,
    sourceRevision: null,
    cooldownMs: 120_000,
  };
}

class InstantProvider implements EmbeddingProvider {
  calls = 0;
  constructor(private vectorFor: (text: string) => number[]) {}
  async embed(text: string): Promise<number[]> {
    this.calls++;
    return this.vectorFor(text);
  }
}

class NeverResolvesProvider implements EmbeddingProvider {
  embed(_text: string): Promise<number[]> {
    return new Promise(() => {
      /* never resolves — simulates a hung network call */
    });
  }
}

class ThrowingProvider implements EmbeddingProvider {
  async embed(_text: string): Promise<number[]> {
    throw new Error('boom');
  }
}

describe('Tier2Matcher', () => {
  it('returns cosine-ranked results scoped to the user', async () => {
    const store = new MemoryStore();
    await store.createUser({ id: 'u1', email: 'u1@test', settings: {} as any });
    const card = await store.createCard('u1', makeCardInput('card-1', [1, 0, 0]));

    const provider = new InstantProvider(() => [1, 0, 0]);
    const matcher = new Tier2Matcher(provider, { timeoutMs: 1000 });

    const outcome = await matcher.match(store, 'u1', 'some utterance', 3);
    expect(outcome.results).not.toBeNull();
    expect(outcome.results![0].card.id).toBe(card.id);
    expect(outcome.results![0].score).toBeCloseTo(1, 5);
  });

  it('caches embeddings for the same normalized text (LRU)', async () => {
    const store = new MemoryStore();
    await store.createUser({ id: 'u1', email: 'u1@test', settings: {} as any });
    const provider = new InstantProvider(() => [1, 0, 0]);
    const matcher = new Tier2Matcher(provider, { timeoutMs: 1000 });

    await matcher.match(store, 'u1', 'Our Team!!', 3);
    await matcher.match(store, 'u1', 'our team', 3); // same after normalization
    expect(provider.calls).toBe(1);
    expect(matcher.cacheSize()).toBe(1);
  });

  it('returns null results (never throws) when the embed call exceeds the timeout budget', async () => {
    const store = new MemoryStore();
    await store.createUser({ id: 'u1', email: 'u1@test', settings: {} as any });
    const matcher = new Tier2Matcher(new NeverResolvesProvider(), { timeoutMs: 20 });

    const outcome = await matcher.match(store, 'u1', 'anything', 3);
    expect(outcome.results).toBeNull();
    expect(outcome.fromCache).toBe(false);
  });

  it('returns null results (never throws) when the provider throws', async () => {
    const store = new MemoryStore();
    await store.createUser({ id: 'u1', email: 'u1@test', settings: {} as any });
    const matcher = new Tier2Matcher(new ThrowingProvider(), { timeoutMs: 1000 });

    const outcome = await matcher.match(store, 'u1', 'anything', 3);
    expect(outcome.results).toBeNull();
  });

  it('returns an empty (not null) result for an empty/whitespace-only utterance without embedding', async () => {
    const store = new MemoryStore();
    const provider = new InstantProvider(() => [1, 0, 0]);
    const matcher = new Tier2Matcher(provider, { timeoutMs: 1000 });

    const outcome = await matcher.match(store, 'u1', '   ', 3);
    expect(outcome.results).toEqual([]);
    expect(provider.calls).toBe(0);
  });
});
