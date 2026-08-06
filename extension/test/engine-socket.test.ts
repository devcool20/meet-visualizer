/**
 * EngineSocket tests — reconnect backoff and heartbeat scheduling (plan
 * §2.5, §5.2). Both the socket constructor and every timer are injected so
 * this runs against a fake clock and a fake WebSocket, never touching a real
 * network connection or MV3 runtime.
 */
import { describe, expect, it, vi } from 'vitest';
import { EngineSocket, type EngineSocketDeps, type MinimalSocket } from '../src/background/engine-socket';
import { HEARTBEAT_INTERVAL_MS, RECONNECT_MAX_MS, RECONNECT_MIN_MS } from '../src/shared/constants';

class FakeSocket implements MinimalSocket {
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code: 1000, reason: 'closed' });
  }
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }
  remoteClose(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: 'abnormal' });
  }
  receive(json: unknown): void {
    this.onmessage?.({ data: JSON.stringify(json) });
  }
  receiveRaw(raw: string): void {
    this.onmessage?.({ data: raw });
  }
}

function makeFakeDeps() {
  let now = 0;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;
  const sockets: FakeSocket[] = [];

  const deps: EngineSocketDeps = {
    createSocket: (_url: string) => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, at: now + ms, handle });
      return handle;
    },
    clearTimer: (handle) => {
      const idx = timers.findIndex((t) => t.handle === handle);
      if (idx >= 0) timers.splice(idx, 1);
    },
    random: () => 0.5, // deterministic "jitter"
  };

  function advance(ms: number): void {
    const target = now + ms;
    while (true) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      const idx = timers.indexOf(due);
      if (idx >= 0) timers.splice(idx, 1);
      due.fn();
    }
    now = target;
  }

  return { deps, advance, sockets, pendingTimers: () => timers.length };
}

describe('EngineSocket', () => {
  it('sends hello immediately on open and reports connected', () => {
    const { deps, sockets } = makeFakeDeps();
    const onStatusChange = vi.fn();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange,
    });

    socket.connect();
    expect(onStatusChange).toHaveBeenCalledWith('connecting');
    sockets[0].open();

    expect(onStatusChange).toHaveBeenCalledWith('connected');
    expect(sockets[0].sent[0]).toBe(JSON.stringify({ t: 'hello', token: 't', client: 'ext', version: '1' }));
    expect(socket.helloWasSent).toBe(true);
  });

  it('schedules a heartbeat ping every HEARTBEAT_INTERVAL_MS while connected', () => {
    const { deps, sockets, advance } = makeFakeDeps();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange: vi.fn(),
    });
    socket.connect();
    sockets[0].open();

    advance(HEARTBEAT_INTERVAL_MS);
    expect(sockets[0].sent.filter((m) => m === JSON.stringify({ t: 'ping' })).length).toBe(1);

    advance(HEARTBEAT_INTERVAL_MS);
    expect(sockets[0].sent.filter((m) => m === JSON.stringify({ t: 'ping' })).length).toBe(2);
  });

  it('stops the heartbeat once disconnected', () => {
    const { deps, sockets, advance, pendingTimers } = makeFakeDeps();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange: vi.fn(),
    });
    socket.connect();
    sockets[0].open();
    socket.disconnect();

    advance(HEARTBEAT_INTERVAL_MS * 3);
    // No new heartbeat pings and no pending reconnect timer after a
    // user-initiated disconnect.
    expect(sockets[0].sent.filter((m) => m === JSON.stringify({ t: 'ping' })).length).toBe(0);
    expect(pendingTimers()).toBe(0);
  });

  it('reconnects with exponential-ish backoff bounded to [MIN,MAX] after an abnormal close', () => {
    const { deps, sockets, advance } = makeFakeDeps();
    const onStatusChange = vi.fn();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange,
    });
    socket.connect();
    sockets[0].open();
    onStatusChange.mockClear();

    sockets[0].remoteClose();
    expect(onStatusChange).toHaveBeenCalledWith('disconnected');

    // First backoff should respect RECONNECT_MIN_MS as its floor magnitude
    // (attempt 0: exp = MIN * 2^0 = MIN; with random()=0.5 backoff = exp*0.5 + 0.5*exp*0.5 = exp*0.75).
    const expectedFirstBackoff = socket.computeBackoffMs(0);
    expect(expectedFirstBackoff).toBeGreaterThanOrEqual(RECONNECT_MIN_MS * 0.5);
    expect(expectedFirstBackoff).toBeLessThanOrEqual(RECONNECT_MAX_MS);

    advance(expectedFirstBackoff);
    expect(sockets.length).toBe(2); // a second socket was created to reconnect
  });

  it('backoff is monotonically bounded by RECONNECT_MAX_MS as attempts grow', () => {
    const { deps } = makeFakeDeps();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange: vi.fn(),
    });

    for (let attempt = 0; attempt < 20; attempt++) {
      expect(socket.computeBackoffMs(attempt)).toBeLessThanOrEqual(RECONNECT_MAX_MS);
    }
  });

  it('does not reconnect automatically after a user-initiated disconnect', () => {
    const { deps, sockets, advance } = makeFakeDeps();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg: vi.fn(),
      onStatusChange: vi.fn(),
    });
    socket.connect();
    sockets[0].open();
    socket.disconnect();

    advance(RECONNECT_MAX_MS * 2);
    expect(sockets.length).toBe(1);
  });

  it('drops a malformed inbound frame instead of throwing, and never calls onServerMsg for it', () => {
    const { deps, sockets } = makeFakeDeps();
    const onServerMsg = vi.fn();
    const onInvalidFrame = vi.fn();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg,
      onStatusChange: vi.fn(),
      onInvalidFrame,
    });
    socket.connect();
    sockets[0].open();

    sockets[0].receive({ t: 'show', card: { v: 1, id: 'x' } }); // missing required fields
    sockets[0].receiveRaw('not even json'); // triggers JSON.parse failure path directly

    expect(onServerMsg).not.toHaveBeenCalled();
    expect(onInvalidFrame).toHaveBeenCalled();
  });

  it('routes a well-formed frame to onServerMsg', () => {
    const { deps, sockets } = makeFakeDeps();
    const onServerMsg = vi.fn();
    const socket = new EngineSocket('wss://engine.example/ws', () => ({ t: 'hello', token: 't', client: 'ext', version: '1' }), deps, {
      onServerMsg,
      onStatusChange: vi.fn(),
    });
    socket.connect();
    sockets[0].open();

    sockets[0].receive({ t: 'ready', userId: 'u1', cardCount: 2 });

    expect(onServerMsg).toHaveBeenCalledWith({ t: 'ready', userId: 'u1', cardCount: 2 });
  });
});
