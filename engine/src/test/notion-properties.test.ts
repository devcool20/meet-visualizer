import { describe, it, expect } from 'vitest';
import {
  getTitleText,
  getRichText,
  getSelect,
  getMultiSelect,
  getNumber,
  getCheckbox,
  getFileUrls,
  paginateAll,
} from '../notion/properties.js';
import type { NotionPage } from '../notion/api.js';

function page(properties: Record<string, any>): NotionPage {
  return { id: 'page-1', last_edited_time: '2026-01-01T00:00:00.000Z', properties };
}

describe('Notion property extraction', () => {
  it('getTitleText concatenates rich text segments', () => {
    const p = page({ Title: { type: 'title', title: [{ plain_text: 'Hello ' }, { plain_text: 'World' }] } });
    expect(getTitleText(p, 'Title')).toBe('Hello World');
  });

  it('getTitleText returns "" when the property is missing or the wrong type', () => {
    expect(getTitleText(page({}), 'Title')).toBe('');
    expect(getTitleText(page({ Title: { type: 'rich_text', rich_text: [] } }), 'Title')).toBe('');
  });

  it('getRichText concatenates plain_text segments', () => {
    const p = page({ Body: { type: 'rich_text', rich_text: [{ plain_text: 'a' }, { plain_text: 'b' }] } });
    expect(getRichText(p, 'Body')).toBe('ab');
  });

  it('getSelect returns the select name or null', () => {
    const p = page({ Status: { type: 'select', select: { name: 'Draft' } } });
    expect(getSelect(p, 'Status')).toBe('Draft');
    expect(getSelect(page({ Status: { type: 'select', select: null } }), 'Status')).toBeNull();
    expect(getSelect(page({}), 'Status')).toBeNull();
  });

  it('getMultiSelect returns an array of names', () => {
    const p = page({ Tags: { type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] } });
    expect(getMultiSelect(p, 'Tags')).toEqual(['a', 'b']);
    expect(getMultiSelect(page({}), 'Tags')).toEqual([]);
  });

  it('getNumber returns the number or null for missing/wrong-type/null', () => {
    expect(getNumber(page({ N: { type: 'number', number: 42 } }), 'N')).toBe(42);
    expect(getNumber(page({ N: { type: 'number', number: null } }), 'N')).toBeNull();
    expect(getNumber(page({}), 'N')).toBeNull();
  });

  it('getCheckbox returns a boolean, defaulting to false', () => {
    expect(getCheckbox(page({ C: { type: 'checkbox', checkbox: true } }), 'C')).toBe(true);
    expect(getCheckbox(page({}), 'C')).toBe(false);
  });

  it('getFileUrls extracts both external and internal file URLs', () => {
    const p = page({
      Image: {
        type: 'files',
        files: [
          { type: 'external', external: { url: 'https://example.com/a.png' } },
          { type: 'file', file: { url: 'https://notion-signed.example.com/b.png' } },
          { type: 'external', external: { url: '' } }, // filtered out
        ],
      },
    });
    expect(getFileUrls(p, 'Image')).toEqual(['https://example.com/a.png', 'https://notion-signed.example.com/b.png']);
  });

  it('getFileUrls returns [] when the property is missing', () => {
    expect(getFileUrls(page({}), 'Image')).toEqual([]);
  });

  it('a malformed/missing property never throws — every getter degrades to empty/default', () => {
    const p = page({ Weird: { type: 'title' /* missing .title array entirely */ } });
    expect(() => getTitleText(p, 'Weird')).not.toThrow();
    expect(getTitleText(p, 'Weird')).toBe('');
  });
});

describe('paginateAll', () => {
  it('drains every page until has_more is false', async () => {
    const pagesById: Record<string, NotionPage[]> = {
      cursor0: [page({}), page({})],
      cursor1: [page({})],
    };
    let calls = 0;
    const fetchPage = async (cursor: string | null) => {
      calls++;
      if (cursor === null) return { results: pagesById.cursor0, has_more: true, next_cursor: 'c1' };
      if (cursor === 'c1') return { results: pagesById.cursor1, has_more: false, next_cursor: null };
      throw new Error('unexpected cursor');
    };
    const all = await paginateAll(fetchPage);
    expect(all).toHaveLength(3);
    expect(calls).toBe(2);
  });

  it('stops after a single page when has_more is false immediately', async () => {
    const fetchPage = async () => ({ results: [page({})], has_more: false, next_cursor: null });
    const all = await paginateAll(fetchPage);
    expect(all).toHaveLength(1);
  });

  it('is bounded by maxPages even if the API claims has_more forever (circuit breaker)', async () => {
    let calls = 0;
    const fetchPage = async () => {
      calls++;
      return { results: [page({})], has_more: true, next_cursor: 'always-more' };
    };
    const all = await paginateAll(fetchPage, 5);
    expect(calls).toBe(5);
    expect(all).toHaveLength(5);
  });

  it('stops if next_cursor is null even when has_more claims true', async () => {
    const fetchPage = async () => ({ results: [page({})], has_more: true, next_cursor: null });
    const all = await paginateAll(fetchPage, 100);
    expect(all).toHaveLength(1);
  });
});
