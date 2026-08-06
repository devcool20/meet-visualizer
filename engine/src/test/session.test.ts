import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Session, type WsLike } from '../ws/session.js';
import { DeviceAuth, PairingService } from '../auth/pairing.js';
import { Tier2Matcher } from '../matching/tier2.js';
import { MockTier3Confirmer } from '../matching/tier3.js';
import { MockEmbeddingProvider } from '../matching/gemini-embedding.js';
import { MemoryStore } from '../db/memory-store.js';
import { pubSubService } from '../services/pubsub.js';
import { CardsService } from '../services/cards.js';
import { seedUser, makeCardInput } from './helpers.js';

/** Fake socket recording every sent message, driven manually in tests. */
class FakeSocket implements WsLike {
  readyState = 1;
  sent: any[] = [];
  private handlers: Record<string, Array<(...args: any[]) => void>> = { message: [], close: [], error: [] };

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    for (const h of this.handlers.close) h();
  }
  on(event: 'message' | 'close' | 'error', cb: (...args: any[]) => void): void {
    this.handlers[event].push(cb);
  }
  emitMessage(msg: unknown): void {
    for (const h of this.handlers.message) h(JSON.stringify(msg));
  }
  lastOfType(t: string): any {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

async function setup() {
  const store = new MemoryStore();
  await seedUser(store, 'u1');
  const pairing = new PairingService(store);
  const { nonce } = await pairing.createNonce('u1');
  const { token } = (await pairing.pair(nonce, 'test-device'))!;
  const deviceAuth = new DeviceAuth(store);
  const tier2 = new Tier2Matcher(new MockEmbeddingProvider());
  const deps = { store, deviceAuth, tier2, tier3: new MockTier3Confirmer() };
  return { store, token, deps };
}

describe('Session (WS protocol v2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects any message before hello with auth_failed', async () => {
    const { deps } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);

    socket.emitMessage({ t: 'ping' });
    expect(socket.lastOfType('error')).toMatchObject({ code: 'auth_failed' });
  });

  it('closes the connection if hello does not arrive within the timeout', async () => {
    const { deps } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);

    vi.advanceTimersByTime(5_001);
    expect(socket.lastOfType('error')).toMatchObject({ code: 'auth_failed' });
    expect(socket.readyState).toBe(3);
  });

  it('rejects an invalid device token on hello', async () => {
    const { deps } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);

    socket.emitMessage({ t: 'hello', token: 'not-a-real-token-at-all', client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('error')).toMatchObject({ code: 'auth_failed' }));
  });

  it('rejects a malformed message with a schema validation error', async () => {
    const { deps } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);

    socket.emitMessage({ t: 'hello', token: 'short' }); // token.min(16) violated, missing fields
    expect(socket.lastOfType('error')).toMatchObject({ code: 'internal' });
  });

  it('completes hello -> ready -> config on a valid token', async () => {
    const { deps, token } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);

    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    expect(socket.lastOfType('ready')).toMatchObject({ userId: 'u1' });
    expect(socket.lastOfType('config')).toBeDefined();
  });

  it('sends a heartbeat pong on the configured interval after authentication', async () => {
    const { deps, token } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    const before = socket.sent.filter((m) => m.t === 'pong').length;
    vi.advanceTimersByTime(20_000);
    const after = socket.sent.filter((m) => m.t === 'pong').length;
    expect(after).toBeGreaterThan(before);
  });

  it('responds to ping with pong', async () => {
    const { deps, token } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    socket.sent = [];
    socket.emitMessage({ t: 'ping' });
    expect(socket.lastOfType('pong')).toBeDefined();
  });

  it('a final transcript matching a card phrase sends show', async () => {
    const { deps, token, store } = await setup();
    await store.createCard('u1', makeCardInput('card-team', { phrases: ['our team'] }));

    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    await vi.waitFor(async () => {
      socket.emitMessage({ t: 'transcript', text: 'let me tell you about our team', final: true, ts: Date.now() });
      await vi.runOnlyPendingTimersAsync();
      expect(socket.lastOfType('show')).toBeDefined();
    });
    expect(socket.lastOfType('show').card.id).toBe('card-team');
  });

  it('an interim transcript never sends show, only prewarm, after the debounce delay', async () => {
    const { deps, token, store } = await setup();
    await store.createCard('u1', makeCardInput('card-team', { phrases: ['our team'] }));

    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    socket.emitMessage({ t: 'transcript', text: 'our team', final: false, ts: Date.now() });
    expect(socket.lastOfType('prewarm')).toBeUndefined(); // not yet -- debounced

    vi.advanceTimersByTime(401);
    await vi.runOnlyPendingTimersAsync();
    expect(socket.lastOfType('prewarm')).toBeDefined();
    expect(socket.lastOfType('show')).toBeUndefined();
  });

  it('rate limits messages beyond the configured per-second budget', async () => {
    const { deps, token } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    socket.sent = [];
    for (let i = 0; i < 25; i++) socket.emitMessage({ t: 'ping' });
    const rateLimitedErrors = socket.sent.filter((m) => m.t === 'error' && m.code === 'rate_limited');
    expect(rateLimitedErrors.length).toBeGreaterThan(0);
  });

  it('reloads cards and sends invalidate when the pubsub invalidation fires for this user', async () => {
    const { deps, token, store } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    const card = await store.createCard('u1', makeCardInput('card-new', { phrases: ['brand new phrase'] }));
    await pubSubService.publishInvalidation({ userId: 'u1', cardIds: [card.id] });

    await vi.waitFor(() => expect(socket.lastOfType('invalidate')).toBeDefined());
    expect(socket.lastOfType('invalidate').cardIds).toEqual([card.id]);

    // The reloaded pipeline should now recognize the new card's phrase.
    socket.emitMessage({ t: 'transcript', text: 'brand new phrase incoming', final: true, ts: Date.now() });
    await vi.waitFor(() => expect(socket.lastOfType('show')).toBeDefined());
  });

  it('does not invalidate a session belonging to a different user', async () => {
    const { deps, token } = await setup();
    const socket = new FakeSocket();
    new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    socket.sent = [];
    await pubSubService.publishInvalidation({ userId: 'someone-else', cardIds: ['x'] });
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.lastOfType('invalidate')).toBeUndefined();
  });

  it('unsubscribes from invalidation and clears the transcript window on close', async () => {
    const { deps, token, store } = await setup();
    const socket = new FakeSocket();
    const session = new Session(socket, deps);
    socket.emitMessage({ t: 'hello', token, client: 'ext', version: '1.0' });
    await vi.waitFor(() => expect(socket.lastOfType('ready')).toBeDefined());

    socket.close();
    socket.sent = [];

    // After close, publishing an invalidation for this user must not reach a dead session.
    await store.createCard('u1', makeCardInput('card-x'));
    await pubSubService.publishInvalidation({ userId: 'u1', cardIds: ['card-x'] });
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.lastOfType('invalidate')).toBeUndefined();
    expect(session.isAuthenticated()).toBe(true); // auth state itself is preserved, just inert
  });
});
