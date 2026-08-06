import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * Cache invalidation transport (plan §2.1 / deliverable 8).
 *
 * Editing a card publishes on `u:<userId>:cards:invalidate`; every connected
 * WS session for that user reloads its in-memory phrase set and sends the
 * client `{ t: 'invalidate', cardIds }`. In production this is Redis pub/sub
 * so it fans out across engine processes. In local/dev mode (no REDIS_URL)
 * it falls back to an in-process EventEmitter — single process, so that's
 * sufficient and keeps `STASH_LOCAL=1` credential-free.
 */
export interface InvalidationMessage {
  userId: string;
  cardIds: string[];
}

export type InvalidationHandler = (msg: InvalidationMessage) => void;

export interface IPubSub {
  publishInvalidation(msg: InvalidationMessage): Promise<void>;
  subscribeInvalidation(userId: string, handler: InvalidationHandler): () => void;
  close(): Promise<void>;
}

function channelFor(userId: string): string {
  return `u:${userId}:cards:invalidate`;
}

class InProcessPubSub implements IPubSub {
  private emitter = new EventEmitter();

  async publishInvalidation(msg: InvalidationMessage): Promise<void> {
    this.emitter.emit(channelFor(msg.userId), msg);
  }

  subscribeInvalidation(userId: string, handler: InvalidationHandler): () => void {
    const channel = channelFor(userId);
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

class RedisPubSub implements IPubSub {
  private pub: Redis;
  private sub: Redis;
  private handlers = new Map<string, Set<InvalidationHandler>>();

  constructor(url: string) {
    this.pub = new Redis(url);
    this.sub = new Redis(url);
    this.sub.on('message', (channel: string, raw: string) => {
      const set = this.handlers.get(channel);
      if (!set) return;
      let msg: InvalidationMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      for (const h of set) h(msg);
    });
  }

  async publishInvalidation(msg: InvalidationMessage): Promise<void> {
    await this.pub.publish(channelFor(msg.userId), JSON.stringify(msg));
  }

  subscribeInvalidation(userId: string, handler: InvalidationHandler): () => void {
    const channel = channelFor(userId);
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.sub.subscribe(channel).catch(() => {});
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.handlers.delete(channel);
        this.sub.unsubscribe(channel).catch(() => {});
      }
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}

export function createPubSub(): IPubSub {
  if (config.redisUrl) return new RedisPubSub(config.redisUrl);
  return new InProcessPubSub();
}

export const pubSubService: IPubSub = createPubSub();
