/**
 * WebSocket client owned by the service worker (plan §2.5 / §3.1).
 *
 * Testable in isolation: the actual `WebSocket` constructor and timers are
 * injected so unit tests can drive reconnection and heartbeat scheduling
 * without a real socket or real timers.
 */
import type { ClientMsg, ServerMsg } from '@stash/card-spec';
import { parseServerMsg } from '@stash/card-spec';
import { HEARTBEAT_INTERVAL_MS, RECONNECT_MAX_MS, RECONNECT_MIN_MS } from '../shared/constants.js';

export interface MinimalSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
}

export interface EngineSocketDeps {
  createSocket: (url: string) => MinimalSocket;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Deterministic-friendly random in [0,1). Injected so backoff jitter is testable. */
  random: () => number;
}

export interface EngineSocketCallbacks {
  onServerMsg: (msg: ServerMsg) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
  /** Malformed frame arrived — logged, never thrown into the caller. */
  onInvalidFrame?: (raw: string, error: string) => void;
}

const OPEN = 1;

export class EngineSocket {
  private socket: MinimalSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectHandle: unknown = null;
  private heartbeatHandle: unknown = null;
  private closedByUser = false;
  private helloSent = false;

  constructor(
    private url: string,
    private hello: () => ClientMsg,
    private readonly deps: EngineSocketDeps,
    private readonly cb: EngineSocketCallbacks,
  ) {}

  get isConnected(): boolean {
    return !!this.socket && this.socket.readyState === OPEN;
  }

  connect(): void {
    this.closedByUser = false;
    this.cb.onStatusChange('connecting');
    const socket = this.deps.createSocket(this.url);
    this.socket = socket;
    this.helloSent = false;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.helloSent = true;
      this.send(this.hello());
      this.startHeartbeat();
      this.cb.onStatusChange('connected');
    };

    socket.onmessage = (ev) => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(ev.data);
      } catch {
        this.cb.onInvalidFrame?.(ev.data, 'not valid JSON');
        return;
      }
      const result = parseServerMsg(parsedJson);
      if (!result.ok) {
        this.cb.onInvalidFrame?.(ev.data, result.error);
        return;
      }
      this.cb.onServerMsg(result.value);
    };

    socket.onerror = () => {
      // onclose always follows; nothing to do here beyond letting it happen.
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      this.cb.onStatusChange('disconnected');
      this.socket = null;
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    this.cancelReconnect();
    this.socket?.close(1000, 'client disconnect');
    this.socket = null;
  }

  send(msg: ClientMsg): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  /** Exposed for tests; real callers should just call `connect()`. */
  computeBackoffMs(attempt: number): number {
    const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * Math.pow(2, attempt));
    const jitter = this.deps.random() * exp * 0.5;
    return Math.min(RECONNECT_MAX_MS, exp * 0.5 + jitter);
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    const delay = this.computeBackoffMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectHandle = this.deps.setTimer(() => {
      this.reconnectHandle = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectHandle !== null) {
      this.deps.clearTimer(this.reconnectHandle);
      this.reconnectHandle = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatHandle = this.deps.setTimer(() => {
      this.send({ t: 'ping' });
      this.startHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatHandle !== null) {
      this.deps.clearTimer(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  /** Test/debug helper. */
  get pendingReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  get helloWasSent(): boolean {
    return this.helloSent;
  }
}
