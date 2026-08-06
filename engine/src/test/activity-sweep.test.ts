import { describe, it, expect } from 'vitest';
import { ActivitySnippetSweep } from '../services/activity-sweep.js';
import { MemoryStore } from '../db/memory-store.js';
import { seedUser } from './helpers.js';

describe('ActivitySnippetSweep', () => {
  it('nulls out only expired snippets, leaving the rest of the row intact', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const now = new Date('2026-01-02T00:00:00.000Z');

    const expired = await store.recordActivityEvent({
      userId: 'u1',
      sessionId: 's1',
      kind: 'near_miss',
      cardId: 'card-1',
      score: 0.75,
      snippet: 'sensitive transcript text',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-01-01T12:00:00.000Z'), // already expired relative to `now`
    });
    const notExpired = await store.recordActivityEvent({
      userId: 'u1',
      sessionId: 's1',
      kind: 'near_miss',
      cardId: 'card-2',
      score: 0.8,
      snippet: 'still-fresh snippet',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-01-03T00:00:00.000Z'), // not expired yet
    });

    const sweep = new ActivitySnippetSweep(store);
    const count = await sweep.runOnce(now);
    expect(count).toBe(1);

    const events = await store.listActivityEvents('u1');
    const expiredAfter = events.find((e) => e.id === expired.id)!;
    const freshAfter = events.find((e) => e.id === notExpired.id)!;
    expect(expiredAfter.snippet).toBeNull();
    expect(expiredAfter.cardId).toBe('card-1'); // rest of the row retained
    expect(freshAfter.snippet).toBe('still-fresh snippet');
  });

  it('is a no-op when there are no expired snippets', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const sweep = new ActivitySnippetSweep(store);
    expect(await sweep.runOnce(new Date('2020-01-01T00:00:00.000Z'))).toBe(0);
  });
});
