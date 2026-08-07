import type { CardSpec, UserSettings } from '@stash/card-spec';

/**
 * Domain types for the datastore layer (plan §2.1).
 *
 * These mirror the Prisma schema but are declared independently so that
 * `MemoryStore` (used by STASH_LOCAL and by every unit/integration test) does
 * not need a live Postgres connection or generated Prisma types to satisfy
 * the same `Store` interface `PrismaStore` implements.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  settings: UserSettings;
}

export interface ConnectionRecord {
  id: string;
  userId: string;
  provider: string; // 'notion'
  accessToken: string; // encrypted at rest
  refreshToken: string | null; // encrypted at rest
  tokenExpiresAt: Date | null;
  workspaceId: string;
  workspaceName: string;
  selectedSources: string[];
  lastSyncedAt: Date | null;
  syncError: string | null;
}

export type CardStatus = 'draft' | 'approved';
export type CardSource = 'sample' | 'notion';

export interface CardRecord {
  id: string;
  userId: string;
  title: string;
  spec: CardSpec;
  phrases: string[];
  phrasesEditedByUser: boolean;
  embedding: number[] | null;
  status: CardStatus;
  approvedAt: Date | null;
  revision: number;
  enabled: boolean;
  source: CardSource;
  sourceRef: string | null;
  sourceRevision: string | null;
  cooldownMs: number;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  tokenHash: string;
  label: string;
  lastSeenAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PairingNonceRecord {
  id: string;
  userId: string;
  nonceHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface AiCredentialRecord {
  id: string;
  userId: string;
  provider: string; // 'gemini' | 'openai' | 'anthropic'
  apiKey: string; // AES-256-GCM encrypted
  model: string | null; // optional override
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityKind = 'fired' | 'near_miss' | 'suppressed_cooldown';

export interface ActivityEventRecord {
  id: string;
  userId: string;
  sessionId: string;
  kind: ActivityKind;
  cardId: string | null;
  score: number | null;
  snippet: string | null; // only set when the user has opted in — §2.7
  createdAt: Date;
  expiresAt: Date;
}

/**
 * The datastore boundary. Every method here is scoped by userId where
 * tenant data is involved — that scoping, not RLS, is the tenant boundary
 * (plan §2.1 RLS caveat). `src/test/cross-tenant.test.ts` asserts it holds.
 */
export interface Store {
  // Users
  createUser(input: { id: string; email: string; name?: string | null; settings: UserSettings }): Promise<UserRecord>;
  getUser(userId: string): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  updateUserSettings(userId: string, settings: UserSettings): Promise<UserRecord>;

  // Cards — every method takes/filters by userId.
  createCard(userId: string, input: Omit<CardRecord, 'id' | 'userId' | 'revision'> & { revision?: number }): Promise<CardRecord>;
  getCard(userId: string, cardId: string): Promise<CardRecord | null>;
  listCards(userId: string, opts?: { enabledOnly?: boolean; status?: CardStatus }): Promise<CardRecord[]>;
  updateCard(userId: string, cardId: string, patch: Partial<CardRecord>): Promise<CardRecord>;
  deleteCard(userId: string, cardId: string): Promise<void>;
  /** Cosine-similarity search scoped to a single user's cards (Tier 2). */
  searchCardsByEmbedding(userId: string, embedding: number[], limit: number): Promise<Array<{ card: CardRecord; score: number }>>;

  // Connections (Notion OAuth)
  upsertConnection(userId: string, input: Omit<ConnectionRecord, 'id' | 'userId'>): Promise<ConnectionRecord>;
  getConnection(userId: string, provider: string): Promise<ConnectionRecord | null>;
  listConnectionsForReconciliation(): Promise<ConnectionRecord[]>;
  deleteConnection(userId: string, provider: string): Promise<void>;

  // Devices
  createDevice(userId: string, input: Omit<DeviceRecord, 'id' | 'userId'>): Promise<DeviceRecord>;
  getDeviceByTokenHash(tokenHash: string): Promise<DeviceRecord | null>;
  touchDevice(deviceId: string): Promise<void>;
  rotateDeviceToken(deviceId: string, newTokenHash: string, newExpiresAt: Date): Promise<DeviceRecord>;
  revokeDevice(userId: string, deviceId: string): Promise<void>;
  revokeAllDevicesForUser(userId: string): Promise<void>;
  listDevices(userId: string): Promise<DeviceRecord[]>;

  // Pairing nonces
  createPairingNonce(userId: string, nonceHash: string, expiresAt: Date): Promise<PairingNonceRecord>;
  /** Atomically consumes a nonce; returns null if missing/expired/already used. */
  consumePairingNonce(nonceHash: string): Promise<PairingNonceRecord | null>;

  // Activity
  recordActivityEvent(input: Omit<ActivityEventRecord, 'id'>): Promise<ActivityEventRecord>;
  listActivityEvents(userId: string, sessionId?: string): Promise<ActivityEventRecord[]>;
  deleteExpiredActivitySnippets(now: Date): Promise<number>;

  // AI credentials
  getAiCredential(userId: string): Promise<AiCredentialRecord | null>;
  upsertAiCredential(userId: string, input: { provider: string; apiKey: string; model?: string | null }): Promise<AiCredentialRecord>;
  deleteAiCredential(userId: string): Promise<void>;
}
