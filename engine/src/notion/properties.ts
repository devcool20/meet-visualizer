import type { NotionPage } from './api.js';

/**
 * Notion property extraction helpers (plan §5.2: "Notion property extraction
 * and pagination" is an explicit test requirement).
 *
 * Notion's page property JSON is a discriminated union keyed on `.type`.
 * These helpers pull out plain values defensively — a page missing a
 * property, or with the wrong property type, returns an empty/undefined
 * result rather than throwing, since a single malformed Notion page must not
 * abort an entire sync.
 */
export function getTitleText(page: NotionPage, propName: string): string {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'title') return '';
  return (prop.title ?? []).map((t: any) => t.plain_text).join('');
}

export function getRichText(page: NotionPage, propName: string): string {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'rich_text') return '';
  return (prop.rich_text ?? []).map((t: any) => t.plain_text).join('');
}

export function getSelect(page: NotionPage, propName: string): string | null {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'select') return null;
  return prop.select?.name ?? null;
}

export function getMultiSelect(page: NotionPage, propName: string): string[] {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'multi_select') return [];
  return (prop.multi_select ?? []).map((s: any) => s.name);
}

export function getNumber(page: NotionPage, propName: string): number | null {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'number') return null;
  return typeof prop.number === 'number' ? prop.number : null;
}

export function getCheckbox(page: NotionPage, propName: string): boolean {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'checkbox') return false;
  return Boolean(prop.checkbox);
}

/**
 * Returns file URLs from a `files` property. These URLs are Notion-signed
 * and expire in ~1h (plan §2.6) — callers MUST fetch them promptly into
 * durable storage; do not persist these URLs directly anywhere long-lived.
 */
export function getFileUrls(page: NotionPage, propName: string): string[] {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'files') return [];
  return (prop.files ?? [])
    .map((f: any) => (f.type === 'external' ? f.external?.url : f.file?.url))
    .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0);
}

/**
 * Drains every page across a paginated Notion query using the supplied
 * fetch function. Bounded by `maxPages` as a defensive circuit breaker
 * against a misbehaving/mocked API returning `has_more: true` forever.
 */
export async function paginateAll<T extends { has_more: boolean; next_cursor: string | null; results: NotionPage[] }>(
  fetchPage: (cursor: string | null) => Promise<T>,
  maxPages = 1000,
): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor);
    all.push(...page.results);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}
