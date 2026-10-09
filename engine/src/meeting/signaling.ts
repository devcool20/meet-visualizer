/**
 * `/ws/meeting` — the transport in front of `MeetingRegistry`.
 *
 * Responsibilities kept here, and nowhere else:
 *  - socket lifecycle (hello timeout, heartbeat, backoff-free reconnect on the
 *    client side, rate limiting)
 *  - frame parse → registry dispatch → fan-out
 *  - delivering a connection's death back to the registry exactly once
 *
 * Design notes:
 *
 *  - **No authentication.** The invite code is the capability, exactly as it
 *    is on Google Meet. Requiring a Stash Live account to *join* a call whose
 *    entire point is dropping a stranger into a room with one click would be
 *    the wrong product decision; the host gate is the control that matters.
 *
 *  - **`noServer` + a path check**, matching `/ws` and `/ws/virtualcam`. A
 *    path-scoped `WebSocketServer({ server, path })` destroys the socket for
 *    every other upgrade path, which would kill those two endpoints.
 *
 *  - **Backpressure.** If a socket's buffer grows past `MAX_BUFFERED_BYTES`
 *    the peer is disconnected rather than buffered forever. Signalling frames
 *    are small, so hitting this means the client is not reading, and an
 *    unread socket will stall the whole room's fan-out.
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { Server as HttpServer } from 'node:http';
import {
  MEETING_LIMITS,
  parseMeetingClientMsg,
  sanitizeName,
  type MeetingClientMsg,
  type MeetingServerMsg,
} from '@stash/meeting-spec';
import { MeetingRegistry, type MeetingConnection } from './registry.js';

export const MEETING_WS_PATH = '/ws/meeting';

/** Frames a client may send before it is disconnected for abuse. */
const MAX_BUFFERED_BYTES = 1_000_000;

export interface MeetingWsDeps {
  registry: MeetingRegistry;
  now?: () => number;
  log?: (msg: string) => void;
}

interface Session {
  id: string;
  /** Set once the client has created or joined a room. */
  code: string | null;
  /** Set once the client has been told it is in the room. */
  seated: boolean;
}

export function attachMeetingWs(httpServer: HttpServer, deps: MeetingWsDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const { registry } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => Date.now());

  /**
   * Live sessions, keyed by connection id.
   *
   * This exists because admission is cross-socket: the host approves a queued
   * client on one connection, and the queued client's *own* session has to be
   * updated to know it is now seated. Without a server-side map the admitted
   * client would receive its roster, render a room it is not in, and have every
   * subsequent frame silently dropped because it never learned its code.
   */
  const sessions = new Map<string, Session>();

  httpServer.on('upgrade', (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url || '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
    } catch {
      return;
    }
    if (pathname !== MEETING_WS_PATH) return; // not ours — leave the socket alone
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const session: Session = { id: `c${++connectionCounter}`, code: null, seated: false };
    sessions.set(session.id, session);
    let framesThisSecond = 0;
    let rateWindowStart = now();

    const conn: MeetingConnection = {
      id: session.id,
      send(msg: MeetingServerMsg): boolean {
        if (ws.readyState !== WebSocket.OPEN) return false;
        try {
          ws.send(JSON.stringify(msg));
          return true;
        } catch {
          return false;
        }
      },
      close() {
        try {
          ws.close();
        } catch {
          /* already gone */
        }
      },
    };

    const fail = (code: Extract<MeetingServerMsg, { t: 'error' }>['code'], message: string): void => {
      conn.send({ t: 'error', code, message });
      // Give the frame a tick to flush before tearing down.
      setTimeout(() => conn.close(), 30);
    };
    const error = fail;

    ws.on('message', (data: RawData) => {
      // Rate limit per connection, on a fixed 1s window.
      const t = now();
      if (t - rateWindowStart >= 1000) {
        rateWindowStart = t;
        framesThisSecond = 0;
      }
      if (++framesThisSecond > MEETING_LIMITS.rateLimitPerSecond) {
        log(`[meeting] rate limit tripped for ${session.id}`);
        fail('internal', 'Too many messages');
        return;
      }

      const buffered = (ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0;
      if (buffered > MAX_BUFFERED_BYTES) {
        log(`[meeting] backpressure disconnect for ${session.id}`);
        conn.close();
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(data.toString());
      } catch {
        // Unparseable bytes are a protocol violation, not a stale client: this
        // endpoint speaks JSON and nothing else, so the peer is either
        // desynchronised or not talking to us. Drop the socket.
        fail('invalid_message', 'Frame was not valid JSON');
        return;
      }

      const parsed = parseMeetingClientMsg(parsedJson);
      if (!parsed.ok) {
        log(`[meeting] invalid frame from ${session.id}: ${parsed.error}`);
        // A structurally invalid but *parseable* frame is a stale client, not an
        // attacker, and a stale client must not lose its call over one frame. An
        // unknown frame *type*, though, means this server is out of step with
        // its client — drop the socket and let the reconnect land on a fresh
        // handshake rather than silently ignoring everything it sends.
        const frameType =
          parsedJson && typeof parsedJson === 'object' && 't' in parsedJson
            ? String((parsedJson as { t: unknown }).t)
            : null;
        if (frameType !== null && !KNOWN_TYPES.has(frameType)) {
          fail('invalid_message', `Unknown frame: ${frameType}`);
        }
        return;
      }

      registry.touch(session.id);
      route(parsed.value);
    });

    const route = (msg: MeetingClientMsg): void => {
      switch (msg.t) {
        case 'create': {
          // If this socket already made a room, tear it down first: a client
          // that double-taps "New meeting" should end up in exactly one room.
          retireCurrentRoom(registry, session, 'create');
          const result = registry.create(conn, msg.name, { lockOnJoin: msg.lockOnJoin, code: msg.code });
          if (result.kind === 'error') return error(result.code, result.message);
          session.code = result.room.code;
          session.seated = true;
          conn.send({
            t: 'joined',
            selfId: result.self.id,
            code: result.room.code,
            roomId: result.room.id,
            role: result.self.role,
            participants: result.others,
            rtc: registry.rtcConfig,
            createdAt: result.room.createdAt,
          });
          return;
        }

        case 'join': {
          retireCurrentRoom(registry, session, 'join');
          const result = registry.join(conn, msg.code, msg.name);
          if (result.kind === 'error') return error(result.code, result.message);
          if (result.kind === 'queued') {
            session.code = null;
            session.seated = false;
            conn.send({ t: 'waiting', hostId: result.hostId, name: sanitizeName(msg.name) });
            return;
          }
          session.code = result.room.code;
          session.seated = true;
          conn.send({
            t: 'joined',
            selfId: result.self.id,
            code: result.room.code,
            roomId: result.room.id,
            role: result.self.role,
            participants: result.others,
            rtc: registry.rtcConfig,
            createdAt: result.room.createdAt,
          });
          registry.broadcast(result.room, [{ t: 'peer-joined', participant: result.self }], result.self.id);
          return;
        }

        case 'signal': {
          if (!session.code) return;
          const routed = registry.routeSignal(session.code, session.id, msg.to, msg.data);
          // A peer that vanished between negotiation steps is normal churn, not
          // an error worth showing anybody. Answer with `pong` so the sender's
          // keepalive stays happy and stays quiet otherwise.
          if (!routed.delivered) conn.send({ t: 'pong' });
          return;
        }

        case 'moderate': {
          if (!session.code) return;
          if (msg.action === 'admit') {
            const result = registry.admit(session.code, session.id, msg.id);
            if (result.kind === 'error') return error(result.code, result.message);
            if (result.kind === 'none') return;
            const found = registry.locateParticipant(msg.id);
            if (!found) return;
            // Seat the approved client's own session, or it would receive a
            // roster for a room it is not in and have every frame dropped.
            const approved = sessions.get(msg.id);
            if (approved) {
              approved.code = found.room.code;
              approved.seated = true;
            }
            // The newly admitted client gets the roster + ICE config; the room
            // gets told somebody arrived.
            found.entry.conn.send({ t: 'admitted', participants: result.others, rtc: registry.rtcConfig });
            registry.broadcast(found.room, [{ t: 'peer-joined', participant: result.self }], result.self.id);
            return;
          }
          if (msg.action === 'deny') {
            const res = registry.deny(session.code, session.id, msg.id);
            if (!res.ok) return error('not_host', 'Only the host can let people in');
            res.denied?.send({ t: 'denied' });
            return;
          }
          if (msg.action === 'remove') {
            const res = registry.remove(session.code, session.id, msg.id);
            if (!res.ok) return error('not_host', 'Only the host can remove people');
            const found = registry.locateParticipant(session.id);
            res.removed?.send({ t: 'removed', by: 'the host' });
            if (found) registry.broadcast(found.room, [{ t: 'peer-left', id: msg.id }]);
            return;
          }
          const res = registry.requestMute(session.code, session.id, msg.id);
          if (!res.ok || !res.target) return error('not_host', 'Only the host can mute people');
          res.target.send({ t: 'mute-request', by: 'the host' });
          return;
        }

        case 'state':
        case 'chat':
        case 'caption':
        case 'reaction':
        case 'card':
        case 'card-cleared':
        case 'ping':
        case 'leave': {
          if (!session.code || !session.seated) return;
          const found = registry.locateParticipant(session.id);
          if (!found) return;
          const frames = registry.handle(session.id, msg);
          if (msg.t === 'leave') {
            // A `leave` detaches: the frames it produced (including any host
            // migration) go to whoever is still here, and to nobody else.
            registry.broadcast(found.room, frames);
            session.seated = false;
            session.code = null;
            return;
          }
          registry.broadcast(found.room, frames);
          return;
        }

        default: {
          const never: never = msg;
          void never;
        }
      }
    };

    // Exactly-once cleanup. `close` fires for both graceful and hard drops.
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      sessions.delete(session.id);
      const found = registry.locateParticipant(session.id);
      if (!found) {
        // Sitting in a gate queue, or already detached by an explicit leave.
        registry.discardWaiting(session.id);
        return;
      }
      registry.broadcast(found.room, registry.detach(found.room, session.id));
      session.seated = false;
      session.code = null;
    };

    ws.on('close', cleanup);
    ws.on('error', () => {
      /* surfaced through close */
    });
  });

  return wss;
}

const KNOWN_TYPES = new Set([
  'create',
  'join',
  'signal',
  'state',
  'chat',
  'caption',
  'reaction',
  'card',
  'card-cleared',
  'moderate',
  'leave',
  'ping',
]);

/**
 * Detaches a socket from whatever room it is already in before it creates or
 * joins another one, and delivers the resulting `peer-left` / host-migration
 * frames to whoever is left. Without this, a client that taps "New meeting"
 * twice would be seated in two rooms and receive two copies of every frame.
 */
function retireCurrentRoom(registry: MeetingRegistry, session: Session, next: 'create' | 'join'): void {
  if (!session.code) return;
  const found = registry.locateParticipant(session.id);
  session.code = null;
  session.seated = false;
  if (!found) {
    registry.discardWaiting(session.id);
    return;
  }
  registry.broadcast(found.room, registry.detach(found.room, session.id));
  void next;
}

let connectionCounter = 0;