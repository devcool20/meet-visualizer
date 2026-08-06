import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../db/memory-store.js';
import { MatchPipeline } from '../matching/pipeline.js';
import { Tier2Matcher } from '../matching/tier2.js';
import { MockTier3Confirmer } from '../matching/tier3.js';
import { MockEmbeddingProvider } from '../matching/gemini-embedding.js';
import { DEFAULT_USER_SETTINGS } from '@stash/card-spec';
import { makeCardInput, seedUser } from './helpers.js';
import { PairingService, DeviceAuth } from '../auth/pairing.js';
import { CardsService } from '../services/cards.js';

/**
 * Cross-tenant isolation (plan §2.1 / §5.2): "user A's transcript must
 * never match user B's cards". Prisma's own connection is privileged and
 * bypasses Postgres RLS (documented in the schema/migration comments), so
 * the userId-scoping in the `Store` interface implementations — not RLS —
 * is the actual tenant boundary. This test asserts that boundary holds
 * across the store layer, the matching pipeline, and device pairing.
 */
describe('Cross-tenant isolation', () => {
  it('Tier 1: user A speaking user B’s exact trigger phrase never fires user B’s card', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');

    const cardB = await store.createCard('userB', makeCardInput('card-b-secret', { phrases: ['confidential roadmap'] }));

    // Pipeline instantiated for userA, but seeded with userB's card list --
    // this must never happen in real code (Session.handleHello only ever
    // calls store.listCards(result.userId, ...)), but we also assert the
    // store-level scoping independently below. Here we assert that even if
    // userA's pipeline is built from userA's OWN (empty) card list, userB's
    // phrase produces no match, proving no implicit cross-user data leak.
    const userACards = await store.listCards('userA', { enabledOnly: true });
    expect(userACards).toHaveLength(0);

    const tier2 = new Tier2Matcher(new MockEmbeddingProvider());
    const pipeline = new MatchPipeline(store, 'userA', tier2, new MockTier3Confirmer(), userACards, DEFAULT_USER_SETTINGS);

    const outcome = await pipeline.match('let us discuss the confidential roadmap now');
    expect(outcome.kind).not.toBe('fired');
    expect(outcome.cardId).not.toBe(cardB.id);
  });

  it('Tier 2: searchCardsByEmbedding for user A never returns user B’s cards, even with an identical embedding', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');

    const sharedEmbedding = [1, 0, 0];
    await store.createCard('userA', makeCardInput('card-a', { embedding: sharedEmbedding }));
    const cardB = await store.createCard('userB', makeCardInput('card-b', { embedding: sharedEmbedding }));

    const resultsForA = await store.searchCardsByEmbedding('userA', sharedEmbedding, 10);
    expect(resultsForA.map((r) => r.card.id)).not.toContain(cardB.id);
    expect(resultsForA.every((r) => r.card.userId === 'userA')).toBe(true);
  });

  it('Store-level CRUD: getCard/updateCard/deleteCard refuse to act across tenants', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');
    const cardB = await store.createCard('userB', makeCardInput('card-b'));

    // userA must not be able to read, mutate, or delete userB's card by id.
    expect(await store.getCard('userA', cardB.id)).toBeNull();
    await expect(store.updateCard('userA', cardB.id, { title: 'hijacked' })).rejects.toThrow();
    await store.deleteCard('userA', cardB.id); // must be a silent no-op, not a cross-tenant delete
    expect(await store.getCard('userB', cardB.id)).not.toBeNull();
  });

  it('CardsService: listing/getting scoped strictly per user even with colliding card ids across tenants', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const cardA = await cards.create('userA', {
      title: 'Shared-name card',
      spec: { v: 1, id: 'dup-id', revision: 1, title: 'Shared-name card', blocks: [{ kind: 'text', paragraphs: ['a'] }] },
      phrases: ['secret phrase A'],
      source: 'sample',
    });
    await cards.create('userB', {
      title: 'Shared-name card',
      spec: { v: 1, id: 'dup-id', revision: 1, title: 'Shared-name card', blocks: [{ kind: 'text', paragraphs: ['b'] }] },
      phrases: ['secret phrase B'],
      source: 'sample',
    });

    expect(await cards.get('userA', cardA.id)).not.toBeNull();
    const userAList = await cards.list('userA');
    expect(userAList).toHaveLength(1);
    expect(userAList[0].phrases).toEqual(['secret phrase A']);
  });

  it('Devices/pairing: a token minted for user A never authenticates as user B', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');

    const pairing = new PairingService(store);
    const { nonce } = await pairing.createNonce('userA');
    const { token } = (await pairing.pair(nonce, 'userA-device'))!;

    const auth = new DeviceAuth(store);
    const result = await auth.authenticate(token);
    expect(result!.userId).toBe('userA');
    expect(result!.userId).not.toBe('userB');
  });

  it('Connections (Notion OAuth): per-provider storage is scoped per user', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');

    await store.upsertConnection('userA', {
      provider: 'notion',
      accessToken: 'enc-a',
      refreshToken: null,
      tokenExpiresAt: null,
      workspaceId: 'ws-a',
      workspaceName: 'Workspace A',
      selectedSources: [],
      lastSyncedAt: null,
      syncError: null,
    });

    expect(await store.getConnection('userB', 'notion')).toBeNull();
    expect((await store.getConnection('userA', 'notion'))!.workspaceId).toBe('ws-a');
  });

  it('Activity events: listActivityEvents never crosses tenants', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'userA');
    await seedUser(store, 'userB');

    await store.recordActivityEvent({
      userId: 'userB',
      sessionId: 's1',
      kind: 'fired',
      cardId: 'card-b',
      score: 1,
      snippet: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 100_000),
    });

    expect(await store.listActivityEvents('userA')).toHaveLength(0);
  });
});
