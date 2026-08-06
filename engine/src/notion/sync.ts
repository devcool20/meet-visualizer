import type { NotionApi, NotionPage } from './api.js';
import { paginateAll, getTitleText, getRichText, getNumber, getFileUrls } from './properties.js';
import type { ImageCache } from './image-cache.js';
import type { CardInferrer, NotionPageSummary } from './inference.js';
import type { Store, CardRecord } from '../db/types.js';

/**
 * Notion sync (plan §2.6).
 *
 * "Resync must not clobber user edits": when a Card already exists for a
 * given `sourceRef` (Notion page id) and its `phrasesEditedByUser` flag is
 * set, resync updates `spec`/`sourceRevision` but leaves `phrases` alone.
 * When `sourceRevision` (Notion's `last_edited_time`) hasn't changed, the
 * page is skipped entirely — cheap no-op on the common case.
 */
export class NotionSyncService {
  constructor(
    private notion: NotionApi,
    private imageCache: ImageCache,
    private inferrer: CardInferrer,
    private store: Store,
  ) {}

  async syncDataSource(userId: string, dataSourceId: string): Promise<{ created: number; updated: number; skipped: number }> {
    const pages = await paginateAll((cursor) => this.notion.queryDataSource(dataSourceId, cursor));
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const existingCards = await this.store.listCards(userId);
    const bySourceRef = new Map(existingCards.filter((c) => c.sourceRef).map((c) => [c.sourceRef as string, c]));

    for (const page of pages) {
      const existing = bySourceRef.get(page.id);
      if (existing && existing.sourceRevision === page.last_edited_time) {
        skipped++;
        continue;
      }

      const summary = await this.summarizePage(userId, page);
      const { spec, phrases } = await this.inferrer.infer(summary);

      if (existing) {
        const patch: Partial<CardRecord> = {
          spec,
          sourceRevision: page.last_edited_time,
          revision: existing.revision + 1,
        };
        if (!existing.phrasesEditedByUser) {
          patch.phrases = phrases; // only overwrite phrases if the user never touched them
        }
        await this.store.updateCard(userId, existing.id, patch);
        updated++;
      } else {
        await this.store.createCard(userId, {
          title: spec.title,
          spec,
          phrases,
          phrasesEditedByUser: false,
          embedding: null,
          status: 'draft', // human approval gate — plan §2.6
          approvedAt: null,
          enabled: true,
          source: 'notion',
          sourceRef: page.id,
          sourceRevision: page.last_edited_time,
          cooldownMs: 120_000,
        });
        created++;
      }
    }
    return { created, updated, skipped };
  }

  private async summarizePage(userId: string, page: NotionPage): Promise<NotionPageSummary> {
    const title = getTitleText(page, 'Title') || getTitleText(page, 'Name');
    const bodyText = getRichText(page, 'Body') || getRichText(page, 'Description');
    const numbers: Record<string, number> = {};
    for (const [propName, prop] of Object.entries(page.properties ?? {})) {
      if ((prop as any).type === 'number') {
        const n = getNumber(page, propName);
        if (n !== null) numbers[propName] = n;
      }
    }
    const rawImageUrls = getFileUrls(page, 'Image');
    const imageUrls: string[] = [];
    for (const [i, url] of rawImageUrls.entries()) {
      // Fetch once into durable storage NOW — Notion's signed URL expires
      // in ~1h (plan §2.6), so we must not persist the Notion URL itself.
      imageUrls.push(await this.imageCache.cacheImage(userId, url, `${page.id}-${i}`));
    }
    return { pageId: page.id, title, bodyText, numbers, imageUrls, lastEditedTime: page.last_edited_time };
  }
}
