/**
 * The `/ws/meeting` client.
 *
 * Owns the socket, the reconnect policy, and the room's shared state. The
 * media layer is deliberately not involved: this hook produces frames, the
 * mesh consumes them, and neither imports the other.
 *
 * ## Reconnect
 *
 * The signalling socket drops on sleep/wake, on mobile network handover and on
 * any deploy of the engine. A meeting that cannot survive that is not a
 * meeting. On an unexpected close the client reconnects with jittered
 * exponential backoff and re-sends its join frame; because the engine assigns
 * a fresh participant id, the mesh rebuilds its connections from the new
 * `joined` frame. The presenter's camera keeps running the whole time.
 *
 * ## Deliberately no auth
 *
 * The invite code is the capability. A room's media is protected by WebRTC's
 * DTLS-SRTP transport, and a client that has the code already has every
 * participant's stream by construction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseMeetingServerMsg,
  type MeetingClientMsg,
  type MeetingParticipant,
  type MeetingServerMsg,
  type RtcConfig,
  type SignalPayload,
} from '@stash/meeting-spec';
import { meetingWsUrl } from '../lib/meeting-url';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'waiting' | 'ended' | 'error';

export interface ChatEntry {
  key: string;
  id: string;
  name: string;
  text: string;
  at: number;
}

export interface CaptionEntry {
  key: string;
  id: string;
  name: string;
  text: string;
  final: boolean;
  at: number;
}

export interface RoomCardEntry {
  key: string;
  id: string;
  name: string;
  /** A `CardSpec`, but re-validated by the consumer before it is rendered. */
  card: unknown;
  topic?: string;
  at: number;
}

export interface ReactionEntry {
  key: string;
  id: string;
  name: string;
  emoji: string;
  at: number;
}

export interface PendingJoiner {
  id: string;
  name: string;
}

export interface MeetingSocketFailure {
  code: string;
  message: string;
}

export type JoinIntent =
  | { mode: 'create'; name: string; code?: string; lockOnJoin?: boolean }
  | { mode: 'join'; name: string; code: string };

export interface UseMeetingSocketOptions {
  intent: JoinIntent;
  /**
   * Gate for the whole socket. The lobby renders with `false` so a visitor can
   * pick devices and a name without appearing in the room's roster; flipping it
   * to `true` is the "Join now" click.
   */
  enabled: boolean;
  /** Called for every relayed signalling frame. Supplied by the mesh. */
  onSignal?: (from: string, data: SignalPayload) => void;
  maxBackoffMs?: number;
}

export interface UseMeetingSocketResult {
  status: SocketStatus;
  selfId: string | null;
  code: string | null;
  roomId: string | null;
  isHost: boolean;
  hostId: string | null;
  /** Everyone except self, in join order. */
  participants: MeetingParticipant[];
  rtc: RtcConfig | null;
  chat: ChatEntry[];
  captions: CaptionEntry[];
  cards: RoomCardEntry[];
  reactions: ReactionEntry[];
  pendingJoiners: PendingJoiner[];
  /** Set while this client is parked in the host gate. */
  waitingForHost: boolean;
  /** Set when the server refuses the join or a frame fails. */
  error: MeetingSocketFailure | null;
  /** Set when the host removes this client, or the meeting ends for everyone. */
  endedBy: string | null;
  /** Set when the host asks this client to mute. */
  muteRequestedBy: string | null;
  /** Unread chat count since the last `clearUnread`. */
  unread: number;
  send: (msg: MeetingClientMsg) => boolean;
  clearUnread: () => void;
}

const MAX_BACKOFF_MS = 15_000;
const HEARTBEAT_MS = 15_000;
const MAX_CHAT = 200;
const MAX_CAPTIONS = 50;
const MAX_CARDS = 24;
/** A rejection is terminal — retrying a refused join would loop forever. */
const TERMINAL_CODES = new Set(['room_not_found', 'invalid_code', 'room_full', 'room_ended', 'not_host']);

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

export function useMeetingSocket(opts: UseMeetingSocketOptions): UseMeetingSocketResult {
  const [status, setStatus] = useState<SocketStatus>('idle');
  const [selfId, setSelfId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [rtc, setRtc] = useState<RtcConfig | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [cards, setCards] = useState<RoomCardEntry[]>([]);
  const [reactions, setReactions] = useState<ReactionEntry[]>([]);
  const [pendingJoiners, setPendingJoiners] = useState<PendingJoiner[]>([]);
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [error, setError] = useState<MeetingSocketFailure | null>(null);
  const [endedBy, setEndedBy] = useState<string | null>(null);
  const [muteRequestedBy, setMuteRequestedBy] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposedRef = useRef(false);
  const seatedRef = useRef(false);
  const terminalRef = useRef(false);

  // Latest-value refs keep the socket callbacks stable, so a reconnect is never
  // scheduled because a React state value changed identity.
  const intentRef = useRef(opts.intent);
  intentRef.current = opts.intent;
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;
  const onSignalRef = useRef(opts.onSignal);
  onSignalRef.current = opts.onSignal;
  const maxBackoffRef = useRef(opts.maxBackoffMs ?? MAX_BACKOFF_MS);
  maxBackoffRef.current = opts.maxBackoffMs ?? MAX_BACKOFF_MS;
  const selfIdRef = useRef<string | null>(null);
  selfIdRef.current = selfId;

  const send = useCallback((msg: MeetingClientMsg): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, []);

  const scheduleReconnectRef = useRef<() => void>(() => {});

  const applyFrame = useCallback((msg: MeetingServerMsg) => {
    switch (msg.t) {
      case 'joined': {
        seatedRef.current = true;
        terminalRef.current = false;
        setSelfId(msg.selfId);
        setCode(msg.code);
        setRoomId(msg.roomId);
        setIsHost(msg.role === 'host');
        setHostId(msg.role === 'host' ? msg.selfId : null);
        setParticipants(msg.participants);
        setRtc(msg.rtc);
        setWaitingForHost(false);
        setError(null);
        setStatus('open');
        return;
      }
      case 'admitted': {
        seatedRef.current = true;
        setParticipants(msg.participants);
        setRtc(msg.rtc);
        setWaitingForHost(false);
        setError(null);
        setStatus('open');
        return;
      }
      case 'waiting': {
        seatedRef.current = false;
        setHostId(msg.hostId);
        setWaitingForHost(true);
        setStatus('waiting');
        return;
      }
      case 'denied': {
        seatedRef.current = false;
        terminalRef.current = true;
        setError({ code: 'denied', message: 'The host did not let you in.' });
        setStatus('error');
        return;
      }
      case 'peer-joined':
        setParticipants((prev) => (prev.some((p) => p.id === msg.participant.id) ? prev : [...prev, msg.participant]));
        return;
      case 'peer-left':
        setParticipants((prev) => prev.filter((p) => p.id !== msg.id));
        setCards((prev) => prev.filter((c) => c.id !== msg.id));
        setPendingJoiners((prev) => prev.filter((p) => p.id !== msg.id));
        return;
      case 'state':
        setParticipants((prev) => prev.map((p) => (p.id === msg.id ? { ...p, state: { ...p.state, ...msg.state } } : p)));
        return;
      case 'chat':
        setChat((prev) =>
          [...prev, { key: nextKey(), id: msg.id, name: msg.name, text: msg.text, at: msg.at }].slice(-MAX_CHAT),
        );
        setUnread((n) => n + 1);
        return;
      case 'caption':
        setCaptions((prev) =>
          [...prev, { key: nextKey(), id: msg.id, name: msg.name, text: msg.text, final: msg.final, at: msg.at }].slice(
            -MAX_CAPTIONS,
          ),
        );
        return;
      case 'card':
        setCards((prev) =>
          [...prev, { key: nextKey(), id: msg.id, name: msg.name, card: msg.card, topic: msg.topic, at: msg.at }].slice(
            -MAX_CARDS,
          ),
        );
        return;
      case 'card-cleared':
        setCards((prev) => prev.filter((c) => c.id !== msg.id));
        return;
      case 'reaction':
        setReactions((prev) =>
          [...prev, { key: nextKey(), id: msg.id, name: msg.name, emoji: msg.emoji, at: msg.at }].slice(-12),
        );
        return;
      case 'admit-request':
        setPendingJoiners((prev) => (prev.some((p) => p.id === msg.request.id) ? prev : [...prev, msg.request]));
        return;
      case 'mute-request':
        setMuteRequestedBy(msg.by);
        return;
      case 'host-migrated':
        setHostId(msg.hostId);
        setIsHost(msg.hostId === selfIdRef.current);
        return;
      case 'removed':
        setEndedBy(msg.by);
        setStatus('ended');
        return;
      case 'ended':
        setEndedBy(msg.by);
        setStatus('ended');
        return;
      case 'error': {
        const terminal = TERMINAL_CODES.has(msg.code);
        if (terminal) {
          terminalRef.current = true;
          seatedRef.current = false;
          try {
            wsRef.current?.close();
          } catch {
            /* already closing */
          }
        }
        setError({ code: msg.code, message: msg.message });
        setStatus('error');
        return;
      }
      case 'pong':
        return;
      case 'signal':
        onSignalRef.current?.(msg.from, msg.data);
        return;
      default:
        return;
    }
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current || terminalRef.current || !enabledRef.current) return;
    setStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(meetingWsUrl());
    } catch {
      setError({ code: 'internal', message: 'Could not reach the meeting service.' });
      setStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      seatedRef.current = false;
      // Re-seat on every open: after a reconnect the server has no record of
      // this socket, so the join frame is what re-establishes membership.
      const intent = intentRef.current;
      if (intent.mode === 'create') {
        send({ t: 'create', name: intent.name, lockOnJoin: intent.lockOnJoin });
      } else {
        send({ t: 'join', code: intent.code, name: intent.name });
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => send({ t: 'ping' }), HEARTBEAT_MS);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = parseMeetingServerMsg(raw);
      if (!parsed.ok) return;
      applyFrame(parsed.value);
    };

    ws.onclose = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      if (disposedRef.current || terminalRef.current) return;
      // Only a client that was actually seated tries to recover. A client
      // whose join was refused should land on the error screen instead of
      // retrying the same invitation forever.
      if (seatedRef.current) scheduleReconnectRef.current();
      else setStatus((s) => (s === 'error' ? s : 'closed' as SocketStatus));
    };

    ws.onerror = () => {
      /* surfaced by onclose */
    };
  }, [send, applyFrame]);

  const scheduleReconnect = useCallback(() => {
    if (disposedRef.current || terminalRef.current || retryTimerRef.current || !enabledRef.current) return;
    const attempt = Math.min(attemptRef.current++, 10);
    // Full jitter: without it, a server restart brings every client back in
    // the same millisecond and knocks it over again.
    const ceiling = Math.min(maxBackoffRef.current, 500 * 2 ** attempt);
    const delay = Math.round(ceiling * (0.4 + Math.random() * 0.6));
    setStatus('connecting');
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  scheduleReconnectRef.current = scheduleReconnect;

  const enabled = opts.enabled;
  useEffect(() => {
    disposedRef.current = false;
    if (!enabled) {
      // The lobby is showing. Tear any socket down so this client is not in the
      // room before it has pressed the button.
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
      return;
    }
    connect();
    return () => {
      disposedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      retryTimerRef.current = null;
      heartbeatRef.current = null;
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
    };
  }, [connect, enabled]);

  return useMemo(
    () => ({
      status,
      selfId,
      code,
      roomId,
      isHost,
      hostId,
      participants,
      rtc,
      chat,
      captions,
      cards,
      reactions,
      pendingJoiners,
      waitingForHost,
      error,
      endedBy,
      muteRequestedBy,
      unread,
      send,
      clearUnread: () => setUnread(0),
    }),
    [
      status,
      selfId,
      code,
      roomId,
      isHost,
      hostId,
      participants,
      rtc,
      chat,
      captions,
      cards,
      reactions,
      pendingJoiners,
      waitingForHost,
      error,
      endedBy,
      muteRequestedBy,
      unread,
      send,
    ],
  );
}

/** Test seam: lets suites reset the module-level key counter deterministically. */
export function __resetMeetingSocketKeys(): void {
  keyCounter = 0;
}