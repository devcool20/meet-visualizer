/**
 * Typed REST client for the engine (plan §4.5 `src/lib/api.ts`).
 *
 * Mirrors the confirmed routes in `engine/src/routes/*.ts`. Every call
 * (except pairing/nonce, which the extension calls unauthenticated, and
 * `health`) sends `Authorization: Bearer <accessToken>` — the same header
 * shape `engine/src/auth/middleware.ts`'s `requireAuth` expects.
 *
 * In mock mode (`isMockMode()`, see `src/lib/env.ts`) every method is
 * served from an in-memory store seeded from `SAMPLE_CARDS`
 * (`@stash/card-core`), so the whole dashboard works with zero backend.
 * This mirrors the engine's own `MockAuthProvider` + in-memory `Store`
 * pattern used for `STASH_LOCAL` dev.
 */
import { SAMPLE_CARDS } from '@stash/card-core';
import type { CardSpec, UserSettings } from '@stash/card-spec';
import { DEFAULT_USER_SETTINGS } from '@stash/card-spec';
import { isMockMode, apiBaseUrl } from './env';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  settings: UserSettings;
}

export type CardStatus = 'draft' | 'approved';
export type CardSource = 'sample' | 'notion';

export interface ApiCard {
  id: string;
  userId: string;
  title: string;
  spec: CardSpec;
  phrases: string[];
  phrasesEditedByUser: boolean;
  status: CardStatus;
  approvedAt: string | null;
  revision: number;
  enabled: boolean;
  source: CardSource;
  sourceRef: string | null;
  sourceRevision: string | null;
  cooldownMs: number;
}

export interface ApiDevice {
  id: string;
  label: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

export interface ApiActivityEvent {
  id: string;
  sessionId: string;
  kind: 'fired' | 'near_miss' | 'suppressed_cooldown';
  cardId: string | null;
  score: number | null;
  snippet: string | null;
  createdAt: string;
}

export interface HealthResponse {
  status: string;
  mode: 'local' | 'production';
  mocks: { notion: boolean; gemini: boolean; supabase: boolean };
  timestamp: string;
}

export interface NotionConnection {
  workspaceId: string;
  workspaceName: string;
  selectedSources: string[];
  lastSyncedAt: string | null;
  syncError: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface ApiClient {
  health(): Promise<HealthResponse>;

  getMe(): Promise<ApiUser>;
  bootstrap(): Promise<{ user: ApiUser; seeded: boolean }>;
  updateSettings(patch: Partial<UserSettings>): Promise<ApiUser>;

  listCards(opts?: { status?: CardStatus; enabledOnly?: boolean }): Promise<ApiCard[]>;
  getCard(id: string): Promise<ApiCard>;
  createCard(input: Partial<ApiCard> & { title: string; spec: CardSpec }): Promise<ApiCard>;
  updateCard(id: string, patch: Partial<ApiCard>): Promise<ApiCard>;
  approveCard(id: string): Promise<ApiCard>;
  deleteCard(id: string): Promise<void>;

  requestPairingNonce(): Promise<{ nonce: string; expiresIn: number }>;
  listDevices(): Promise<ApiDevice[]>;
  revokeDevice(id: string): Promise<void>;

  notionAuthorize(): Promise<{ url: string }>;
  notionSync(dataSourceId: string): Promise<{ ok: boolean }>;
  deleteNotionConnection(): Promise<void>;
  getNotionConnection(): Promise<NotionConnection | null>;

  listActivity(sessionId?: string): Promise<ApiActivityEvent[]>;
}

/* ------------------------------------------------------------------ */
/* Real HTTP client                                                    */
/* ------------------------------------------------------------------ */

class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string, private readonly getAccessToken: () => Promise<string | null>) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(this.baseUrl + path, { ...init, headers });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, (body as { error?: string }).error ?? 'unknown_error', (body as { message?: string }).message);
    }
    return body as T;
  }

  health(): Promise<HealthResponse> {
    return this.request('/health');
  }

  getMe(): Promise<ApiUser> {
    return this.request<{ user: ApiUser }>('/api/me').then((r) => r.user);
  }

  bootstrap(): Promise<{ user: ApiUser; seeded: boolean }> {
    return this.request('/api/me/bootstrap', { method: 'POST' });
  }

  updateSettings(patch: Partial<UserSettings>): Promise<ApiUser> {
    return this.request<{ user: ApiUser }>('/api/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).then((r) => r.user);
  }

  listCards(opts?: { status?: CardStatus; enabledOnly?: boolean }): Promise<ApiCard[]> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.enabledOnly) params.set('enabledOnly', 'true');
    const qs = params.toString();
    return this.request<{ cards: ApiCard[] }>(`/api/cards${qs ? `?${qs}` : ''}`).then((r) => r.cards);
  }

  getCard(id: string): Promise<ApiCard> {
    return this.request<{ card: ApiCard }>(`/api/cards/${id}`).then((r) => r.card);
  }

  createCard(input: Partial<ApiCard> & { title: string; spec: CardSpec }): Promise<ApiCard> {
    return this.request<{ card: ApiCard }>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.card);
  }

  updateCard(id: string, patch: Partial<ApiCard>): Promise<ApiCard> {
    return this.request<{ card: ApiCard }>(`/api/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).then((r) => r.card);
  }

  approveCard(id: string): Promise<ApiCard> {
    return this.request<{ card: ApiCard }>(`/api/cards/${id}/approve`, { method: 'POST' }).then((r) => r.card);
  }

  deleteCard(id: string): Promise<void> {
    return this.request(`/api/cards/${id}`, { method: 'DELETE' });
  }

  requestPairingNonce(): Promise<{ nonce: string; expiresIn: number }> {
    return this.request('/api/extension/pairing-nonce', { method: 'POST' });
  }

  listDevices(): Promise<ApiDevice[]> {
    return this.request<{ devices: ApiDevice[] }>('/api/extension/devices').then((r) => r.devices);
  }

  revokeDevice(id: string): Promise<void> {
    return this.request(`/api/extension/devices/${id}/revoke`, { method: 'POST' });
  }

  notionAuthorize(): Promise<{ url: string }> {
    return this.request('/api/notion/authorize');
  }

  notionSync(dataSourceId: string): Promise<{ ok: boolean }> {
    return this.request('/api/notion/sync', { method: 'POST', body: JSON.stringify({ dataSourceId }) });
  }

  deleteNotionConnection(): Promise<void> {
    return this.request('/api/notion/connection', { method: 'DELETE' });
  }

  async getNotionConnection(): Promise<NotionConnection | null> {
    // No dedicated GET route is exposed by the engine for reading connection
    // state directly; the dashboard derives it from `/api/me` in a future
    // iteration. For now this is surfaced via bootstrap/me metadata once
    // added server-side — kept as a stub returning null on the real client
    // so the Integrations screen degrades to "not connected" rather than
    // erroring.
    return null;
  }

  listActivity(): Promise<ApiActivityEvent[]> {
    // No activity-list route confirmed in engine/src/routes at time of
    // writing; return an empty list on the real client until one lands.
    return Promise.resolve([]);
  }
}

/* ------------------------------------------------------------------ */
/* Mock client                                                         */
/* ------------------------------------------------------------------ */

function nowIso(): string {
  return new Date().toISOString();
}

function cloneSpec(spec: CardSpec): CardSpec {
  return JSON.parse(JSON.stringify(spec));
}

class MockApiClient implements ApiClient {
  private user: ApiUser | null = null;
  private cards: ApiCard[] = [];
  private devices: ApiDevice[] = [];
  private activity: ApiActivityEvent[] = [];
  private notionConnection: NotionConnection | null = null;
  private nextId = 1;

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private ensureUser(): ApiUser {
    if (!this.user) {
      this.user = {
        id: 'local-dev-user',
        email: 'dev@stash.local',
        name: 'Local Dev',
        createdAt: nowIso(),
        settings: { ...DEFAULT_USER_SETTINGS },
      };
    }
    return this.user;
  }

  async health(): Promise<HealthResponse> {
    return {
      status: 'ok',
      mode: 'local',
      mocks: { notion: true, gemini: true, supabase: true },
      timestamp: nowIso(),
    };
  }

  async getMe(): Promise<ApiUser> {
    return this.ensureUser();
  }

  async bootstrap(): Promise<{ user: ApiUser; seeded: boolean }> {
    const alreadyExisted = this.user !== null;
    const user = this.ensureUser();
    let seeded = false;
    if (!alreadyExisted) {
      this.cards = SAMPLE_CARDS.map((sample) => ({
        id: this.id('card'),
        userId: user.id,
        title: sample.spec.title,
        spec: cloneSpec(sample.spec),
        phrases: [...sample.phrases],
        phrasesEditedByUser: false,
        status: 'approved',
        approvedAt: nowIso(),
        revision: 1,
        enabled: true,
        source: 'sample',
        sourceRef: null,
        sourceRevision: null,
        cooldownMs: 120_000,
      }));
      seeded = true;
    }
    return { user, seeded };
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<ApiUser> {
    const user = this.ensureUser();
    user.settings = { ...user.settings, ...patch };
    return user;
  }

  async listCards(opts?: { status?: CardStatus; enabledOnly?: boolean }): Promise<ApiCard[]> {
    let list = this.cards;
    if (opts?.status) list = list.filter((c) => c.status === opts.status);
    if (opts?.enabledOnly) list = list.filter((c) => c.enabled);
    return list;
  }

  async getCard(id: string): Promise<ApiCard> {
    const card = this.cards.find((c) => c.id === id);
    if (!card) throw new ApiError(404, 'not_found');
    return card;
  }

  async createCard(input: Partial<ApiCard> & { title: string; spec: CardSpec }): Promise<ApiCard> {
    const user = this.ensureUser();
    const card: ApiCard = {
      id: this.id('card'),
      userId: user.id,
      title: input.title,
      spec: cloneSpec(input.spec),
      phrases: input.phrases ?? [],
      phrasesEditedByUser: input.phrasesEditedByUser ?? false,
      status: input.status ?? 'draft',
      approvedAt: input.status === 'approved' ? nowIso() : null,
      revision: 1,
      enabled: input.enabled ?? true,
      source: input.source ?? 'notion',
      sourceRef: input.sourceRef ?? null,
      sourceRevision: input.sourceRevision ?? null,
      cooldownMs: input.cooldownMs ?? 120_000,
    };
    this.cards.push(card);
    return card;
  }

  async updateCard(id: string, patch: Partial<ApiCard>): Promise<ApiCard> {
    const idx = this.cards.findIndex((c) => c.id === id);
    if (idx === -1) throw new ApiError(400, 'update_failed', 'not_found');
    const existing = this.cards[idx];
    const updated: ApiCard = {
      ...existing,
      ...patch,
      spec: patch.spec ? cloneSpec(patch.spec) : existing.spec,
      revision: existing.revision + 1,
      phrasesEditedByUser: patch.phrases ? true : existing.phrasesEditedByUser,
    };
    this.cards[idx] = updated;
    return updated;
  }

  async approveCard(id: string): Promise<ApiCard> {
    return this.updateCard(id, { status: 'approved', approvedAt: nowIso() });
  }

  async deleteCard(id: string): Promise<void> {
    this.cards = this.cards.filter((c) => c.id !== id);
  }

  async requestPairingNonce(): Promise<{ nonce: string; expiresIn: number }> {
    return { nonce: this.id('nonce'), expiresIn: 60 };
  }

  async listDevices(): Promise<ApiDevice[]> {
    return this.devices;
  }

  async revokeDevice(id: string): Promise<void> {
    this.devices = this.devices.map((d) => (d.id === id ? { ...d, revokedAt: nowIso() } : d));
  }

  async notionAuthorize(): Promise<{ url: string }> {
    return { url: 'https://api.notion.com/v1/oauth/authorize?mock=1' };
  }

  async notionSync(): Promise<{ ok: boolean }> {
    if (this.notionConnection) {
      this.notionConnection = { ...this.notionConnection, lastSyncedAt: nowIso(), syncError: null };
    }
    return { ok: true };
  }

  async deleteNotionConnection(): Promise<void> {
    this.notionConnection = null;
  }

  async getNotionConnection(): Promise<NotionConnection | null> {
    return this.notionConnection;
  }

  async listActivity(sessionId?: string): Promise<ApiActivityEvent[]> {
    if (sessionId) return this.activity.filter((e) => e.sessionId === sessionId);
    return this.activity;
  }

  /** Test/demo-only helper: seed a fake device so the Devices list isn't empty. */
  __addMockDevice(label: string): ApiDevice {
    const device: ApiDevice = {
      id: this.id('device'),
      label,
      lastSeenAt: nowIso(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      revokedAt: null,
    };
    this.devices.push(device);
    return device;
  }
}

let cachedApiClient: ApiClient | null = null;

/**
 * Lazily builds the singleton `ApiClient`. `getAccessToken` is supplied by
 * the auth layer (`src/lib/auth.ts`) so this module never imports it
 * directly, keeping the two independently testable.
 */
export function getApiClient(getAccessToken: () => Promise<string | null>): ApiClient {
  if (cachedApiClient) return cachedApiClient;
  cachedApiClient = isMockMode() ? new MockApiClient() : new HttpApiClient(apiBaseUrl(), getAccessToken);
  return cachedApiClient;
}

/** Test-only escape hatch to reset the memoized client between tests. */
export function __resetApiClientForTests(): void {
  cachedApiClient = null;
}

export { MockApiClient, HttpApiClient };
