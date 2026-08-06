import type { ClientMsg, ServerMsg, UserSettings } from '@stash/card-spec';
import { parseClientMsg } from '@stash/card-spec';
import type { Store, CardRecord } from '../db/types.js';
import { DeviceAuth } from '../auth/pairing.js';
import { MatchPipeline } from '../matching/pipeline.js';
import { Tier2Matcher } from '../matching/tier2.js';
import type { Tier3Confirmer } from '../matching/tier3.js';
import { TranscriptWindow } from '../matching/transcript-window.js';
import { RateLimiter } from '../util/rate-limiter.js';
import { pubSubService } from '../services/pubsub.js';
import { config } from '../config.js';

/**
 * Minimal socket interface the session depends on — lets tests drive a
 * `Session` with a fake socket instead of a real `ws.WebSocket` (constraint:
 * "tests must pass with no network access").
 */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message' | 'close' | 'error', cb: (...args: any[]) => void): void;
}

export const WS_OPEN = 1;

export interface SessionDeps {
  store: Store;
  deviceAuth: DeviceAuth;
  tier2: Tier2Matcher;
  tier3: Tier3Confirmer;
  clock?: () => number;
}

/**
 * One WS connection's protocol state machine (plan §2.5).
 *
 * - Nothing but `hello` accepted until authenticated (5s timeout).
 * - Heartbeat every 20s (also keeps the extension's MV3 service worker
 *   alive — do not change this interval without reading plan §3.1).
 * - Interim transcripts are debounced 400ms and used only for prewarm;
 *   finals are flushed immediately.
 * - Per-connection state only — the `MatchPipeline` (cooldown, phrase index)
 *   lives here and is discarded on disconnect, which is also how full
 *   transcripts stay non-persistent (plan §2.7).
 */
export class Session {
  private authenticated = false;
  private userId: string | null = null;
  private settings: UserSettings | null = null;
  private window = new TranscriptWindow(config.tier1MaxWindowChars);
  private pipeline: MatchPipeline | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private interimDebounceTimer: NodeJS.Timeout | null = null;
  private msgRateLimiter = new RateLimiter(config.wsMessageRateLimitPerSecond, 1000);
  private unsubscribeInvalidation: (() => void) | null = null;
  private closed = false;
  private sessionId: string;

  constructor(private ws: WsLike, private deps: SessionDeps, sessionId?: string) {
    this.sessionId = sessionId ?? Math.random().toString(36).slice(2);
    this.ws.on('message', (data: any) => this.handleRaw(data));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('error', () => this.handleClose());

    this.helloTimer = setTimeout(() => {
      if (!this.authenticated) {
        this.sendError('auth_failed', 'No hello received within 5s');
        this.ws.close(4001, 'auth_timeout');
      }
    }, config.helloTimeoutMs);
  }

  private now(): number {
    return this.deps.clock ? this.deps.clock() : Date.now();
  }

  private send(msg: ServerMsg): void {
    if (this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private sendError(code: 'auth_failed' | 'token_expired' | 'rate_limited' | 'internal', message: string): void {
    this.send({ t: 'error', code, message });
  }

  private handleRaw(data: string | Buffer): void {
    if (this.closed) return;
    if (!this.msgRateLimiter.tryConsume('ws')) {
      this.sendError('rate_limited', 'Too many messages');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
    } catch {
      this.sendError('internal', 'Malformed JSON');
      return;
    }
    const result = parseClientMsg(parsed);
    if (!result.ok) {
      this.sendError('internal', `Invalid message: ${result.error}`);
      return;
    }
    this.handleMessage(result.value).catch((err) => {
      console.error('[WS Session] handler error:', err);
      this.sendError('internal', 'Internal error');
    });
  }

  private async handleMessage(msg: ClientMsg): Promise<void> {
    if (!this.authenticated && msg.t !== 'hello') {
      this.sendError('auth_failed', 'Send hello first');
      return;
    }
    switch (msg.t) {
      case 'hello':
        await this.handleHello(msg.token);
        return;
      case 'ping':
        this.send({ t: 'pong' });
        return;
      case 'dismiss':
        this.pipeline?.dismiss(msg.cardId);
        return;
      case 'transcript':
        await this.handleTranscript(msg.text, msg.final);
        return;
    }
  }

  private async handleHello(token: string): Promise<void> {
    if (this.authenticated) return; // hello is only valid once
    const result = config.isLocal ? this.localAuth(token) : await this.deps.deviceAuth.authenticate(token);
    if (!result) {
      this.sendError('auth_failed', 'Invalid or revoked device token');
      this.ws.close(4001, 'auth_failed');
      return;
    }
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.authenticated = true;
    this.userId = result.userId;

    const user = await this.deps.store.getUser(result.userId);
    this.settings = user?.settings ?? ({ sensitivity: 'balanced', position: 'auto', autoDismissMs: 12_000, reducedMotion: false, storeSnippets: false } as UserSettings);

    const cards = await this.deps.store.listCards(result.userId, { enabledOnly: true });
    this.pipeline = new MatchPipeline(this.deps.store, result.userId, this.deps.tier2, this.deps.tier3, cards, this.settings);

    this.send({ t: 'ready', userId: result.userId, cardCount: cards.length });
    this.send({ t: 'config', settings: this.settings, token: result.refreshedToken });

    this.unsubscribeInvalidation = pubSubService.subscribeInvalidation(result.userId, (invalidateMsg) => {
      this.onInvalidate(invalidateMsg.cardIds);
    });

    this.heartbeatTimer = setInterval(() => {
      this.send({ t: 'pong' });
    }, config.heartbeatIntervalMs);
  }

  /** STASH_LOCAL=1: no WS auth (deliverable 9) — any token maps to the seeded local user. */
  private localAuth(_token: string): { userId: string; refreshedToken?: string } {
    return { userId: 'local-dev-user' };
  }

  private async onInvalidate(cardIds: string[]): Promise<void> {
    if (!this.userId) return;
    const cards = await this.deps.store.listCards(this.userId, { enabledOnly: true });
    this.pipeline?.reloadCards(cards);
    this.send({ t: 'invalidate', cardIds });
  }

  private async handleTranscript(text: string, final: boolean): Promise<void> {
    if (!this.pipeline) return;

    if (!final) {
      // Interims are debounced 400ms and used ONLY for prewarm — never
      // committed to the rolling window (plan §2.4).
      if (this.interimDebounceTimer) clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = setTimeout(() => {
        this.runPrewarm(text);
      }, config.interimDebounceMs);
      return;
    }

    // Finals are flushed IMMEDIATELY (plan §2.4) — no debounce.
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    const window = this.window.appendFinal(text);
    const outcome = await this.pipeline.match(window);

    if (outcome.kind === 'fired' && outcome.card) {
      this.send({
        t: 'show',
        card: outcome.card.spec,
        matchedPhrase: outcome.matchedPhrase ?? '',
        score: outcome.score ?? 1,
      });
      await this.recordActivity('fired', outcome.cardId, outcome.score);
    } else if (outcome.kind === 'near_miss') {
      await this.recordActivity('near_miss', outcome.cardId, outcome.score, window);
    } else if (outcome.kind === 'suppressed_cooldown') {
      await this.recordActivity('suppressed_cooldown', outcome.cardId, outcome.score);
    }
  }

  private runPrewarm(interimText: string): void {
    if (!this.pipeline) return;
    const peekWindow = this.window.peekWithInterim(interimText);
    // Side-effect-free Tier-1-only check — never mutates cooldown state and
    // never sends `show`, only `prewarm` (plan §2.4: interim drives prewarm
    // only; the real fire happens off the next FINAL transcript).
    const outcome = this.pipeline.peekTier1(peekWindow);
    if (outcome.kind === 'fired' && outcome.card) {
      this.send({ t: 'prewarm', card: outcome.card.spec });
    }
  }

  private async recordActivity(
    kind: 'fired' | 'near_miss' | 'suppressed_cooldown',
    cardId: string | null,
    score: number | null,
    snippet?: string,
  ): Promise<void> {
    if (!this.userId) return;
    const includeSnippet = Boolean(this.settings?.storeSnippets) && kind === 'near_miss';
    await this.deps.store.recordActivityEvent({
      userId: this.userId,
      sessionId: this.sessionId,
      kind,
      cardId,
      score,
      snippet: includeSnippet ? snippet ?? null : null, // opt-in only — plan §2.7
      createdAt: new Date(this.now()),
      expiresAt: new Date(this.now() + config.activityEventSnippetTtlHours * 60 * 60 * 1000),
    });
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.helloTimer) clearTimeout(this.helloTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.interimDebounceTimer) clearTimeout(this.interimDebounceTimer);
    this.unsubscribeInvalidation?.();
    // Full transcript window is discarded here by simply going out of scope
    // with this Session instance — nothing writes it to durable storage
    // (plan §2.7: "per-connection memory only, discarded on disconnect").
    this.window.clear();
  }

  /** Test helpers. */
  isAuthenticated(): boolean {
    return this.authenticated;
  }
  getUserId(): string | null {
    return this.userId;
  }
}
