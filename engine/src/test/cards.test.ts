import { describe, it, expect } from 'vitest';
import { CardsService } from '../services/cards.js';
import { MemoryStore } from '../db/memory-store.js';
import { pubSubService } from '../services/pubsub.js';
import { seedUser } from './helpers.js';

describe('CardsService', () => {
  it('seedSampleCards creates the sample cards as approved', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const cards = new CardsService(store);
    const created = await cards.seedSampleCards('u1');
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((c) => c.status === 'approved')).toBe(true);
    expect(created.every((c) => c.userId === 'u1')).toBe(true);
  });

  it('create() validates the CardSpec via assertCardSpec and rejects an invalid one', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    await expect(
      cards.create('u1', {
        title: 'bad card',
        spec: { v: 1, id: 'x', revision: 1, title: 'x', blocks: [] }, // blocks.min(1) violated
        phrases: [],
        source: 'sample',
      }),
    ).rejects.toThrow();
  });

  it('create() accepts a valid spec and defaults status to approved', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Good Card',
      spec: { v: 1, id: 'good', revision: 1, title: 'Good Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: ['good card'],
      source: 'sample',
    });
    expect(card.status).toBe('approved');
    expect(card.approvedAt).not.toBeNull();
  });

  it('create() with status=draft leaves approvedAt null', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Draft Card',
      spec: { v: 1, id: 'draft', revision: 1, title: 'Draft Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'notion',
      status: 'draft',
    });
    expect(card.status).toBe('draft');
    expect(card.approvedAt).toBeNull();
  });

  it('update() bumps revision on every edit', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Card',
      spec: { v: 1, id: 'c1', revision: 1, title: 'Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'sample',
    });
    const updated = await cards.update('u1', card.id, { title: 'New Title' });
    expect(updated.revision).toBe(card.revision + 1);
  });

  it('update() sets phrasesEditedByUser=true only when the patch touches phrases', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Card',
      spec: { v: 1, id: 'c1', revision: 1, title: 'Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: ['original'],
      source: 'notion',
    });
    expect(card.phrasesEditedByUser).toBe(false);

    const titleOnlyUpdate = await cards.update('u1', card.id, { title: 'Renamed' });
    expect(titleOnlyUpdate.phrasesEditedByUser).toBe(false);

    const phraseUpdate = await cards.update('u1', card.id, { phrases: ['custom phrase'] });
    expect(phraseUpdate.phrasesEditedByUser).toBe(true);
  });

  it('update() sets approvedAt when transitioning draft -> approved', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Card',
      spec: { v: 1, id: 'c1', revision: 1, title: 'Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'notion',
      status: 'draft',
    });
    expect(card.approvedAt).toBeNull();
    const approved = await cards.approveDraft('u1', card.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).not.toBeNull();
  });

  it('update() publishes a cache-invalidation event scoped to the user and card', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Card',
      spec: { v: 1, id: 'c1', revision: 1, title: 'Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'sample',
    });

    const received: any[] = [];
    const unsubscribe = pubSubService.subscribeInvalidation('u1', (msg) => received.push(msg));
    try {
      await cards.update('u1', card.id, { title: 'Renamed' });
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ userId: 'u1', cardIds: [card.id] });
    } finally {
      unsubscribe();
    }
  });

  it('delete() removes the card and publishes invalidation', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    const card = await cards.create('u1', {
      title: 'Card',
      spec: { v: 1, id: 'c1', revision: 1, title: 'Card', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'sample',
    });

    const received: any[] = [];
    const unsubscribe = pubSubService.subscribeInvalidation('u1', (msg) => received.push(msg));
    try {
      await cards.delete('u1', card.id);
      expect(await store.getCard('u1', card.id)).toBeNull();
      expect(received).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  it('list()/get() are scoped to the requesting user', async () => {
    const store = new MemoryStore();
    const cards = new CardsService(store);
    await cards.create('u1', {
      title: 'Card A',
      spec: { v: 1, id: 'a', revision: 1, title: 'Card A', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'sample',
    });
    const cardB = await cards.create('u2', {
      title: 'Card B',
      spec: { v: 1, id: 'b', revision: 1, title: 'Card B', blocks: [{ kind: 'text', paragraphs: ['hi'] }] },
      phrases: [],
      source: 'sample',
    });

    expect(await cards.get('u1', cardB.id)).toBeNull();
    const u1Cards = await cards.list('u1');
    expect(u1Cards.map((c) => c.title)).toEqual(['Card A']);
  });
});
