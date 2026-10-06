import { describe, it, expect } from 'vitest';
import { WikipediaGroundingProvider } from '../generation/grounding.js';

/**
 * A spoken request is often relational — "aditya roy kapur in ashiqui 2". Sending
 * that whole phrase to Wikipedia returned exactly one hit, the FILM, so the
 * actor's own article was never fetched and the card could only ever be built
 * from the film: its poster, its facts, the wrong subject.
 *
 * These tests stub the network so they assert the query-expansion behaviour
 * deterministically rather than depending on live Wikipedia.
 */

interface Page {
  key: string;
  title: string;
  description: string;
  extract: string;
  image?: string;
}

/** Pages that exist per query, keyed by the lowercased query. */
function stubFetch(pagesByQuery: Record<string, Page[]>, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const searchMatch = url.match(/search\/page\?q=([^&]+)/);
    if (searchMatch) {
      const q = decodeURIComponent(searchMatch[1]).toLowerCase();
      seen.push(q);
      const pages = pagesByQuery[q] ?? [];
      return jsonResponse({
        pages: pages.map((p) => ({ key: p.key, title: p.title, description: p.description })),
      });
    }
    const summaryMatch = url.match(/summary\/(.+)$/);
    if (summaryMatch) {
      const key = decodeURIComponent(summaryMatch[1]);
      const page = Object.values(pagesByQuery)
        .flat()
        .find((p) => p.key === key);
      if (!page) return jsonResponse({}, 404);
      return jsonResponse({
        title: page.title,
        description: page.description,
        extract: page.extract,
        thumbnail: page.image ? { source: page.image } : undefined,
        content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${page.key}` } },
      });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const FILM: Page = {
  key: 'Aashiqui_2',
  title: 'Aashiqui 2',
  description: '2013 film',
  extract: 'Aashiqui 2 is a 2013 film directed by Mohit Suri.',
  image: 'https://upload.wikimedia.org/wikipedia/en/f/f3/poster.jpg',
};
const PERSON: Page = {
  key: 'Aditya_Roy_Kapur',
  title: 'Aditya Roy Kapur',
  description: 'Indian actor',
  extract: 'Aditya Roy Kapur is an Indian actor.',
  image: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/portrait.jpg',
};

describe('WikipediaGroundingProvider — relational queries', () => {
  it('searches both sides of "X in Y" and returns the subject', async () => {
    const seen: string[] = [];
    // The full phrase only matches the film; the subject only matches the person.
    const fetchImpl = stubFetch(
      {
        'aditya roy kapur in ashiqui 2': [FILM],
        'aditya roy kapur': [PERSON],
        aashiqui: [FILM],
      },
      seen,
    );
    const provider = new WikipediaGroundingProvider({ fetchImpl });

    const candidates = await provider.search('aditya roy kapur in ashiqui 2', 5, 5000);

    const titles = candidates.map((c) => c.title);
    expect(titles).toContain('Aashiqui 2');
    expect(titles).toContain('Aditya Roy Kapur');
    // Both sides must actually have been queried.
    expect(seen).toContain('aditya roy kapur');
  });

  it('gives the subject an image, so a portrait can be chosen', async () => {
    const fetchImpl = stubFetch({
      'aditya roy kapur in ashiqui 2': [FILM],
      'aditya roy kapur': [PERSON],
      aashiqui: [FILM],
    });
    const provider = new WikipediaGroundingProvider({ fetchImpl });
    const candidates = await provider.search('aditya roy kapur in ashiqui 2', 5, 5000);
    const person = candidates.find((c) => c.title === 'Aditya Roy Kapur');
    expect(person?.imageUrl).toContain('portrait.jpg');
  });

  it('de-duplicates a page returned by more than one query', async () => {
    const fetchImpl = stubFetch({
      'the taj mahal': [{ ...FILM, key: 'Taj_Mahal', title: 'Taj Mahal' }],
      'taj mahal of india': [{ ...FILM, key: 'Taj_Mahal', title: 'Taj Mahal' }],
    });
    const provider = new WikipediaGroundingProvider({ fetchImpl });
    const candidates = await provider.search('the taj mahal of india', 5, 5000);
    expect(candidates.filter((c) => c.title === 'Taj Mahal')).toHaveLength(1);
  });

  it('re-indexes merged candidates contiguously from 0', async () => {
    const fetchImpl = stubFetch({
      'aditya roy kapur in ashiqui 2': [FILM],
      'aditya roy kapur': [PERSON],
      aashiqui: [FILM],
    });
    const provider = new WikipediaGroundingProvider({ fetchImpl });
    const candidates = await provider.search('aditya roy kapur in ashiqui 2', 5, 5000);
    expect(candidates.map((c) => c.index)).toEqual(candidates.map((_, i) => i));
  });

  it('does not split a plain single-entity query', async () => {
    const seen: string[] = [];
    const fetchImpl = stubFetch({ 'taj mahal': [PERSON] }, seen);
    const provider = new WikipediaGroundingProvider({ fetchImpl });
    await provider.search('taj mahal', 5, 5000);
    expect(seen).toEqual(['taj mahal']);
  });

  it('ignores very short relation fragments, which are noise not entities', async () => {
    const seen: string[] = [];
    const fetchImpl = stubFetch({ 'revenue in q3': [] }, seen);
    const provider = new WikipediaGroundingProvider({ fetchImpl });
    await provider.search('revenue in q3', 5, 5000);
    expect(seen).toContain('revenue in q3');
    expect(seen).not.toContain('q3');
  });

  it('returns an empty list rather than throwing when the network fails', async () => {
    const provider = new WikipediaGroundingProvider({
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    await expect(provider.search('aditya roy kapur in ashiqui 2', 5, 500)).resolves.toEqual([]);
  });
});