import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * Cache abstraction (plan §2.9: "keep ICache, namespace every key").
 *
 * The prototype namespaced keys globally as `notion:<anchor>` — a cross-tenant
 * leak, since any user's session could read any other user's cached data by
 * guessing the anchor. Every key that flows through this module (or the
 * higher-level helpers below) MUST be namespaced `u:<userId>:...`. The
 * `userKey` helper is the single place that enforces the prefix so call sites
 * cannot forget it.
 */
export interface ICache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  flush(): Promise<void>;
}

/** Every cache key used by the engine must be built through this. */
export function userKey(userId: string, ...parts: string[]): string {
  if (!userId) throw new Error('userKey() requires a non-empty userId');
  return `u:${userId}:${parts.join(':')}`;
}

export class InMemoryCache implements ICache {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiry });
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async flush(): Promise<void> {
    this.store.clear();
  }
}

export class RedisCache implements ICache {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.exists(key);
    return res === 1;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async flush(): Promise<void> {
    await this.client.flushall();
  }
}

export function createCache(): ICache {
  if (config.redisUrl) return new RedisCache(config.redisUrl);
  return new InMemoryCache();
}

export const cacheService: ICache = createCache();
