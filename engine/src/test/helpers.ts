import { assertCardSpec } from '@stash/card-spec';
import type { CardRecord } from '../db/types.js';
import type { MemoryStore } from '../db/memory-store.js';

/** Shared test fixtures — a minimal valid CardSpec + Store card input builder. */
export function makeCardInput(
  id: string,
  overrides: Partial<Omit<CardRecord, 'id' | 'userId' | 'revision'>> = {},
): Omit<CardRecord, 'id' | 'userId' | 'revision'> {
  return {
    title: id,
    spec: assertCardSpec({
      v: 1,
      id,
      revision: 1,
      title: id,
      blocks: [{ kind: 'text', paragraphs: ['test card'] }],
    }),
    phrases: [],
    phrasesEditedByUser: false,
    embedding: null,
    status: 'approved',
    approvedAt: new Date(),
    enabled: true,
    source: 'sample',
    sourceRef: null,
    sourceRevision: null,
    cooldownMs: 120_000,
    ...overrides,
  };
}

export async function seedUser(store: MemoryStore, id: string, email = `${id}@test.local`) {
  return store.createUser({
    id,
    email,
    settings: { sensitivity: 'balanced', position: 'auto', autoDismissMs: 12_000, reducedMotion: false, storeSnippets: false, triggerMode: 'hold-to-talk' },
  });
}
