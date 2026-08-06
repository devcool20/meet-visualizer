/**
 * Notion file image caching (plan §2.6 + §2.7 load-bearing note).
 *
 * Notion file URLs are signed and expire in ~1h. On sync we fetch each one
 * ONCE into durable storage and return a stable CDN URL for the CardSpec's
 * `image` block. This is load-bearing, not cosmetic: the extension draws
 * that URL into the canvas that becomes the user's outbound camera frame,
 * and drawing a non-CORS image taints the canvas, which makes
 * `captureStream()` throw and breaks the user's video for the rest of the
 * call. The stored object's bucket/CDN config MUST serve
 * `Access-Control-Allow-Origin` for the image to be safely drawable.
 */
export interface ImageCache {
  /** Fetches `sourceUrl` once and returns a stable, CORS-correct CDN URL. */
  cacheImage(userId: string, sourceUrl: string, key: string): Promise<string>;
}

export interface SupabaseStorageLike {
  storage: {
    from(bucket: string): {
      upload(path: string, data: Buffer, opts?: { contentType?: string; upsert?: boolean }): Promise<{ error: any }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

/**
 * Real implementation backed by Supabase Storage. The bucket must be
 * configured (once, in the Supabase project) to serve public objects with
 * `Access-Control-Allow-Origin: *` (or the product origin) — that
 * configuration lives in Supabase, not in this code, but is a hard
 * prerequisite for canvas-safety.
 */
export class SupabaseImageCache implements ImageCache {
  constructor(private client: SupabaseStorageLike, private bucket = 'stash-card-images') {}

  async cacheImage(userId: string, sourceUrl: string, key: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to fetch Notion file: HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    const path = `${userId}/${key}`;
    const { error } = await this.client.storage.from(this.bucket).upload(path, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message ?? error}`);
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}

/** Deterministic mock — used in STASH_LOCAL and tests. No network call. */
export class MockImageCache implements ImageCache {
  public cached = new Map<string, string>();

  async cacheImage(userId: string, _sourceUrl: string, key: string): Promise<string> {
    const url = `https://cdn.stash.local/${userId}/${key}.png`;
    this.cached.set(key, url);
    return url;
  }
}
