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
import type { AiProvider, AiProviderState } from './ai-provider';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  settings: UserSettings;
}

export type CardStatus = 'draft' | 'approved';
export type CardSource = 'sample' | 'notion' | 'ai';

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

export interface GenerateCardResult {
  card: CardSpec;
  provider: AiProvider;
  source: 'ai';
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

  // AI provider management
  getAiProvider(): Promise<AiProviderState>;
  putAiProvider(provider: AiProvider, apiKey: string): Promise<AiProviderState>;
  deleteAiProvider(): Promise<void>;
  testAiProvider(): Promise<{ ok: boolean; model: string; latencyMs: number }>;
  generateCard(transcript: string, context?: 'rehearsal' | 'meeting'): Promise<GenerateCardResult>;

  // AI key API (engine routes, plan §3.3)
  getAiKey(): Promise<{ configured: boolean; provider: string | null; model: string | null; updatedAt: string | null }>;
  putAiKey(input: { provider: string; apiKey: string; model?: string | null }): Promise<{ configured: boolean; provider: string; model: string | null; updatedAt: string }>;
  deleteAiKey(): Promise<void>;
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
    headers.Authorization = `Bearer ${token || 'local-dev-token'}`;
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
    return null;
  }

  listActivity(): Promise<ApiActivityEvent[]> {
    return Promise.resolve([]);
  }

  getAiKey(): Promise<{ configured: boolean; provider: string | null; model: string | null; updatedAt: string | null }> {
    return this.request('/api/me/ai-key');
  }

  putAiKey(input: { provider: string; apiKey: string; model?: string | null }): Promise<{ configured: boolean; provider: string; model: string | null; updatedAt: string }> {
    return this.request('/api/me/ai-key', { method: 'PUT', body: JSON.stringify(input) });
  }

  deleteAiKey(): Promise<void> {
    return this.request('/api/me/ai-key', { method: 'DELETE' });
  }

  getAiProvider(): Promise<AiProviderState> {
    return this.request<{ provider: AiProviderState }>('/api/me/ai-provider').then((r) => r.provider);
  }

  putAiProvider(provider: AiProvider, apiKey: string): Promise<AiProviderState> {
    return this.request<{ provider: AiProviderState }>('/api/me/ai-provider', {
      method: 'PUT',
      body: JSON.stringify({ provider, apiKey }),
    }).then((r) => r.provider);
  }

  deleteAiProvider(): Promise<void> {
    return this.request('/api/me/ai-provider', { method: 'DELETE' });
  }

  testAiProvider(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    return this.request<{ ok: boolean; model: string; latencyMs: number }>('/api/me/ai-provider/test', { method: 'POST' });
  }

  generateCard(transcript: string, context: 'rehearsal' | 'meeting' = 'rehearsal'): Promise<GenerateCardResult> {
    return this.request<GenerateCardResult>('/api/ai/generate-card', {
      method: 'POST',
      body: JSON.stringify({ transcript, context }),
    });
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

export class MockApiClient implements ApiClient {
  private user: ApiUser | null = null;
  private cards: ApiCard[] = [];
  private devices: ApiDevice[] = [];
  private activity: ApiActivityEvent[] = [];
  private notionConnection: NotionConnection | null = null;
  private nextId = 1;

  /** Mock AI provider state for testing. */
  private mockAiProvider: AiProviderState = {
    provider: 'bedrock',
    source: 'server',
    keyPreview: 'AKIA...YQSF',
    validatedAt: nowIso(),
    lastError: null,
    serverKeyAvailable: true,
    serverProvider: 'bedrock',
  };

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

  // AI provider mock

  async getAiProvider(): Promise<AiProviderState> {
    return { ...this.mockAiProvider };
  }

  async putAiProvider(provider: AiProvider, apiKey: string): Promise<AiProviderState> {
    // Reject passwords that are too short or have wrong provider prefix.
    if (apiKey.length < 8) {
      throw new ApiError(400, 'invalid_key', 'Key is too short');
    }
    // Simulate key format check
    const knownPrefixes: Record<string, string[]> = {
      gemini: ['AIza'],
      openai: ['sk-'],
      anthropic: ['sk-ant-'],
    };
    if (provider === 'openai' && apiKey.startsWith('sk-ant-')) {
      throw new ApiError(400, 'invalid_key', `Key does not look like a ${provider} key`);
    }
    const prefixes = knownPrefixes[provider];
    if (prefixes && !prefixes.some((p) => apiKey.startsWith(p))) {
      throw new ApiError(400, 'invalid_key', `Key does not look like a ${provider} key`);
    }
    this.mockAiProvider = {
      provider,
      source: 'user',
      keyPreview: '••••' + apiKey.slice(-4),
      validatedAt: nowIso(),
      lastError: null,
      serverKeyAvailable: this.mockAiProvider.serverKeyAvailable,
      serverProvider: this.mockAiProvider.serverProvider,
    };
    return { ...this.mockAiProvider };
  }

  async deleteAiProvider(): Promise<void> {
    if (this.mockAiProvider.serverKeyAvailable) {
      this.mockAiProvider = {
        provider: this.mockAiProvider.serverProvider,
        source: 'server',
        keyPreview: null,
        validatedAt: null,
        lastError: null,
        serverKeyAvailable: true,
        serverProvider: this.mockAiProvider.serverProvider,
      };
    } else {
      this.mockAiProvider = {
        provider: null,
        source: 'none',
        keyPreview: null,
        validatedAt: null,
        lastError: null,
        serverKeyAvailable: false,
        serverProvider: null,
      };
    }
  }

  async testAiProvider(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    if (!this.mockAiProvider.provider) {
      throw new ApiError(400, 'no_provider', 'No AI provider configured');
    }
    return { ok: true, model: this.mockAiProvider.provider, latencyMs: 320 };
  }

  async generateCard(transcript: string, _context?: 'rehearsal' | 'meeting'): Promise<GenerateCardResult> {
    if (!this.mockAiProvider.provider && !this.mockAiProvider.serverKeyAvailable) {
      throw new ApiError(400, 'no_provider', 'No AI provider configured');
    }

    const lower = (transcript || '').toLowerCase();
    const cleanTitle = (transcript || 'Ambient Insight')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    let generatedSpec: CardSpec;

    if (lower.includes('fable') || lower.includes('game') || lower.includes('rpg')) {
      generatedSpec = {
        v: 1,
        id: `gen_${Date.now()}`,
        revision: 1,
        title: cleanTitle.includes('Fable') ? 'Fable (Reboot)' : cleanTitle,
        subtitle: 'Playground Games · Action RPG',
        theme: { accent: '#0F766E' },
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'ENGINE', value: 'ForzaTech', emphasis: true },
              { label: 'PLATFORM', value: 'XSX/PC' },
              { label: 'RATING', value: '94%', delta: { value: '+12%', direction: 'up' } },
            ],
          },
          {
            kind: 'bullets',
            items: [
              'Action RPG reboot developed by Playground Games',
              'Set in dynamic open world of Albion',
              'Published by Xbox Game Studios',
            ],
          },
          {
            kind: 'status_list',
            rows: [
              { text: 'Developer: Playground Games', state: 'ok' },
              { text: 'Source: Wikipedia Knowledge Graph', state: 'info' },
            ],
          },
        ],
      };
    } else if (lower.includes('ranbir') || lower.includes('kapoor') || lower.includes('actor')) {
      generatedSpec = {
        v: 1,
        id: `gen_${Date.now()}`,
        revision: 1,
        title: cleanTitle,
        subtitle: 'Indian Actor & Film Producer',
        theme: { accent: '#6D28D9' },
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'AWARDS', value: '6 Filmfare', emphasis: true },
              { label: 'DEBUT', value: '2007' },
              { label: 'BOX OFFICE', value: '₹917 Cr', delta: { value: 'Peak', direction: 'up' } },
            ],
          },
          {
            kind: 'bullets',
            items: [
              'Leading Indian actor known for diverse dramatic roles',
              'Starred in Rockstar, Barfi!, Sanju, and Animal',
              'Among the highest-paid actors in Hindi cinema',
            ],
          },
          {
            kind: 'status_list',
            rows: [{ text: 'Source: Wikipedia Knowledge Graph', state: 'info' }],
          },
        ],
      };
    } else if (lower.includes('arr') || lower.includes('revenue') || lower.includes('margin') || lower.includes('growth')) {
      generatedSpec = {
        v: 1,
        id: `gen_${Date.now()}`,
        revision: 1,
        title: cleanTitle || 'Revenue & Traction',
        subtitle: 'Stash Live · YC W25 Performance',
        theme: { accent: '#fb8500' },
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'ARR', value: '$148K', emphasis: true },
              { label: 'GROWTH', value: '+28%', delta: { value: 'MoM', direction: 'up' } },
              { label: 'MARGIN', value: '84%' },
            ],
          },
          {
            kind: 'line_chart',
            series: [
              { label: 'Jan', value: 35 },
              { label: '', value: 48 },
              { label: 'Mar', value: 72 },
              { label: '', value: 95 },
              { label: '', value: 120 },
              { label: 'Jun', value: 148 },
            ],
          },
          {
            kind: 'status_list',
            rows: [
              { text: '18 active enterprise pilots', state: 'ok' },
              { text: 'Source: Google Drive · Pitch Deck', state: 'info' },
            ],
          },
        ],
      };
    } else {
      generatedSpec = {
        v: 1,
        id: `gen_${Date.now()}`,
        revision: 1,
        title: cleanTitle,
        subtitle: 'Ambient Contextual Intelligence',
        theme: { accent: '#0F766E' },
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'CONFIDENCE', value: '98.4%', emphasis: true },
              { label: 'LATENCY', value: '380ms' },
              { label: 'GROUNDING', value: 'Active' },
            ],
          },
          {
            kind: 'bullets',
            items: [
              `Live briefing for "${transcript}"`,
              'Synthesized from knowledge aggregator & AI provider',
              'Broadcast overlay positioned over presenter shoulder',
            ],
          },
          {
            kind: 'status_list',
            rows: [{ text: 'Grounded in speech utterance', state: 'ok' }],
          },
        ],
      };
    }

    return {
      card: generatedSpec,
      provider: this.mockAiProvider.provider ?? 'gemini',
      source: 'ai',
    };
  }

  // AI key mock (plan §3.3)
  private mockAiKeyStore: { provider: string | null; apiKey: string | null; model: string | null; updatedAt: string | null } = {
    provider: null,
    apiKey: null,
    model: null,
    updatedAt: null,
  };

  async getAiKey(): Promise<{ configured: boolean; provider: string | null; model: string | null; updatedAt: string | null }> {
    return {
      configured: this.mockAiKeyStore.provider !== null,
      provider: this.mockAiKeyStore.provider,
      model: this.mockAiKeyStore.model,
      updatedAt: this.mockAiKeyStore.updatedAt,
    };
  }

  async putAiKey(input: { provider: string; apiKey: string; model?: string | null }): Promise<{ configured: boolean; provider: string; model: string | null; updatedAt: string }> {
    this.mockAiKeyStore = {
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model ?? null,
      updatedAt: nowIso(),
    };
    return {
      configured: true,
      provider: input.provider,
      model: input.model ?? null,
      updatedAt: nowIso(),
    };
  }

  async deleteAiKey(): Promise<void> {
    this.mockAiKeyStore = { provider: null, apiKey: null, model: null, updatedAt: null };
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

export { HttpApiClient };
