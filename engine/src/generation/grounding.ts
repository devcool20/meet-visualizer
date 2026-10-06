/**
 * Grounding providers (plan §3.6).
 *
 * WikipediaGroundingProvider retrieves candidates from the Wikimedia REST API.
 * MockGroundingProvider provides deterministic results for tests and STASH_LOCAL.
 */
import { isAllowedImageHost } from '../images/proxy-url.js';

export interface GroundingCandidate {
  index: number;
  title: string;
  description: string;
  extract: string; // ≤ 900 chars of summary prose
  pageUrl: string;
  imageUrl: string | null;
}

export interface GroundingProvider {
  search(query: string, limit: number, timeoutMs: number): Promise<GroundingCandidate[]>;
}

/**
 * Extract a search query from a conversational utterance.
 * Strips leading filler patterns like "I have been a big fan of...",
 * collapses whitespace, keeps ≤ 8 tokens.
 */
export function extractSearchQuery(utterance: string): string {
  let text = utterance.trim();

  // Strip leading filler patterns
  text = text.replace(
    /^(i|we)\s+(have\s+been|am|was|really)\b.*?\b(of|about|for)\b\s*/i,
    '',
  );

  // Split into tokens, discard common filler words
  const stopwords = new Set([
    'a', 'an', 'the', 'is', 'it', 'its', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'i', 'we', 'you', 'he', 'she',
    'they', 'this', 'that', 'these', 'those', 'am', 'are', 'was', 'were',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'can', 'could', 'should', 'may', 'might', 'shall', 'about', 'into', 'over',
    'very', 'just', 'really', 'actually', 'basically', 'like', 'so',
  ]);
  const tokens = text.split(/\s+/).filter((t) => t.length > 0 && !stopwords.has(t.toLowerCase()));

  // Keep ≤ 8 tokens
  const kept = tokens.slice(0, 8);
  if (kept.length === 0) return utterance.trim();

  return kept.join(' ');
}

interface WikiSearchResult {
  pages: Array<{ key: string; title: string; description?: string }>;
}

interface WikiSummary {
  title: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  thumbnail?: { source?: string };
}

export class WikipediaGroundingProvider implements GroundingProvider {
  constructor(
    private deps?: { fetchImpl?: typeof fetch; lang?: string },
  ) {}

  private get fetch(): typeof fetch {
    return this.deps?.fetchImpl ?? globalThis.fetch;
  }

  private get lang(): string {
    return this.deps?.lang ?? 'en';
  }

  /**
   * Split a relational utterance into the queries worth running.
   *
   * Searching the raw utterance as one query is what broke
   * "aditya roy kapur in aashiqui 2": Wikipedia returned exactly one hit, the
   * FILM, and the actor's own article was never fetched - so the card could only
   * ever be built from the film, with the film's poster and the film's facts.
   * The subject was not missing from the request, it was missing from the
   * candidate list.
   *
   * So each side of the relation is searched too. "aditya roy kapur in aashiqui
   * 2" also searches "aditya roy kapur" and "aashiqui 2", and the actor's
   * article arrives with his portrait.
   */
  private queriesFor(query: string): string[] {
    const clean = query.replace(/[?!.]+$/, '').trim();
    if (!clean) return [];
    const out = [clean];
    const parts = clean.split(/\s+(?:in|of|from|at|on|for|inside|within)\s+/i);
    if (parts.length > 1) {
      for (const part of parts) {
        const t = part.trim();
        // Short fragments are noise, not entities.
        if (t.length >= 4 && !out.some((q) => q.toLowerCase() === t.toLowerCase())) out.push(t);
      }
    }
    return out.slice(0, 3);
  }

  /** One Wikipedia search + summary fan-out for a single query. */
  private async searchOne(
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<GroundingCandidate[]> {
    const encoded = encodeURIComponent(query);
    const searchUrl = `https://${this.lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encoded}&limit=${limit}`;
    const searchRes = await this.fetch(searchUrl, {
      headers: { 'User-Agent': 'StashLive/0.1 (https://meet-visualizer.vercel.app)' },
      signal,
    });
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as WikiSearchResult;
    if (!searchData.pages?.length) return [];

    const topPages = searchData.pages.slice(0, limit);
    const summaryResults = await Promise.allSettled(
      topPages.map((page) => {
        const summaryUrl = `https://${this.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`;
        return this.fetch(summaryUrl, {
          headers: { 'User-Agent': 'StashLive/0.1 (https://meet-visualizer.vercel.app)' },
          signal,
        }).then((r) => (r.ok ? r.json() : null));
      }),
    );

    const candidates: GroundingCandidate[] = [];
    for (let i = 0; i < topPages.length; i++) {
      const result = summaryResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const summary = result.value as WikiSummary;

      let imageUrl: string | null = null;
      if (summary.thumbnail?.source) {
        // Normalise protocol-relative URLs
        const raw = summary.thumbnail.source.startsWith('//')
          ? `https:${summary.thumbnail.source}`
          : summary.thumbnail.source;
        if (isAllowedImageHost(raw)) {
          imageUrl = raw;
        }
      }

      candidates.push({
        index: i,
        title: summary.title || topPages[i].title,
        description: summary.description || topPages[i].description || '',
        extract: (summary.extract || '').slice(0, 900),
        pageUrl:
          summary.content_urls?.desktop?.page ||
          `https://${this.lang}.wikipedia.org/wiki/${encodeURIComponent(topPages[i].key)}`,
        imageUrl,
      });
    }
    return candidates;
  }

  async search(query: string, limit: number, timeoutMs: number): Promise<GroundingCandidate[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const queries = this.queriesFor(query);
      if (queries.length === 0) return [];

      // Run in parallel under the same overall budget - the sub-queries must not
      // serially eat the grounding timeout.
      const settled = await Promise.allSettled(
        queries.map((q) => this.searchOne(q, limit, controller.signal)),
      );

      // Merge in query order, de-duplicated by page, so the primary query's hits
      // keep priority and the subject's article follows the context's.
      const merged: GroundingCandidate[] = [];
      const seen = new Set<string>();
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        for (const c of result.value) {
          const key = c.pageUrl.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ ...c, index: merged.length });
        }
      }
      return merged;
    } catch {
      return []; // Any failure -> ungrounded path, never throws
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockGroundingProvider implements GroundingProvider {
  constructor(private candidates?: GroundingCandidate[]) {}

  async search(_query: string, _limit: number, _timeoutMs: number): Promise<GroundingCandidate[]> {
    return (
      this.candidates ?? [
        {
          index: 0,
          title: 'Mock Search Result',
          description: 'A deterministic mock result for local dev and testing',
          extract: 'This is a mock grounding result. It requires no network access and is used by STASH_LOCAL=1 and all tests.',
          pageUrl: 'https://en.wikipedia.org/wiki/Mock',
          imageUrl: null,
        },
      ]
    );
  }
}
