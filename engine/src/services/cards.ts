import type { Store, CardRecord } from '../db/types.js';
import { SAMPLE_CARDS } from '@stash/card-core';
import { assertCardSpec } from '@stash/card-spec';
import { pubSubService } from '../services/pubsub.js';

/**
 * Cards CRUD, scoped to the authenticated user (deliverable 3).
 *
 * - New signups get `SAMPLE_CARDS` seeded (plan §4.2 step 3 / deliverable 3).
 * - `status` draft|approved: Notion-inferred cards land as 'draft' and need
 *   human approval (plan §2.6); manually authored/edited cards are
 *   'approved' immediately.
 * - `revision` bumps on every edit so connected sessions know to drop cached
 *   raster (plan §2.3) — cache invalidation (deliverable 8) publishes this.
 * - `phrasesEditedByUser` guards against resync clobbering user-edited
 *   phrases (plan §2.6) — set whenever a human edits `phrases` directly.
 */
export class CardsService {
  constructor(private store: Store) {}

  async seedSampleCards(userId: string): Promise<CardRecord[]> {
    const created: CardRecord[] = [];
    for (const sample of SAMPLE_CARDS) {
      const card = await this.store.createCard(userId, {
        title: sample.spec.title,
        spec: sample.spec,
        phrases: sample.phrases,
        phrasesEditedByUser: false,
        embedding: null,
        status: 'approved',
        approvedAt: new Date(),
        enabled: true,
        source: 'sample',
        sourceRef: sample.spec.id,
        sourceRevision: null,
        cooldownMs: 120_000,
      });
      created.push(card);
    }
    return created;
  }

  async list(userId: string, opts?: { enabledOnly?: boolean; status?: 'draft' | 'approved' }): Promise<CardRecord[]> {
    return this.store.listCards(userId, opts);
  }

  async get(userId: string, cardId: string): Promise<CardRecord | null> {
    return this.store.getCard(userId, cardId);
  }

  async create(
    userId: string,
    input: {
      title: string;
      spec: unknown;
      phrases: string[];
      status?: 'draft' | 'approved';
      source: 'sample' | 'notion';
      sourceRef?: string | null;
      sourceRevision?: string | null;
      cooldownMs?: number;
    },
  ): Promise<CardRecord> {
    const spec = assertCardSpec(input.spec); // validated before it can ever reach a client render loop
    return this.store.createCard(userId, {
      title: input.title,
      spec,
      phrases: input.phrases,
      phrasesEditedByUser: false,
      embedding: null,
      status: input.status ?? 'approved',
      approvedAt: input.status === 'draft' ? null : new Date(),
      enabled: true,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      sourceRevision: input.sourceRevision ?? null,
      cooldownMs: input.cooldownMs ?? 120_000,
    });
  }

  /**
   * Human edit path. Bumps `revision`, publishes invalidation, and — if the
   * edit touches `phrases` — sets `phrasesEditedByUser` so a later Notion
   * resync will not clobber it (plan §2.6).
   */
  async update(
    userId: string,
    cardId: string,
    patch: Partial<Pick<CardRecord, 'title' | 'spec' | 'phrases' | 'enabled' | 'cooldownMs' | 'status'>>,
  ): Promise<CardRecord> {
    const existing = await this.store.getCard(userId, cardId);
    if (!existing) throw new Error('Card not found');

    const fullPatch: Partial<CardRecord> = { ...patch, revision: existing.revision + 1 };
    if (patch.spec !== undefined) fullPatch.spec = assertCardSpec(patch.spec);
    if (patch.phrases !== undefined) fullPatch.phrasesEditedByUser = true;
    if (patch.status === 'approved' && existing.status === 'draft') fullPatch.approvedAt = new Date();

    const updated = await this.store.updateCard(userId, cardId, fullPatch);
    await pubSubService.publishInvalidation({ userId, cardIds: [cardId] });
    return updated;
  }

  async approveDraft(userId: string, cardId: string): Promise<CardRecord> {
    return this.update(userId, cardId, { status: 'approved' });
  }

  async delete(userId: string, cardId: string): Promise<void> {
    await this.store.deleteCard(userId, cardId);
    await pubSubService.publishInvalidation({ userId, cardIds: [cardId] });
  }
}
