import { describe, it, expect } from 'vitest';
import { MatchPipeline } from '../matching/pipeline.js';
import { Tier2Matcher } from '../matching/tier2.js';
import { MockTier3Confirmer } from '../matching/tier3.js';
import type { EmbeddingProvider } from '../matching/embedding-provider.js';
import { MemoryStore } from '../db/memory-store.js';
import { DEFAULT_USER_SETTINGS } from '@stash/card-spec';
import { makeCardInput, seedUser } from './helpers.js';

/** Deterministic fake: identical text -> identical vector, so we can control similarity precisely. */
class FixedVectorProvider implements EmbeddingProvider {
  constructor(private table: Record<string, number[]>, private fallback: number[] = [0, 0, 1]) {}
  async embed(text: string): Promise<number[]> {
    return this.table[text] ?? this.fallback;
  }
}

describe('MatchPipeline', () => {
  it('fires on a Tier-1 phrase match and applies cooldown to the same card', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-team', { phrases: ['our team'] }));

    const tier2 = new Tier2Matcher(new FixedVectorProvider({}));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const first = await pipeline.match('let me tell you about our team');
    expect(first.kind).toBe('fired');
    expect(first.cardId).toBe(card.id);
    expect(first.tier).toBe(1);

    const second = await pipeline.match('our team again');
    expect(second.kind).toBe('suppressed_cooldown');
  });

  it('suppresses a different card while one is already active (single-active-card)', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const cardA = await store.createCard('u1', makeCardInput('card-a', { phrases: ['revenue numbers'] }));
    const cardB = await store.createCard('u1', makeCardInput('card-b', { phrases: ['our team'] }));

    const tier2 = new Tier2Matcher(new FixedVectorProvider({}));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [cardA, cardB], DEFAULT_USER_SETTINGS);

    const first = await pipeline.match('the revenue numbers look great');
    expect(first.kind).toBe('fired');
    expect(first.cardId).toBe(cardA.id);

    const secondDifferentCard = await pipeline.match('let us talk about our team');
    expect(secondDifferentCard.kind).toBe('suppressed_cooldown');
    expect(secondDifferentCard.cardId).toBe(cardB.id);
  });

  it('escalates to Tier 2 when Tier 1 has no hit, and fires above tFire', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-1', { embedding: [1, 0, 0] }));

    const tier2 = new Tier2Matcher(new FixedVectorProvider({ 'the quarterly numbers are strong': [1, 0, 0] }));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const outcome = await pipeline.match('the quarterly numbers are strong');
    expect(outcome.kind).toBe('fired');
    expect(outcome.tier).toBe(2);
    expect(outcome.cardId).toBe(card.id);
  });

  it('drops (kind=none) when Tier 2 score is below tDrop', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-1', { embedding: [1, 0, 0] }));

    // Orthogonal vector -> cosine similarity 0, well under any tDrop.
    const tier2 = new Tier2Matcher(new FixedVectorProvider({ 'totally unrelated sentence': [0, 1, 0] }));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const outcome = await pipeline.match('totally unrelated sentence');
    expect(outcome.kind).toBe('none');
  });

  it('escalates the ambiguous [tDrop, tFire) band to Tier 3 and fires on confirmation', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-1', { embedding: [1, 0, 0] }));

    // balanced thresholds: tFire=0.84, tDrop=0.7. Construct a vector with
    // cosine similarity strictly between those two bounds.
    const angleRad = Math.acos(0.75);
    const ambiguousVec = [Math.cos(angleRad), Math.sin(angleRad), 0];
    const tier2 = new Tier2Matcher(new FixedVectorProvider({ 'ambiguous utterance': ambiguousVec }));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const outcome = await pipeline.match('ambiguous utterance');
    expect(outcome.tier).toBe(3);
    expect(outcome.kind).toBe('fired');
    expect(outcome.cardId).toBe(card.id);
  });

  it('never blocks the pipeline when Tier 2 times out — returns kind=none', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-1', { embedding: [1, 0, 0] }));

    class HangingProvider implements EmbeddingProvider {
      embed(): Promise<number[]> {
        return new Promise(() => {});
      }
    }
    const tier2 = new Tier2Matcher(new HangingProvider(), { timeoutMs: 20 });
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const outcome = await pipeline.match('anything at all');
    expect(outcome.kind).toBe('none');
  });

  it('peekTier1 never mutates cooldown/active-card state (used for prewarm only)', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-team', { phrases: ['our team'] }));

    const tier2 = new Tier2Matcher(new FixedVectorProvider({}));
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS);

    const peeked = pipeline.peekTier1('let me show our team');
    expect(peeked.kind).toBe('fired');

    // A real match() right after should NOT be suppressed by cooldown --
    // peekTier1 must not have consumed it.
    const real = await pipeline.match('let me show our team');
    expect(real.kind).toBe('fired');
  });

  it('rate-limits Tier 3 escalations and treats a rate-limited ambiguous match as near_miss', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const card = await store.createCard('u1', makeCardInput('card-1', { embedding: [1, 0, 0] }));

    const angleRad = Math.acos(0.75);
    const ambiguousVec = [Math.cos(angleRad), Math.sin(angleRad), 0];
    const tier2 = new Tier2Matcher(new FixedVectorProvider({ x: ambiguousVec }, ambiguousVec));
    // tier3RateLimit = 0 -> every ambiguous match is immediately rate-limited.
    const pipeline = new MatchPipeline(store, 'u1', tier2, new MockTier3Confirmer(), [card], DEFAULT_USER_SETTINGS, 0);

    const outcome = await pipeline.match('some ambiguous phrase');
    expect(outcome.kind).toBe('near_miss');
  });

  it('reloadCards drops disabled/draft cards from the phrase index', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const enabledCard = await store.createCard('u1', makeCardInput('card-enabled', { phrases: ['our team'] }));
    const disabledCard = await store.createCard(
      'u1',
      makeCardInput('card-disabled', { phrases: ['revenue numbers'], enabled: false }),
    );
    const draftCard = await store.createCard(
      'u1',
      makeCardInput('card-draft', { phrases: ['product health'], status: 'draft' }),
    );

    const tier2 = new Tier2Matcher(new FixedVectorProvider({}));
    const pipeline = new MatchPipeline(
      store,
      'u1',
      tier2,
      new MockTier3Confirmer(),
      [enabledCard, disabledCard, draftCard],
      DEFAULT_USER_SETTINGS,
    );

    expect((await pipeline.match('revenue numbers')).kind).toBe('none');
    expect((await pipeline.match('product health')).kind).toBe('none');
    expect((await pipeline.match('our team')).kind).toBe('fired');
  });
});
