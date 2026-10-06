import { describe, it, expect } from 'vitest';
import { CardGenerator } from '../generation/card-generator.js';
import { MockGroundingProvider } from '../generation/grounding.js';
import { MockImageFetcher, createImageByteCache, ProxyImageResolver } from '../images/image-fetcher.js';
import { MemoryStore } from '../db/memory-store.js';
import { AesGcmEncryptor } from '../util/encryption.js';
import { AiKeyResolver } from '../generation/ai-credentials.js';
import type { ICache } from '../services/cache.js';
import type {
  GenerationProvider,
  StructuredRequest,
  StructuredResult,
} from '../generation/provider.js';
import type { GroundingCandidate } from '../generation/grounding.js';

class TestCache implements ICache {
  private store = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

/** Emits exactly the draft the test supplies. */
class ScriptedProvider implements GenerationProvider {
  readonly id = 'mock' as const;
  readonly model = 'scripted/v0';
  constructor(private readonly draft: unknown) {}
  async generateStructured(_req: StructuredRequest): Promise<StructuredResult> {
    const json = this.draft;
    return { json, raw: JSON.stringify(json), provider: this.id, model: this.model };
  }
}

const FILM: GroundingCandidate = {
  index: 0,
  title: 'Aashiqui 2',
  description: '2013 film',
  extract: 'Aashiqui 2 is a 2013 film directed by Mohit Suri.',
  pageUrl: 'https://en.wikipedia.org/wiki/Aashiqui_2',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/en/f/f3/film-poster.jpg',
};
const PERSON: GroundingCandidate = {
  index: 1,
  title: 'Aditya Roy Kapur',
  description: 'Indian actor',
  extract: 'Aditya Roy Kapur is an Indian actor.',
  pageUrl: 'https://en.wikipedia.org/wiki/Aditya_Roy_Kapur',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/actor-portrait.jpg',
};

async function generateWith(draft: unknown) {
  const store = new MemoryStore();
  const encryptor = new AesGcmEncryptor(Buffer.alloc(32, 1).toString('base64'));
  const keyResolver = new AiKeyResolver(store, encryptor);
  await store.upsertAiCredential('demo-user', {
    provider: 'mock',
    apiKey: encryptor.encrypt('test-key-0123456789'),
    model: 'mock-model/v0',
  });

  const images = new ProxyImageResolver(
    new MockImageFetcher(),
    createImageByteCache(),
    'http://localhost:3001',
  );

  const generator = new CardGenerator({
    keyResolver,
    providerFactory: () => new ScriptedProvider(draft),
    grounding: new MockGroundingProvider([FILM, PERSON]),
    images,
    cache: new TestCache(),
  });

  return generator.generate('demo-user', 'aditya roy kapur in ashiqui 2', {
    autoDismissMs: 12_000,
  });
}

/**
 * The picture must come from the entity the speaker asked ABOUT, not from
 * whichever article happened to ground the facts. Asking about an actor inside a
 * film previously produced the film poster, because the engine always
 * illustrated from `sourceIndex` and the film is what describes the role.
 */
describe('CardGenerator — subject supplies the image', () => {
  const base = {
    relevant: true,
    title: 'Aditya Roy Kapur in Aashiqui 2',
    subtitle: 'Lead role',
    accent: 'amber',
    layout: 'profile',
    imageWanted: true,
    blocks: [{ kind: 'text', paragraphs: ['He appears in the film.'] }],
  };

  it('uses subjectIndex for the image when it differs from sourceIndex', async () => {
    const result = await generateWith({ ...base, sourceIndex: 0, subjectIndex: 1 });
    expect(result.kind).toBe('card');
    if (result.kind !== 'card') return;
    const image = result.card.blocks.find((b) => b.kind === 'image') as
      | { kind: 'image'; url: string }
      | undefined;
    expect(image, 'expected an image block').toBeDefined();
    // The proxy token encodes the upstream URL; assert on the signed payload.
    const decoded = Buffer.from(
      image!.url.replace('http://localhost:3001/img/', ''),
      'base64url',
    ).toString('utf8');
    expect(decoded).toContain('actor-portrait.jpg');
    expect(decoded).not.toContain('film-poster.jpg');
  });

  it('falls back to sourceIndex when no subject is given', async () => {
    const result = await generateWith({ ...base, sourceIndex: 0, subjectIndex: null });
    expect(result.kind).toBe('card');
    if (result.kind !== 'card') return;
    const image = result.card.blocks.find((b) => b.kind === 'image') as
      | { kind: 'image'; url: string }
      | undefined;
    const decoded = Buffer.from(
      image!.url.replace('http://localhost:3001/img/', ''),
      'base64url',
    ).toString('utf8');
    expect(decoded).toContain('film-poster.jpg');
  });

  it('cites the fact-source in the footer, not the subject', async () => {
    const result = await generateWith({ ...base, sourceIndex: 0, subjectIndex: 1 });
    expect(result.kind).toBe('card');
    if (result.kind !== 'card') return;
    const footer = result.card.blocks.find((b) => b.kind === 'status_list') as
      | { kind: 'status_list'; rows: Array<{ text: string }> }
      | undefined;
    expect(footer?.rows[0].text).toContain('Aashiqui 2');
  });
});