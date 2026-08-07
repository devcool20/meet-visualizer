import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import type { UserSettings } from '@stash/card-spec';
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

/**
 * Settings change transport (plan §3.1b).
 *
 * Publishing on `u:<userId>:settings` lets every connected WS session reload
 * the user's settings without a reconnect.
 */
export interface SettingsMessage {
  userId: string;
  settings: UserSettings;
}

export type SettingsHandler = (msg: SettingsMessage) => void;

export interface IPubSub {
  publishInvalidation(msg: InvalidationMessage): Promise<void>;
  subscribeInvalidation(userId: string, handler: InvalidationHandler): () => void;
  // Settings channel
  publishSettings(msg: SettingsMessage): Promise<void>;
  subscribeSettings(userId: string, handler: SettingsHandler): () => void;
  close(): Promise<void>;
}

function channelFor(userId: string): string {
  return `u:${userId}:cards:invalidate`;
}

function settingsChannelFor(userId: string): string {
  return `u:${userId}:settings`;
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

  async publishSettings(msg: SettingsMessage): Promise<void> {
    this.emitter.emit(settingsChannelFor(msg.userId), msg);
  }

  subscribeSettings(userId: string, handler: SettingsHandler): () => void {
    const channel = settingsChannelFor(userId);
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
  private invalidationHandlers = new Map<string, Set<InvalidationHandler>>();
  private settingsHandlers = new Map<string, Set<SettingsHandler>>();

  constructor(url: string) {
    this.pub = new Redis(url);
    this.sub = new Redis(url);
    this.sub.on('message', (channel: string, raw: string) => {
      // Try invalidation handlers first
      let set = this.invalidationHandlers.get(channel);
      if (set) {
        let msg: InvalidationMessage;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        for (const h of set) h(msg);
        return;
      }
      // Try settings handlers
      set = this.settingsHandlers.get(channel) as unknown as Set<InvalidationHandler>;
      if (set) {
        let msg: SettingsMessage;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        for (const h of set) h(msg as any);
      }
    });
  }

  async publishInvalidation(msg: InvalidationMessage): Promise<void> {
    await this.pub.publish(channelFor(msg.userId), JSON.stringify(msg));
  }

  subscribeInvalidation(userId: string, handler: InvalidationHandler): () => void {
    const channel = channelFor(userId);
    let set = this.invalidationHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.invalidationHandlers.set(channel, set);
      this.sub.subscribe(channel).catch(() => {});
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.invalidationHandlers.delete(channel);
        this.sub.unsubscribe(channel).catch(() => {});
      }
    };
  }

  async publishSettings(msg: SettingsMessage): Promise<void> {
    await this.pub.publish(settingsChannelFor(msg.userId), JSON.stringify(msg));
  }

  subscribeSettings(userId: string, handler: SettingsHandler): () => void {
    const channel = settingsChannelFor(userId);
    let set = this.settingsHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.settingsHandlers.set(channel, set);
      this.sub.subscribe(channel).catch(() => {});
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.settingsHandlers.delete(channel);
        this.sub.unsubscribe(channel).catch(() => {});
      }
    };
  }

  async close(): Promise<void> {
    this.invalidationHandlers.clear();
    this.settingsHandlers.clear();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}

export function createPubSub(): IPubSub {
  if (config.redisUrl) return new RedisPubSub(config.redisUrl);
  return new InProcessPubSub();
}

export const pubSubService: IPubSub = createPubSub();
