import { Client } from '@notionhq/client';
import { config } from '../config.js';
import { cacheService } from './cache.js';

export interface NotionData {
  type: 'graph' | 'image' | 'text_card';
  title: string;
  data?: any;
  url?: string;
  body?: string;
}

class NotionService {
  private client: Client | null = null;

  constructor() {
    if (config.notionApiKey) {
      this.client = new Client({ auth: config.notionApiKey });
      console.log('[Notion] Client initialized with API key.');
    } else {
      console.log('[Notion] No API key provided. Using mock database fallback.');
    }
  }

  // Pre-fetch pipeline
  async sync(): Promise<void> {
    console.log('[Notion] Syncing workspace knowledge database...');
    
    if (config.useMockNotion || !this.client || !config.notionDatabaseId) {
      await this.loadMockData();
      return;
    }

    try {
      // Query database for pages
      const response = await this.client.databases.query({
        database_id: config.notionDatabaseId,
      });

      console.log(`[Notion] Found ${response.results.length} rows in Notion database.`);

      for (const page of response.results) {
        if ('properties' in page) {
          const props = page.properties;
          
          // Identify properties: anchor, type, title, value (varies)
          const anchor = this.getPropText(props, 'Anchor') || this.getPropText(props, 'Name');
          const type = this.getPropSelect(props, 'Type') as 'graph' | 'image' | 'text_card';
          const title = this.getPropText(props, 'Title') || anchor;
          
          if (!anchor || !type) continue;

          let dataPayload: NotionData = { type, title };

          if (type === 'graph') {
            const rawVal = this.getPropText(props, 'Value') || '';
            try {
              dataPayload.data = JSON.parse(rawVal);
            } catch (err) {
              console.error(`[Notion] Failed to parse graph JSON for ${anchor}:`, rawVal);
              dataPayload.data = [];
            }
          } else if (type === 'image') {
            // Can be file attachment or a string URL
            dataPayload.url = this.getPropFile(props, 'Value') || this.getPropText(props, 'Value') || '';
          } else if (type === 'text_card') {
            dataPayload.body = this.getPropText(props, 'Value') || '';
          }

          // Cache in Redis/memory
          await cacheService.set(`notion:${anchor}`, JSON.stringify(dataPayload));
          console.log(`[Notion] Cached key: notion:${anchor} -> Type: ${type}`);
        }
      }
      
      console.log('[Notion] Database sync completed successfully.');
    } catch (err) {
      console.error('[Notion] Sync error. Falling back to mock database:', err);
      await this.loadMockData();
    }
  }

  private async loadMockData(): Promise<void> {
    const mockDb: Record<string, NotionData> = {
      q2_financials: {
        type: 'graph',
        title: 'Q2 Financial Growth',
        data: [
          { month: 'Apr', value: 120000 },
          { month: 'May', value: 150000 },
          { month: 'Jun', value: 190000 },
        ],
      },
      sys_architecture_v2: {
        type: 'image',
        title: 'Platform Architecture Map',
        url: '/architecture_v2.png',
      },
      security_compliance: {
        type: 'text_card',
        title: 'Security & Compliance Protocols',
        body: 'SOC-2 Type II Certified, HIPAA Compliant Workspace. All streaming buffers are encrypted in transit and processed within sandboxed serverless memory zones.',
      },
    };

    for (const [key, value] of Object.entries(mockDb)) {
      await cacheService.set(`notion:${key}`, JSON.stringify(value));
      console.log(`[Notion Mock] Cached key: notion:${key} -> Type: ${value.type}`);
    }
    console.log('[Notion Mock] Loaded 3 mock database rows into cache.');
  }

  // Notion helper methods
  private getPropText(props: any, name: string): string {
    const prop = props[name];
    if (!prop) return '';
    if (prop.type === 'title') {
      return prop.title.map((t: any) => t.plain_text).join('');
    }
    if (prop.type === 'rich_text') {
      return prop.rich_text.map((t: any) => t.plain_text).join('');
    }
    return '';
  }

  private getPropSelect(props: any, name: string): string {
    const prop = props[name];
    if (!prop) return '';
    if (prop.type === 'select') {
      return prop.select?.name || '';
    }
    return '';
  }

  private getPropFile(props: any, name: string): string {
    const prop = props[name];
    if (!prop || prop.type !== 'files') return '';
    if (prop.files.length === 0) return '';
    const firstFile = prop.files[0];
    if (firstFile.type === 'external') return firstFile.external.url;
    if (firstFile.type === 'file') return firstFile.file.url;
    return '';
  }
}

export const notionService = new NotionService();
