import { PrismaClient, Prisma } from '@prisma/client';
import type { UserSettings, CardSpec } from '@stash/card-spec';
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

/**
 * Prisma-backed Store (plan §2.1).
 *
 * `Card.embedding` is declared `Unsupported("vector(768)")` in schema.prisma
 * because Prisma has no native pgvector scalar type. That means the
 * generated client omits `embedding` from create/update input types
 * entirely, so every read/write that touches it goes through `$queryRaw` /
 * `$executeRaw` with a parameterised vector literal. Everything else uses
 * the normal generated client.
 *
 * Tenant boundary: every method takes/filters by userId in the WHERE clause.
 * This is enforced here, not by RLS — see the migration comment and
 * schema.prisma header for why.
 */
export class PrismaStore implements Store {
  constructor(private prisma: PrismaClient) {}

  private rowToCard(row: any): CardRecord {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      spec: row.spec as CardSpec,
      phrases: row.phrases ?? [],
      phrasesEditedByUser: row.phrasesEditedByUser,
      embedding: row.embedding ? parsePgVector(row.embedding) : null,
      status: row.status as CardStatus,
      approvedAt: row.approvedAt,
      revision: row.revision,
      enabled: row.enabled,
      source: row.source,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      cooldownMs: row.cooldownMs,
    };
  }

  async createUser(input: { id: string; email: string; name?: string | null; settings: UserSettings }): Promise<UserRecord> {
    const u = await this.prisma.user.create({
      data: { id: input.id, email: input.email, name: input.name ?? null, settings: input.settings as any },
    });
    return { ...u, settings: u.settings as unknown as UserSettings };
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? { ...u, settings: u.settings as unknown as UserSettings } : null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { email } });
    return u ? { ...u, settings: u.settings as unknown as UserSettings } : null;
  }

  async updateUserSettings(userId: string, settings: UserSettings): Promise<UserRecord> {
    const u = await this.prisma.user.update({ where: { id: userId }, data: { settings: settings as any } });
    return { ...u, settings: u.settings as unknown as UserSettings };
  }

  async createCard(
    userId: string,
    input: Omit<CardRecord, 'id' | 'userId' | 'revision'> & { revision?: number },
  ): Promise<CardRecord> {
    const created = await this.prisma.card.create({
      data: {
        userId,
        title: input.title,
        spec: input.spec as any,
        phrases: input.phrases,
        phrasesEditedByUser: input.phrasesEditedByUser,
        status: input.status,
        approvedAt: input.approvedAt,
        revision: input.revision ?? 1,
        enabled: input.enabled,
        source: input.source,
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        cooldownMs: input.cooldownMs,
      },
    });
    if (input.embedding) await this.setEmbedding(userId, created.id, input.embedding);
    const rec = this.rowToCard(created);
    rec.embedding = input.embedding ?? null;
    return rec;
  }

  async getCard(userId: string, cardId: string): Promise<CardRecord | null> {
    const rows: any[] = await this.prisma.$queryRaw`
      SELECT id, "userId", title, spec, phrases, "phrasesEditedByUser",
             embedding::text as embedding, status, "approvedAt", revision,
             enabled, source, "sourceRef", "sourceRevision", "cooldownMs"
      FROM "Card" WHERE id = ${cardId} AND "userId" = ${userId}
    `;
    return rows[0] ? this.rowToCard(rows[0]) : null;
  }

  async listCards(userId: string, opts?: { enabledOnly?: boolean; status?: CardStatus }): Promise<CardRecord[]> {
    const where: Prisma.CardWhereInput = { userId };
    if (opts?.enabledOnly) where.enabled = true;
    if (opts?.status) where.status = opts.status;
    const cards = await this.prisma.card.findMany({ where });
    // embedding omitted by the generated client; fetch separately if needed by callers.
    return Promise.all(cards.map(async (c) => this.getCard(userId, c.id) as Promise<CardRecord>));
  }

  async updateCard(userId: string, cardId: string, patch: Partial<CardRecord>): Promise<CardRecord> {
    const existing = await this.getCard(userId, cardId);
    if (!existing) throw new Error(`Card ${cardId} not found for user`);
    const data: Prisma.CardUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.spec !== undefined) data.spec = patch.spec as any;
    if (patch.phrases !== undefined) data.phrases = { set: patch.phrases };
    if (patch.phrasesEditedByUser !== undefined) data.phrasesEditedByUser = patch.phrasesEditedByUser;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt;
    if (patch.revision !== undefined) data.revision = patch.revision;
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.sourceRef !== undefined) data.sourceRef = patch.sourceRef;
    if (patch.sourceRevision !== undefined) data.sourceRevision = patch.sourceRevision;
    if (patch.cooldownMs !== undefined) data.cooldownMs = patch.cooldownMs;

    await this.prisma.card.update({ where: { id: cardId }, data });
    if (patch.embedding !== undefined) {
      if (patch.embedding === null) await this.clearEmbedding(cardId);
      else await this.setEmbedding(userId, cardId, patch.embedding);
    }
    return (await this.getCard(userId, cardId))!;
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    await this.prisma.card.deleteMany({ where: { id: cardId, userId } });
  }

  private async setEmbedding(userId: string, cardId: string, embedding: number[]): Promise<void> {
    const literal = toPgVectorLiteral(embedding);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Card" SET embedding = $1::vector WHERE id = $2 AND "userId" = $3`,
      literal,
      cardId,
      userId,
    );
  }

  private async clearEmbedding(cardId: string): Promise<void> {
    await this.prisma.$executeRaw`UPDATE "Card" SET embedding = NULL WHERE id = ${cardId}`;
  }

  async searchCardsByEmbedding(
    userId: string,
    embedding: number[],
    limit: number,
  ): Promise<Array<{ card: CardRecord; score: number }>> {
    const literal = toPgVectorLiteral(embedding);
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `
      SELECT id, "userId", title, spec, phrases, "phrasesEditedByUser",
             embedding::text as embedding, status, "approvedAt", revision,
             enabled, source, "sourceRef", "sourceRevision", "cooldownMs",
             1 - (embedding <=> $1::vector) as score
      FROM "Card"
      WHERE "userId" = $2 AND enabled = true AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3
      `,
      literal,
      userId,
      limit,
    );
    return rows.map((row) => ({ card: this.rowToCard(row), score: Number(row.score) }));
  }

  async upsertConnection(userId: string, input: Omit<ConnectionRecord, 'id' | 'userId'>): Promise<ConnectionRecord> {
    const c = await this.prisma.connection.upsert({
      where: { userId_provider_workspaceId: { userId, provider: input.provider, workspaceId: input.workspaceId } },
      create: {
        userId,
        provider: input.provider,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt,
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        selectedSources: input.selectedSources as any,
        lastSyncedAt: input.lastSyncedAt,
        syncError: input.syncError,
      },
      update: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt,
        workspaceName: input.workspaceName,
        selectedSources: input.selectedSources as any,
        lastSyncedAt: input.lastSyncedAt,
        syncError: input.syncError,
      },
    });
    return { ...c, selectedSources: c.selectedSources as unknown as string[] };
  }

  async getConnection(userId: string, provider: string): Promise<ConnectionRecord | null> {
    const c = await this.prisma.connection.findFirst({ where: { userId, provider } });
    return c ? { ...c, selectedSources: c.selectedSources as unknown as string[] } : null;
  }

  async listConnectionsForReconciliation(): Promise<ConnectionRecord[]> {
    const cs = await this.prisma.connection.findMany();
    return cs.map((c) => ({ ...c, selectedSources: c.selectedSources as unknown as string[] }));
  }

  async deleteConnection(userId: string, provider: string): Promise<void> {
    await this.prisma.connection.deleteMany({ where: { userId, provider } });
  }

  async createDevice(userId: string, input: Omit<DeviceRecord, 'id' | 'userId'>): Promise<DeviceRecord> {
    return this.prisma.device.create({
      data: {
        userId,
        tokenHash: input.tokenHash,
        label: input.label,
        lastSeenAt: input.lastSeenAt,
        expiresAt: input.expiresAt,
        revokedAt: input.revokedAt,
      },
    });
  }

  async getDeviceByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
    return this.prisma.device.findUnique({ where: { tokenHash } });
  }

  async touchDevice(deviceId: string): Promise<void> {
    await this.prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
  }

  async rotateDeviceToken(deviceId: string, newTokenHash: string, newExpiresAt: Date): Promise<DeviceRecord> {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { tokenHash: newTokenHash, expiresAt: newExpiresAt },
    });
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.device.updateMany({ where: { id: deviceId, userId }, data: { revokedAt: new Date() } });
  }

  async revokeAllDevicesForUser(userId: string): Promise<void> {
    await this.prisma.device.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
  }

  async listDevices(userId: string): Promise<DeviceRecord[]> {
    return this.prisma.device.findMany({ where: { userId } });
  }

  async createPairingNonce(userId: string, nonceHash: string, expiresAt: Date): Promise<PairingNonceRecord> {
    return this.prisma.pairingNonce.create({ data: { userId, nonceHash, expiresAt } });
  }

  async consumePairingNonce(nonceHash: string): Promise<PairingNonceRecord | null> {
    // Atomic single-use consume: only succeeds if not yet consumed and not expired.
    const result = await this.prisma.pairingNonce.updateMany({
      where: { nonceHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.prisma.pairingNonce.findUnique({ where: { nonceHash } });
  }

  async recordActivityEvent(input: Omit<ActivityEventRecord, 'id'>): Promise<ActivityEventRecord> {
    const created = await this.prisma.activityEvent.create({ data: input });
    return created as unknown as ActivityEventRecord;
  }

  async listActivityEvents(userId: string, sessionId?: string): Promise<ActivityEventRecord[]> {
    const rows = await this.prisma.activityEvent.findMany({ where: { userId, ...(sessionId ? { sessionId } : {}) } });
    return rows as unknown as ActivityEventRecord[];
  }

  async deleteExpiredActivitySnippets(now: Date): Promise<number> {
    const result = await this.prisma.activityEvent.updateMany({
      where: { snippet: { not: null }, expiresAt: { lt: now } },
      data: { snippet: null },
    });
    return result.count;
  }
}

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function parsePgVector(text: string): number[] {
  return text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .filter((s) => s.length > 0)
    .map(Number);
}
