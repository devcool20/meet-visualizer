import { randomUUID } from 'node:crypto';
import type {
  ActivityEventRecord,
  CardRecord,
  CardStatus,
  ConnectionRecord,
  DeviceRecord,
  PairingNonceRecord,
  Store,
  UserRecord,
} from './types.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory Store implementation.
 *
 * Used by `STASH_LOCAL=1` (deliverable 9) and by every unit/integration test
 * (constraint: "tests must pass with no network access"). It implements the
 * exact same tenant-scoping rules as `PrismaStore` — including the
 * cross-tenant denial tests in `src/test/cross-tenant.test.ts`, which run
 * against this implementation because it needs no live Postgres.
 */
export class MemoryStore implements Store {
  private users = new Map<string, UserRecord>();
  private cards = new Map<string, CardRecord>();
  private connections = new Map<string, ConnectionRecord>(); // key: userId:provider
  private devices = new Map<string, DeviceRecord>();
  private nonces = new Map<string, PairingNonceRecord>(); // key: nonceHash
  private activity = new Map<string, ActivityEventRecord>();

  async createUser(input: { id: string; email: string; name?: string | null; settings: import('@stash/card-spec').UserSettings }): Promise<UserRecord> {
    const rec: UserRecord = {
      id: input.id,
      email: input.email,
      name: input.name ?? null,
      createdAt: new Date(),
      settings: input.settings,
    };
    this.users.set(rec.id, rec);
    return rec;
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) if (u.email === email) return u;
    return null;
  }

  async updateUserSettings(userId: string, settings: import('@stash/card-spec').UserSettings): Promise<UserRecord> {
    const u = this.users.get(userId);
    if (!u) throw new Error(`User ${userId} not found`);
    u.settings = settings;
    return u;
  }

  async createCard(
    userId: string,
    input: Omit<CardRecord, 'id' | 'userId' | 'revision'> & { revision?: number },
  ): Promise<CardRecord> {
    const rec: CardRecord = {
      ...input,
      id: randomUUID(),
      userId,
      revision: input.revision ?? 1,
    };
    this.cards.set(rec.id, rec);
    return rec;
  }

  async getCard(userId: string, cardId: string): Promise<CardRecord | null> {
    const c = this.cards.get(cardId);
    if (!c || c.userId !== userId) return null; // tenant boundary
    return c;
  }

  async listCards(userId: string, opts?: { enabledOnly?: boolean; status?: CardStatus }): Promise<CardRecord[]> {
    let out = [...this.cards.values()].filter((c) => c.userId === userId); // tenant boundary
    if (opts?.enabledOnly) out = out.filter((c) => c.enabled);
    if (opts?.status) out = out.filter((c) => c.status === opts.status);
    return out;
  }

  async updateCard(userId: string, cardId: string, patch: Partial<CardRecord>): Promise<CardRecord> {
    const existing = await this.getCard(userId, cardId); // tenant boundary
    if (!existing) throw new Error(`Card ${cardId} not found for user`);
    const updated = { ...existing, ...patch, id: existing.id, userId: existing.userId };
    this.cards.set(cardId, updated);
    return updated;
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    const existing = await this.getCard(userId, cardId); // tenant boundary
    if (!existing) return;
    this.cards.delete(cardId);
  }

  async searchCardsByEmbedding(
    userId: string,
    embedding: number[],
    limit: number,
  ): Promise<Array<{ card: CardRecord; score: number }>> {
    const candidates = [...this.cards.values()].filter(
      (c) => c.userId === userId && c.enabled && c.embedding, // tenant boundary
    );
    const scored = candidates.map((card) => ({ card, score: cosineSimilarity(embedding, card.embedding!) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async upsertConnection(userId: string, input: Omit<ConnectionRecord, 'id' | 'userId'>): Promise<ConnectionRecord> {
    const key = `${userId}:${input.provider}`;
    const existing = this.connections.get(key);
    const rec: ConnectionRecord = { ...input, id: existing?.id ?? randomUUID(), userId };
    this.connections.set(key, rec);
    return rec;
  }

  async getConnection(userId: string, provider: string): Promise<ConnectionRecord | null> {
    return this.connections.get(`${userId}:${provider}`) ?? null; // tenant boundary
  }

  async listConnectionsForReconciliation(): Promise<ConnectionRecord[]> {
    return [...this.connections.values()];
  }

  async deleteConnection(userId: string, provider: string): Promise<void> {
    this.connections.delete(`${userId}:${provider}`);
  }

  async createDevice(userId: string, input: Omit<DeviceRecord, 'id' | 'userId'>): Promise<DeviceRecord> {
    const rec: DeviceRecord = { ...input, id: randomUUID(), userId };
    this.devices.set(rec.id, rec);
    return rec;
  }

  async getDeviceByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
    for (const d of this.devices.values()) if (d.tokenHash === tokenHash) return d;
    return null;
  }

  async touchDevice(deviceId: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (d) d.lastSeenAt = new Date();
  }

  async rotateDeviceToken(deviceId: string, newTokenHash: string, newExpiresAt: Date): Promise<DeviceRecord> {
    const d = this.devices.get(deviceId);
    if (!d) throw new Error(`Device ${deviceId} not found`);
    d.tokenHash = newTokenHash;
    d.expiresAt = newExpiresAt;
    return d;
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (!d || d.userId !== userId) return; // tenant boundary
    d.revokedAt = new Date();
  }

  async revokeAllDevicesForUser(userId: string): Promise<void> {
    for (const d of this.devices.values()) {
      if (d.userId === userId) d.revokedAt = new Date(); // tenant boundary
    }
  }

  async listDevices(userId: string): Promise<DeviceRecord[]> {
    return [...this.devices.values()].filter((d) => d.userId === userId); // tenant boundary
  }

  async createPairingNonce(userId: string, nonceHash: string, expiresAt: Date): Promise<PairingNonceRecord> {
    const rec: PairingNonceRecord = { id: randomUUID(), userId, nonceHash, expiresAt, consumedAt: null };
    this.nonces.set(nonceHash, rec);
    return rec;
  }

  async consumePairingNonce(nonceHash: string): Promise<PairingNonceRecord | null> {
    const rec = this.nonces.get(nonceHash);
    if (!rec) return null;
    if (rec.consumedAt) return null; // single-use
    if (rec.expiresAt.getTime() < Date.now()) return null; // expired
    rec.consumedAt = new Date(); // atomic within this single-threaded Map op
    return rec;
  }

  async recordActivityEvent(input: Omit<ActivityEventRecord, 'id'>): Promise<ActivityEventRecord> {
    const rec: ActivityEventRecord = { ...input, id: randomUUID() };
    this.activity.set(rec.id, rec);
    return rec;
  }

  async listActivityEvents(userId: string, sessionId?: string): Promise<ActivityEventRecord[]> {
    let out = [...this.activity.values()].filter((a) => a.userId === userId); // tenant boundary
    if (sessionId) out = out.filter((a) => a.sessionId === sessionId);
    return out;
  }

  async deleteExpiredActivitySnippets(now: Date): Promise<number> {
    let count = 0;
    for (const a of this.activity.values()) {
      if (a.snippet !== null && a.expiresAt.getTime() < now.getTime()) {
        a.snippet = null;
        count++;
      }
    }
    return count;
  }

  /** Test/dev helper: wipe everything. */
  reset(): void {
    this.users.clear();
    this.cards.clear();
    this.connections.clear();
    this.devices.clear();
    this.nonces.clear();
    this.activity.clear();
  }
}
