import Redis from 'ioredis';
import { config } from '../config.js';

export interface ICache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  exists(key: string): Promise<boolean>;
  flush(): Promise<void>;
}

class InMemoryCache implements ICache {
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

  async flush(): Promise<void> {
    this.store.clear();
  }
}

class RedisCache implements ICache {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url);
    console.log('[Cache] Redis Cache initialized.');
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

  async flush(): Promise<void> {
    await this.client.flushall();
  }
}

export const cacheService: ICache = config.redisUrl
  ? new RedisCache(config.redisUrl)
  : new InMemoryCache();

if (!config.redisUrl) {
  console.log('[Cache] In-memory fallback Cache initialized.');
}
