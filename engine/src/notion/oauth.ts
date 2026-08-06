import { randomBytes } from 'node:crypto';
import type { Store } from '../db/types.js';
import type { Encryptor } from '../util/encryption.js';
import { config } from '../config.js';

/**
 * Notion OAuth (plan §2.6): `state` param + callback-to-user binding,
 * encrypted access/refresh tokens with rotation.
 *
 * `state` is generated per-authorize-request and bound to the initiating
 * userId in an in-memory TTL map (5 minutes — OAuth round trips are quick;
 * losing state on a process restart mid-flow just means the user retries).
 * The callback handler rejects any `state` it does not recognize, which is
 * what prevents a callback from binding tokens to the wrong user.
 */
export interface NotionOAuthClient {
  exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
    workspaceId: string;
    workspaceName: string;
  }>;
  refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
  }>;
}

export class NotionOAuthService {
  private pendingStates = new Map<string, { userId: string; expiresAt: number }>();

  constructor(private store: Store, private client: NotionOAuthClient, private encryptor: Encryptor) {}

  createAuthorizeState(userId: string): string {
    const state = randomBytes(24).toString('base64url');
    this.pendingStates.set(state, { userId, expiresAt: Date.now() + 5 * 60_000 });
    return state;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.notionClientId,
      redirect_uri: config.notionRedirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  /** Validates `state`, exchanges `code`, encrypts + stores the Connection. Throws on invalid/expired state. */
  async handleCallback(state: string, code: string): Promise<{ userId: string }> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state); // single-use regardless of outcome
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error('invalid_or_expired_oauth_state');
    }
    const token = await this.client.exchangeCode(code);
    await this.store.upsertConnection(pending.userId, {
      provider: 'notion',
      accessToken: this.encryptor.encrypt(token.accessToken),
      refreshToken: token.refreshToken ? this.encryptor.encrypt(token.refreshToken) : null,
      tokenExpiresAt: token.tokenExpiresAt,
      workspaceId: token.workspaceId,
      workspaceName: token.workspaceName,
      selectedSources: [],
      lastSyncedAt: null,
      syncError: null,
    });
    return { userId: pending.userId };
  }

  /** Rotation: call before token expiry; stores the NEW refresh token (Notion rotates it). */
  async refreshIfNeeded(userId: string): Promise<void> {
    const connection = await this.store.getConnection(userId, 'notion');
    if (!connection?.refreshToken) return;
    if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() - Date.now() > 10 * 60_000) return;

    const decryptedRefresh = this.encryptor.decrypt(connection.refreshToken);
    const refreshed = await this.client.refresh(decryptedRefresh);
    await this.store.upsertConnection(userId, {
      ...connection,
      accessToken: this.encryptor.encrypt(refreshed.accessToken),
      refreshToken: refreshed.refreshToken ? this.encryptor.encrypt(refreshed.refreshToken) : connection.refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
    });
  }
}

/** Deterministic mock — no network call, used in STASH_LOCAL and tests. */
export class MockNotionOAuthClient implements NotionOAuthClient {
  async exchangeCode(code: string) {
    return {
      accessToken: `mock-access-${code}`,
      refreshToken: `mock-refresh-${code}`,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      workspaceId: 'mock-workspace',
      workspaceName: 'Mock Workspace',
    };
  }
  async refresh(refreshToken: string) {
    return {
      accessToken: `mock-access-rotated-${refreshToken}`,
      refreshToken: `mock-refresh-rotated-${refreshToken}`,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
  }
}
