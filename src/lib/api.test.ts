import { describe, it, expect, beforeEach } from 'vitest';
import { SAMPLE_CARDS } from '@stash/card-core';
import { MockApiClient, ApiError } from './api';

describe('MockApiClient (card library fixtures)', () => {
  let client: MockApiClient;

  beforeEach(() => {
    client = new MockApiClient();
  });

  it('is not seeded until bootstrap() is called', async () => {
    expect(await client.listCards()).toEqual([]);
  });

  it('seeds exactly the SAMPLE_CARDS fixtures as approved, enabled cards on first bootstrap', async () => {
    const { seeded } = await client.bootstrap();
    expect(seeded).toBe(true);

    const cards = await client.listCards();
    expect(cards).toHaveLength(SAMPLE_CARDS.length);
    for (const card of cards) {
      expect(card.status).toBe('approved');
      expect(card.enabled).toBe(true);
      expect(card.source).toBe('sample');
    }
    const titles = cards.map((c) => c.title).sort();
    const expectedTitles = SAMPLE_CARDS.map((s) => s.spec.title).sort();
    expect(titles).toEqual(expectedTitles);
  });

  it('is idempotent: a second bootstrap() does not reseed or duplicate cards', async () => {
    await client.bootstrap();
    const { seeded: seededAgain } = await client.bootstrap();
    expect(seededAgain).toBe(false);
    expect(await client.listCards()).toHaveLength(SAMPLE_CARDS.length);
  });

  it('filters listCards by status and enabledOnly', async () => {
    await client.bootstrap();
    const [first] = await client.listCards();
    await client.updateCard(first.id, { enabled: false });

    const enabledOnly = await client.listCards({ enabledOnly: true });
    expect(enabledOnly.find((c) => c.id === first.id)).toBeUndefined();
    expect(enabledOnly).toHaveLength(SAMPLE_CARDS.length - 1);

    const approvedOnly = await client.listCards({ status: 'approved' });
    expect(approvedOnly).toHaveLength(SAMPLE_CARDS.length);

    const draftOnly = await client.listCards({ status: 'draft' });
    expect(draftOnly).toHaveLength(0);
  });

  it('updateCard bumps the revision and marks phrasesEditedByUser when phrases change', async () => {
    await client.bootstrap();
    const [card] = await client.listCards();
    const updated = await client.updateCard(card.id, { phrases: ['new phrase'] });
    expect(updated.revision).toBe(card.revision + 1);
    expect(updated.phrasesEditedByUser).toBe(true);
    expect(updated.phrases).toEqual(['new phrase']);
  });

  it('throws an ApiError with not_found for a missing card id', async () => {
    await client.bootstrap();
    await expect(client.getCard('does-not-exist')).rejects.toBeInstanceOf(ApiError);
  });

  it('approveCard and deleteCard move a draft card through the review lifecycle', async () => {
    const created = await client.createCard({
      title: 'Draft card',
      spec: SAMPLE_CARDS[0].spec,
      phrases: ['draft phrase'],
      status: 'draft',
    });
    expect(created.status).toBe('draft');

    const approved = await client.approveCard(created.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();

    await client.deleteCard(approved.id);
    await expect(client.getCard(approved.id)).rejects.toBeInstanceOf(ApiError);
  });
});
