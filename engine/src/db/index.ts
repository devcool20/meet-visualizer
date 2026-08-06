import { config } from '../config.js';
import type { Store } from './types.js';
import { MemoryStore } from './memory-store.js';

export * from './types.js';
export { MemoryStore } from './memory-store.js';

let singleton: Store | null = null;

/**
 * Store factory. Local dev (`STASH_LOCAL=1`) and any environment without
 * DATABASE_URL fall back to the in-memory store so the engine and its tests
 * never require a live Postgres. Real deployments set DATABASE_URL and get
 * `PrismaStore` lazily (Prisma client import is dynamic so this module has no
 * hard dependency on a generated client existing in test environments that
 * never call `getStore()` with a real URL).
 */
export async function getStore(): Promise<Store> {
  if (singleton) return singleton;
  if (config.isLocal || !config.databaseUrl) {
    singleton = new MemoryStore();
    return singleton;
  }
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaStore } = await import('./prisma-store.js');
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  singleton = new PrismaStore(prisma);
  return singleton;
}

/** Test helper: force a fresh MemoryStore, bypassing the singleton cache. */
export function createMemoryStoreForTest(): MemoryStore {
  return new MemoryStore();
}
