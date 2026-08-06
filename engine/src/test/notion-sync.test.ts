import { describe, it, expect } from 'vitest';
import { NotionSyncService } from '../notion/sync.js';
import { RigidSchemaCardInferrer } from '../notion/inference.js';
import { MockImageCache } from '../notion/image-cache.js';
import { MemoryStore } from '../db/memory-store.js';
import type { NotionApi, NotionPage, NotionQueryResult } from '../notion/api.js';
import { seedUser } from './helpers.js';

class FakeNotionApi implements NotionApi {
  constructor(private pagesByDataSource: Record<string, NotionPage[]>) {}
  async queryDataSource(dataSourceId: string): Promise<NotionQueryResult> {
    return { results: this.pagesByDataSource[dataSourceId] ?? [], has_more: false, next_cursor: null };
  }
}

function titlePage(id: string, title: string, lastEditedTime: string, body = ''): NotionPage {
  return {
    id,
    last_edited_time: lastEditedTime,
    properties: {
      Title: { type: 'title', title: [{ plain_text: title }] },
      Body: { type: 'rich_text', rich_text: body ? [{ plain_text: body }] : [] },
    },
  };
}

describe('NotionSyncService', () => {
  it('creates new cards as status=draft for previously unseen pages', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const api = new FakeNotionApi({ ds1: [titlePage('page-1', 'Q3 Roadmap', '2026-01-01T00:00:00.000Z')] });
    const sync = new NotionSyncService(api, new MockImageCache(), new RigidSchemaCardInferrer(), store);

    const result = await sync.syncDataSource('u1', 'ds1');
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });

    const cards = await store.listCards('u1');
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('draft'); // human approval gate
    expect(cards[0].sourceRef).toBe('page-1');
  });

  it('skips a page whose sourceRevision (last_edited_time) is unchanged', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const api = new FakeNotionApi({ ds1: [titlePage('page-1', 'Q3 Roadmap', '2026-01-01T00:00:00.000Z')] });
    const sync = new NotionSyncService(api, new MockImageCache(), new RigidSchemaCardInferrer(), store);

    await sync.syncDataSource('u1', 'ds1');
    const secondRun = await sync.syncDataSource('u1', 'ds1'); // same last_edited_time
    expect(secondRun).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('updates spec on resync when last_edited_time changed, but does NOT clobber user-edited phrases', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const api = new FakeNotionApi({
      ds1: [titlePage('page-1', 'Q3 Roadmap', '2026-01-01T00:00:00.000Z', 'original body')],
    });
    const sync = new NotionSyncService(api, new MockImageCache(), new RigidSchemaCardInferrer(), store);
    await sync.syncDataSource('u1', 'ds1');

    const cards = await store.listCards('u1');
    const cardId = cards[0].id;

    // Simulate the human editing phrases directly (as CardsService.update would).
    await store.updateCard('u1', cardId, { phrases: ['my custom phrase'], phrasesEditedByUser: true });

    // Notion page changes (new last_edited_time, new body) -> resync.
    const api2 = new FakeNotionApi({
      ds1: [titlePage('page-1', 'Q3 Roadmap', '2026-02-01T00:00:00.000Z', 'updated body')],
    });
    const sync2 = new NotionSyncService(api2, new MockImageCache(), new RigidSchemaCardInferrer(), store);
    const result = await sync2.syncDataSource('u1', 'ds1');
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });

    const updated = await store.getCard('u1', cardId);
    expect(updated!.phrases).toEqual(['my custom phrase']); // untouched
    expect(updated!.sourceRevision).toBe('2026-02-01T00:00:00.000Z'); // spec/revision DID update
    expect(updated!.revision).toBeGreaterThan(cards[0].revision);
  });

  it('DOES overwrite phrases on resync when the user never edited them', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const api = new FakeNotionApi({ ds1: [titlePage('page-1', 'Old Title', '2026-01-01T00:00:00.000Z')] });
    const sync = new NotionSyncService(api, new MockImageCache(), new RigidSchemaCardInferrer(), store);
    await sync.syncDataSource('u1', 'ds1');

    const api2 = new FakeNotionApi({ ds1: [titlePage('page-1', 'New Title', '2026-02-01T00:00:00.000Z')] });
    const sync2 = new NotionSyncService(api2, new MockImageCache(), new RigidSchemaCardInferrer(), store);
    await sync2.syncDataSource('u1', 'ds1');

    const cards = await store.listCards('u1');
    expect(cards[0].phrases).toEqual(['new title']); // RigidSchemaCardInferrer derives phrase from title
  });

  it('fetches page image files into the image cache exactly once per page', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pageWithImage: NotionPage = {
      id: 'page-img',
      last_edited_time: '2026-01-01T00:00:00.000Z',
      properties: {
        Title: { type: 'title', title: [{ plain_text: 'Card with image' }] },
        Image: { type: 'files', files: [{ type: 'external', external: { url: 'https://notion.example/signed.png' } }] },
      },
    };
    const api = new FakeNotionApi({ ds1: [pageWithImage] });
    const imageCache = new MockImageCache();
    const sync = new NotionSyncService(api, imageCache, new RigidSchemaCardInferrer(), store);
    await sync.syncDataSource('u1', 'ds1');

    expect(imageCache.cached.size).toBe(1);
    const cards = await store.listCards('u1');
    const imageBlock = cards[0].spec.blocks.find((b) => b.kind === 'image');
    expect(imageBlock).toBeDefined();
    // The stored CardSpec must reference the cached CDN url, never the raw signed Notion url.
    expect((imageBlock as any).url).toContain('cdn.stash.local');
  });
});
