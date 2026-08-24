/**
 * Image fetching and caching (plan §3.9).
 *
 * HttpImageFetcher fetches from the allow-list with manual redirect handling,
 * size caps, and content-type validation. ImageByteCache is an in-process LRU
 * for fetched bytes. MockImageFetcher is used by STASH_LOCAL and tests.
 */
import { LRUCache } from 'lru-cache';
import { isAllowedImageHost } from './proxy-url.js';
import { config } from '../config.js';

export interface FetchedImage {
  bytes: Buffer;
  contentType: string;
}

export interface ImageFetcher {
  fetch(url: string, timeoutMs: number): Promise<FetchedImage | null>;
}

export class HttpImageFetcher implements ImageFetcher {
  private maxRedirects = 2;

  constructor(private deps?: { fetchImpl?: typeof fetch }) {}

  private doFetch(url: string, init?: RequestInit): Promise<Response> {
    const f = this.deps?.fetchImpl ?? globalThis.fetch;
    return f(url, init);
  }

  async fetch(url: string, timeoutMs: number): Promise<FetchedImage | null> {
    return this.fetchWithRedirects(url, timeoutMs, 0);
  }

  private async fetchWithRedirects(url: string, timeoutMs: number, redirectCount: number): Promise<FetchedImage | null> {
    if (!isAllowedImageHost(url)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.doFetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });

      // Handle redirects
      if ((res.status >= 301 && res.status <= 308) || res.status === 303) {
        const location = res.headers.get('location');
        if (!location || redirectCount >= this.maxRedirects) return null;
        // Resolve relative redirects
        const resolved = new URL(location, url).toString();
        return this.fetchWithRedirects(resolved, timeoutMs, redirectCount + 1);
      }

      if (!res.ok) return null;

      // Validate content-type
      const contentType = res.headers.get('content-type') || '';
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const primaryType = contentType.split(';')[0].trim().toLowerCase();
      if (!allowedTypes.includes(primaryType)) return null;

      // Check content-length
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength > config.imageProxyMaxBytes) return null;

      // Stream bytes up to the cap
      const reader = res.body?.getReader();
      if (!reader) return null;

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > config.imageProxyMaxBytes) return null;
        chunks.push(value);
      }

      const bytes = Buffer.concat(chunks);
      return { bytes, contentType: primaryType };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockImageFetcher implements ImageFetcher {
  constructor(private image?: FetchedImage) {}

  async fetch(_url: string, _timeoutMs: number): Promise<FetchedImage | null> {
    return this.image ?? { bytes: Buffer.from('mock-image-bytes'), contentType: 'image/png' };
  }
}

export interface ImageByteCache {
  get(key: string): FetchedImage | undefined;
  set(key: string, value: FetchedImage): void;
}

export function createImageByteCache(): ImageByteCache {
  const cache = new LRUCache<string, FetchedImage>({
    max: config.imageProxyCacheMaxEntries,
    maxSize: 64 * 1024 * 1024, // 64 MB
    sizeCalculation: (value) => value.bytes.length,
    ttl: config.imageProxyCacheTtlSeconds * 1000,
  });
  return {
    get(key: string): FetchedImage | undefined {
      return cache.get(key);
    },
    set(key: string, value: FetchedImage): void {
      cache.set(key, value);
    },
  };
}

export interface ImageResolver {
  /** Fetch and cache image bytes, returning a proxied URL or null. */
  resolve(upstreamUrl: string, timeoutMs: number): Promise<string | null>;
}

export class ProxyImageResolver implements ImageResolver {
  constructor(
    private fetcher: ImageFetcher,
    private byteCache: ImageByteCache,
    private publicOrigin: string,
  ) {}

  async resolve(upstreamUrl: string, timeoutMs: number): Promise<string | null> {
    // In production require https, allow http in local development
    if (!this.publicOrigin.startsWith('https://') && !this.publicOrigin.startsWith('http://localhost') && !this.publicOrigin.startsWith('http://127.0.0.1')) {
      return null;
    }

    const cached = this.byteCache.get(upstreamUrl);
    if (cached) {
      const token = (await import('./proxy-url.js')).signImageUrl(upstreamUrl);
      return `${this.publicOrigin}/img/${token}`;
    }

    const fetched = await this.fetcher.fetch(upstreamUrl, timeoutMs);
    if (!fetched) return null;

    this.byteCache.set(upstreamUrl, fetched);
    const token = (await import('./proxy-url.js')).signImageUrl(upstreamUrl);
    return `${this.publicOrigin}/img/${token}`;
  }
}
