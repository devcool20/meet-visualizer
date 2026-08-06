/**
 * Notion API boundary (plan §2.6).
 *
 * A thin interface over the pieces of `@notionhq/client` this engine needs,
 * so `notion/sync.ts` and `notion/properties.ts` can be unit tested with a
 * fake implementation instead of hitting Notion's network API (constraint:
 * "mock Notion... at the boundary").
 */
export interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

export interface NotionQueryResult {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionApi {
  queryDataSource(dataSourceId: string, cursor?: string | null): Promise<NotionQueryResult>;
}

/**
 * Real implementation over `@notionhq/client` 5.22.0's `client.dataSources`
 * (plan §2.6: "Migrate to client.dataSources... Notion has moved to data
 * sources"). Rate-limit backoff + pagination live here, not in the caller.
 */
export class RealNotionApi implements NotionApi {
  constructor(private client: { dataSources: { query: (args: any) => Promise<any> } }) {}

  async queryDataSource(dataSourceId: string, cursor?: string | null): Promise<NotionQueryResult> {
    const maxRetries = 5;
    let attempt = 0;
    for (;;) {
      try {
        const response = await this.client.dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor ?? undefined,
          page_size: 100,
        });
        return {
          results: response.results as NotionPage[],
          has_more: response.has_more,
          next_cursor: response.next_cursor,
        };
      } catch (err: any) {
        // Notion rate-limits with HTTP 429 + Retry-After. Back off and retry
        // a bounded number of times rather than failing the whole sync.
        const isRateLimit = err?.status === 429 || err?.code === 'rate_limited';
        if (!isRateLimit || attempt >= maxRetries) throw err;
        const retryAfterSeconds = Number(err?.headers?.['retry-after']) || 2 ** attempt;
        await sleep(retryAfterSeconds * 1000);
        attempt++;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
