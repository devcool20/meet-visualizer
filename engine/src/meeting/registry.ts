/**
 * Meeting room registry â€” the authoritative state behind `/ws/meeting`.
 *
 * The registry owns rooms, the roster, the host-gate queue, and the room's
 * chat / caption / card buffers. It is deliberately transport-free: the
 * WebSocket layer hands it parsed frames and receives a list of frames to
 * send back. That keeps every rule here unit-testable without a socket.
 *
 * ## Mesh, not SFU
 *
 * The registry relays *signalling only*. Audio and video go peer to peer over
 * WebRTC and never touch this process. That bounds the cost of a room to O(nÂ²)
 * connections and nothing more, which is why `meshLimit` exists and why a
 * join past the limit is refused rather than accepted and left to degrade.
 *
 * ## Host gate
 *
 * A room can be created locked (`lockOnJoin`). Locked rooms do not admit
 * joiners; they park them in a FIFO queue and the host approves or denies
 * each one. The gate exists because this platform's differentiator is putting
 * a card on your own camera â€” a stranger walking in unannounced should not be
 * able to make you perform.
 *
 * ## Lifetime
 *
 * Rooms are in-memory and best-effort. A process restart loses them, which is
 * acceptable: the engine is a signalling relay, and every client's reconnect
 * path already re-creates or re-joins. Nothing durable is stored here.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PARTICIPANT_STATE,
  MEETING_LIMITS,
  MEETING_REACTIONS,
  createCodeGenerator,
  formatCode,
  normalizeCode,
  offsetCode,
  parseCard,
  publicParticipant,
  sanitizeName,
  type IceServerLite,
  type MeetingCardFrame,
  type MeetingParticipant,
  type MeetingReaction,
  type MeetingServerMsg,
  type ParticipantState,
  type RtcConfig,
  type SignalPayload,
} from '@stash/meeting-spec';

export interface MeetingConnection {
  id: string;
  /** Resolves a send failure into a dead-connection signal for the transport. */
  send(msg: MeetingServerMsg): boolean;
  close(): void;
}

export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

export interface CaptionLine {
  id: string;
  name: string;
  text: string;
  final: boolean;
  at: number;
}

export interface RoomCardEntry extends MeetingCardFrame {
  /** Who put this card on their camera. */
  byId: string;
  byName: string;
}

/**
 * The server's own view of a seated participant: identical to the public
 * shape except `lastSeenAt` is always present, because the reaper reads it on
 * every sweep and must never have to reason about a missing value.
 */
type SeatedParticipant = MeetingParticipant & { lastSeenAt: number };

/**
 * A seated participant. The connection is stored unwrapped so callers get back the
 * exact object they handed in, which is what makes emove() and equestMute() able to
 * deliver to it.
 */
interface Seated {
  conn: MeetingConnection;
  participant: SeatedParticipant;
}

interface WaitingEntry {
  id: string;
  name: string;
  conn: MeetingConnection;
}

interface Room {
  id: string;
  code: string;
  createdAt: number;
  /** Host connection id, or null while the room is draining after an end. */
  hostId: string | null;
  /** When set, joiners are queued for host approval instead of admitted. */
  locked: boolean;
  /** Rejects new joiners outright. Set when the host ends the meeting. */
  ended: boolean;
  /** Keyed by participant id, which IS the connection id — see seat(). */
  participants: Map<string, Seated>;
  waiting: WaitingEntry[];
  chat: ChatMessage[];
  captions: CaptionLine[];
  cards: RoomCardEntry[];
  lastActivityAt: number;
}

export interface RoomRegistryOptions {
  /** Handed to every client on join. */
  rtc: RtcConfig;
  /** Injectable for deterministic tests. */
  now?: () => number;
  /** Injectable id generator. */
  newId?: () => string;
  /** Injectable code generator. */
  newCode?: () => string;
  /** How many code collisions to probe before giving up on a code. */
  maxCodeProbes?: number;
  /** Idle-connection reap interval. 0 disables the sweep. */
  reapIntervalMs?: number;
  /** Log sink. Defaults to nothing so tests stay quiet. */
  log?: (msg: string) => void;
}

export interface JoinResult {
  kind: 'joined';
  room: Room;
  self: MeetingParticipant;
  /** Everyone already present, excluding self. */
  others: MeetingParticipant[];
}

export interface JoinFailure {
  kind: 'error';
  code: Extract<
    MeetingServerMsg,
    { t: 'error' }
  >['code'];
  message: string;
}

export type CreateResult = JoinResult | JoinFailure;

const MAX_CODE_PROBES = 40;

/**
 * The registry. One instance per engine process; the transport subscribes to
 * it for reaping.
 */
export class MeetingRegistry {
  private rooms = new Map<string, Room>();
  private nextCode: () => string;
  private now: () => number;
  private newId: () => string;
  private rtc: RtcConfig;
  private maxCodeProbes: number;
  private log: (msg: string) => void;
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor(opts: RoomRegistryOptions) {
    this.rtc = opts.rtc;
    this.now = opts.now ?? (() => Date.now());
    this.newId = opts.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 16));
    this.nextCode = opts.newCode ?? createCodeGenerator();
    this.maxCodeProbes = opts.maxCodeProbes ?? MAX_CODE_PROBES;
    this.log = opts.log ?? (() => {});
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /** Starts the idle sweep. Returns a stop function. */
  start(onEvict: (roomCode: string, connId: string) => void = () => {}): () => void {
    if (this.reaper) return () => this.stop();
    const every = this.reaperIntervalMs();
    if (every <= 0) return () => {};
    this.reaper = setInterval(() => this.reap(onEvict), every);
    // Never hold the process open just for reaping.
    this.reaper.unref?.();
    return () => this.stop();
  }

  stop(): void {
    if (this.reaper) clearInterval(this.reaper);
    this.reaper = null;
  }

  private reaperIntervalMs(): number {
    // A third of the idle timeout keeps a wedged connection from lingering for
    // a full window after its user has gone.
    return Math.max(1000, Math.floor(MEETING_LIMITS.idleTimeoutMs / 3));
  }

  /**
   * Drops connections that have gone quiet past the idle timeout and deletes
   * rooms that have been empty long enough to be indistinguishable from
   * never having existed.
   */
  reap(onEvict: (roomCode: string, connId: string) => void = () => {}): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      for (const entry of [...room.participants.values()]) {
        if (now - entry.participant.lastSeenAt > MEETING_LIMITS.idleTimeoutMs) {
          this.log(`reaping idle participant ${entry.participant.id} in ${room.code}`);
          onEvict(room.code, entry.participant.id);
          this.detach(room, entry.participant.id);
        }
      }
      if (room.participants.size === 0 && now - room.lastActivityAt > MEETING_LIMITS.roomTtlMs) {
        this.rooms.delete(room.code);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Introspection (used by the REST routes and tests)                 */
  /* ---------------------------------------------------------------- */

  has(code: string): boolean {
    const key = normalizeCode(code);
    return key !== null && this.rooms.has(key);
  }

  /** Public snapshot of a room, or null. Never exposes connection objects. */
  peek(code: string): {
    code: string;
    createdAt: number;
    participantCount: number;
    waitingCount: number;
    locked: boolean;
    ended: boolean;
    hostId: string | null;
    participants: MeetingParticipant[];
  } | null {
    const room = this.room(code);
    if (!room) return null;
    return {
      code: room.code,
      createdAt: room.createdAt,
      participantCount: room.participants.size,
      waitingCount: room.waiting.length,
      locked: room.locked,
      ended: room.ended,
      hostId: room.hostId,
      participants: [...room.participants.values()].map((e) => publicParticipant(e.participant)),
    };
  }

  /** Number of live rooms â€” surfaced by `/health` for diagnostics. */
  get roomCount(): number {
    return this.rooms.size;
  }

  /* ---------------------------------------------------------------- */
  /* Create / join                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Reserves a code without seating anyone.
   *
   * The landing page's "Join Meet" CTA needs a real link to navigate to before
   * it has a WebSocket, so a code must exist before the host connects. The
   * reservation is released by `release()` once the client seats itself with
   * `create({ code })`, or expires with the room if the client never arrives â€”
   * an abandoned reservation is indistinguishable from an abandoned room, and
   * is reaped identically.
   */
  reserve(requested?: string): { ok: true; code: string } | { ok: false; code: 'invalid_code' | 'room_full'; message: string } {
    const allocated = this.allocateCode(requested);
    if (!allocated.ok) return allocated;

    const now = this.now();
    this.rooms.set(allocated.code, {
      id: this.newId(),
      code: allocated.code,
      createdAt: now,
      hostId: null,
      locked: false,
      ended: false,
      participants: new Map(),
      waiting: [],
      chat: [],
      captions: [],
      cards: [],
      lastActivityAt: now,
    });
    return { ok: true, code: allocated.code };
  }

  /**
   * Releases a reservation, but only while it is still empty â€” otherwise a
   * client could delete a live room by replaying its own reservation code.
   */
  release(code: string): boolean {
    const room = this.room(code);
    if (!room || room.hostId !== null || room.participants.size > 0) return false;
    this.rooms.delete(room.code);
    return true;
  }

  /** True when this code exists and has nobody in it yet. */
  isReservation(code: string): boolean {
    const room = this.room(code);
    return !!room && room.hostId === null && room.participants.size === 0;
  }

  /**
   * Creates a room and seats the caller as host.
   *
   * Prefer an explicit `code` when the caller already has one. That code may
   * already exist as an empty *reservation* â€” that is the normal path for the
   * landing CTA, which minted a code over REST before opening its socket. Any
   * other taken code is refused rather than silently rehomed: a shared link
   * that quietly pointed at somebody else's meeting would be indefensible.
   */
create(
    conn: MeetingConnection,
    rawName: string,
    opts: { code?: string; lockOnJoin?: boolean } = {},
  ): CreateResult {
    // A connection may be a member of at most one room. The transport retires
    // the old room before re-creating; refusing here as well means a caller
    // that forgets cannot end up seated in two rooms, which would double every
    // frame it sends.
    const existingSeat = this.locateParticipant(conn.id);
    if (existingSeat) {
      return {
        kind: 'error',
        code: 'invalid_message',
        message: 'This connection is already in a meeting',
      };
    }

    const name = sanitizeName(rawName);
    const now = this.now();
    const id = conn.id;

    // Claim a reservation, if this is one.
    let claimed: Room | null = null;
    if (opts.code) {
      const key = normalizeCode(opts.code);
      if (!key) {
        return { kind: 'error', code: 'invalid_code', message: 'That is not a valid meeting code' };
      }
      const existing = this.rooms.get(key);
      if (existing) {
        if (existing.hostId !== null || existing.participants.size > 0) {
          return { kind: 'error', code: 'room_full', message: 'That meeting code is already in use' };
        }
        claimed = existing;
      }
    }

    const allocated = claimed
      ? ({ ok: true, code: claimed.code } as const)
      : this.allocateCode(opts.code);
    if (!allocated.ok) {
      return { kind: 'error', code: allocated.code, message: allocated.message };
    }

    const participant: SeatedParticipant = {
      id,
      name,
      role: 'host',
      state: { ...DEFAULT_PARTICIPANT_STATE },
      joinedAt: now,
      lastSeenAt: now,
    };

    let room: Room;
    if (claimed) {
      room = claimed;
      room.hostId = id;
      room.locked = opts.lockOnJoin === true;
      room.lastActivityAt = now;
    } else {
      room = {
        id: this.newId(),
        code: allocated.code,
        createdAt: now,
        hostId: id,
        locked: opts.lockOnJoin === true,
        ended: false,
        participants: new Map(),
        waiting: [],
        chat: [],
        captions: [],
        cards: [],
        lastActivityAt: now,
      };
      this.rooms.set(room.code, room);
    }

room.participants.set(id, { conn, participant });

    return { kind: 'joined', room, self: participant, others: [] };
  }

  /**
   * Joins an existing room.
   *
   * Locked rooms return a `queued` outcome carrying the queue position rather
   * than a failure: "waiting to be let in" is a normal state in this product,
   * not an error, and the caller still needs the host id to render it.
   */
  join(
    conn: MeetingConnection,
    rawCode: string,
    rawName: string,
): CreateResult | { kind: 'queued'; hostId: string; position: number } {
    // Same one-connection-one-room invariant as `create`.
    if (this.locateParticipant(conn.id)) {
      return { kind: 'error', code: 'invalid_message', message: 'This connection is already in a meeting' };
    }
    const room = this.room(rawCode);
    if (!room) return { kind: 'error', code: 'room_not_found', message: 'No meeting with that code' };
    if (room.ended) return { kind: 'error', code: 'room_ended', message: 'That meeting has ended' };

    const name = sanitizeName(rawName);

    if (room.locked && room.hostId !== null) {
      if (room.waiting.length >= MEETING_LIMITS.waitingQueueMax) {
        return { kind: 'error', code: 'room_full', message: 'The host is not letting anyone in right now' };
      }
const id = conn.id;
      room.waiting.push({ id, name, conn });
      room.lastActivityAt = this.now();
      // The host has to actually see the knock, or the gate is a black hole.
      room.participants.get(room.hostId)?.conn.send({ t: 'admit-request', request: { id, name } });
      return { kind: 'queued', hostId: room.hostId, position: room.waiting.length };
    }

    const now = this.now();
    const id = conn.id;
    if (room.participants.size >= this.rtc.meshLimit) {
      return {
        kind: 'error',
        code: 'room_full',
        message: `This meeting is full (${this.rtc.meshLimit} people max)`,
      };
    }

    const participant: SeatedParticipant = {
      id,
      name,
      role: 'guest',
      state: { ...DEFAULT_PARTICIPANT_STATE },
      joinedAt: now,
      lastSeenAt: now,
    };
    room.participants.set(id, { conn, participant });
    room.lastActivityAt = now;

    return {
      kind: 'joined',
      room,
      self: participant,
      others: [...room.participants.values()].map((e) => publicParticipant(e.participant)).filter((p) => p.id !== id),
    };
  }

  /** Approves a queued joiner. Only the host may call this. */
  admit(code: string, connId: string, targetId: string): CreateResult | { kind: 'none' } {
    const room = this.room(code);
    if (!room) return { kind: 'error', code: 'room_not_found', message: 'No meeting with that code' };
    if (room.hostId !== connId) return { kind: 'error', code: 'not_host', message: 'Only the host can admit people' };

    const idx = room.waiting.findIndex((w) => w.id === targetId);
    if (idx === -1) return { kind: 'none' };
    const [entry] = room.waiting.splice(idx, 1);

    if (room.participants.size >= this.rtc.meshLimit) {
      entry.conn.send({ t: 'error', code: 'room_full', message: 'That meeting just filled up' });
      entry.conn.close();
      return { kind: 'none' };
    }

    const now = this.now();
    const participant: SeatedParticipant = {
      id: entry.id,
      name: entry.name,
      role: 'guest',
      state: { ...DEFAULT_PARTICIPANT_STATE },
      joinedAt: now,
      lastSeenAt: now,
    };
room.participants.set(participant.id, { conn: entry.conn, participant });
    room.lastActivityAt = now;

    // The newly admitted client needs the roster and the ICE config; everyone
    // else just needs to know a person arrived.
    return {
      kind: 'joined',
      room,
      self: participant,
      others: [...room.participants.values()].map((e) => publicParticipant(e.participant)).filter((p) => p.id !== participant.id),
    };
  }

  /** Denies a queued joiner. */
  deny(code: string, connId: string, targetId: string): { ok: boolean; denied: MeetingConnection | null } {
    const room = this.room(code);
    if (!room || room.hostId !== connId) return { ok: false, denied: null };
    const idx = room.waiting.findIndex((w) => w.id === targetId);
    if (idx === -1) return { ok: false, denied: null };
    const [entry] = room.waiting.splice(idx, 1);
    return { ok: true, denied: entry.conn };
  }

  /** Removes a participant. Host-only; the target is notified. */
  remove(code: string, connId: string, targetId: string): { ok: boolean; removed: MeetingConnection | null } {
    const room = this.room(code);
    if (!room) return { ok: false, removed: null };
    if (room.hostId !== connId) return { ok: false, removed: null };
    if (targetId === connId) return { ok: false, removed: null };
    const entry = room.participants.get(targetId);
    if (!entry) return { ok: false, removed: null };
this.detach(room, targetId);
    return { ok: true, removed: entry.conn };
  }

  /** Host asks a participant to mute. Delivery is advisory; peers cannot enforce audio. */
  requestMute(code: string, connId: string, targetId: string): { ok: boolean; target: MeetingConnection | null } {
    const room = this.room(code);
    if (!room || room.hostId !== connId) return { ok: false, target: null };
    const entry = room.participants.get(targetId);
    if (!entry) return { ok: false, target: null };
    return { ok: true, target: entry.conn };
  }

  /** Ends the meeting for everyone. */
  end(code: string, connId: string): { ok: boolean; everyone: MeetingConnection[] } {
    const room = this.room(code);
    if (!room) return { ok: false, everyone: [] };
    if (room.hostId !== null && room.hostId !== connId) return { ok: false, everyone: [] };
    room.ended = true;
    const everyone = [...room.participants.values()].map((e) => e.conn);
    this.rooms.delete(room.code);
    return { ok: true, everyone };
  }

  /**
   * Detaches a connection from whatever room it is in, cleaning up the room
   * if it was the host. Returns the frames that must be delivered as a result.
   */
  detach(room: Room, connId: string): MeetingServerMsg[] {
    const frames: MeetingServerMsg[] = [];
    const entry = room.participants.get(connId);
    if (!entry) {
      // It may be sitting in the gate queue.
      const qIdx = room.waiting.findIndex((w) => w.id === connId);
      if (qIdx >= 0) room.waiting.splice(qIdx, 1);
      return frames;
    }
    room.participants.delete(connId);
    room.lastActivityAt = this.now();

    if (room.hostId === connId) {
      // Host migration: the longest-present remaining participant inherits the
      // room so an accidental host disconnect never orphans the meeting.
      const heir = [...room.participants.values()].sort((a, b) => a.participant.joinedAt - b.participant.joinedAt)[0];
      if (heir) {
        heir.participant.role = 'host';
        room.hostId = heir.participant.id;
        frames.push({ t: 'host-migrated', hostId: heir.participant.id });
      } else {
        room.hostId = null;
      }
    }

    frames.push({ t: 'peer-left', id: connId });

    if (room.participants.size === 0) {
      this.rooms.delete(room.code);
    }
    return frames;
  }

  /**
   * Finds the seated participant a connection id belongs to.
   *
   * A connection parked in the host gate has no participant record and is
   * deliberately invisible here: it may not broadcast frames or signal, only
   * wait to be let in.
   */
  locateParticipant(
    connId: string,
  ): { room: Room; entry: Seated } | null {
    for (const room of this.rooms.values()) {
      const entry = room.participants.get(connId);
      if (entry) return { room, entry };
    }
    return null;
  }

  /** True when this connection is sitting in a locked room's gate queue. */
  isWaiting(connId: string): boolean {
    for (const room of this.rooms.values()) {
      if (room.waiting.some((w) => w.id === connId)) return true;
    }
    return false;
  }

  /** Drops a queued joiner without admitting them. Used on socket close. */
  discardWaiting(connId: string): void {
    for (const room of this.rooms.values()) {
      const idx = room.waiting.findIndex((w) => w.id === connId);
      if (idx >= 0) {
        room.waiting.splice(idx, 1);
        return;
      }
    }
  }

  /** Heartbeat: bumps `lastSeenAt` so the reaper does not eat a live client. */
  touch(connId: string): void {
    const found = this.locateParticipant(connId);
    if (!found) return;
    found.entry.participant.lastSeenAt = this.now();
    found.room.lastActivityAt = this.now();
  }

  /* ---------------------------------------------------------------- */
  /* Frame handling                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Applies one client frame and returns the frames to deliver.
   *
   * `sender` is the connection id. Returns `[]` for frames that are purely
   * consumed by the registry (e.g. `signal`, which the transport relays
   * directly rather than fanning out).
   */
  handle(connId: string, frame: ParticipantFrame): MeetingServerMsg[] {
    const found = this.locateParticipant(connId);
    if (!found) return [];
    const { room, entry } = found;
    room.lastActivityAt = this.now();

    switch (frame.t) {
      case 'state': {
        entry.participant.state = { ...DEFAULT_PARTICIPANT_STATE, ...entry.participant.state, ...frame.state };
        entry.participant.lastSeenAt = this.now();
        return [{ t: 'state', id: connId, state: { ...entry.participant.state } }];
      }
      case 'chat': {
        const text = frame.text.trim();
        if (!text) return [];
        const name = entry.participant.name;
        const msg: ChatMessage = { id: connId, name, text, at: this.now() };
        room.chat.push(msg);
        if (room.chat.length > MEETING_LIMITS.chatBuffer) room.chat.shift();
        return [{ t: 'chat', id: connId, name, text, at: msg.at }];
      }
      case 'caption': {
        const text = frame.text.trim();
        if (!text) return [];
        const name = entry.participant.name;
        const line: CaptionLine = { id: connId, name, text, final: frame.final, at: this.now() };
        // An interim line replaces the speaker's previous interim rather than
        // appending, so a slow recogniser does not spam the transcript.
        if (!frame.final) {
          for (let i = room.captions.length - 1; i >= 0; i--) {
            const c = room.captions[i];
            if (c.id === connId && !c.final) {
              room.captions.splice(i, 1);
              break;
            }
          }
        }
        room.captions.push(line);
        if (room.captions.length > MEETING_LIMITS.captionBuffer) room.captions.shift();
        return [{ t: 'caption', id: connId, name, text, final: frame.final, at: line.at }];
      }
      case 'reaction': {
        if (!MEETING_REACTIONS.includes(frame.emoji as MeetingReaction)) return [];
        return [{ t: 'reaction', id: connId, name: entry.participant.name, emoji: frame.emoji, at: this.now() }];
      }
      case 'card': {
        // Cards are validated with the card-spec authority before fan-out. A
        // rejected card never reaches another participant's screen.
        const parsed = parseCard(frame.card);
        if (!parsed.ok) {
          this.log(`dropped invalid card from ${connId}: ${parsed.error}`);
          return [];
        }
        const rec: RoomCardEntry = {
          byId: connId,
          byName: entry.participant.name,
          card: parsed.value,
          topic: typeof frame.topic === 'string' ? frame.topic.slice(0, 400) : undefined,
          at: this.now(),
        };
        room.cards.push(rec);
        if (room.cards.length > MEETING_LIMITS.cardBuffer) room.cards.shift();
        return [{ t: 'card', id: connId, name: rec.byName, card: rec.card, topic: rec.topic, at: rec.at }];
      }
      case 'card-cleared': {
        return [{ t: 'card-cleared', id: connId }];
      }
      case 'ping': {
        return [{ t: 'pong' }];
      }
      case 'leave': {
        return this.detach(room, connId);
      }
      default:
        return [];
    }
  }

  /**
   * Routes a signalling payload to exactly one peer.
   *
   * Returns the target connection so the transport can deliver it directly â€”
   * signalling is never broadcast, or a mesh would echo offers back to their
   * own author and deadlock negotiation.
   */
routeSignal(
    code: string,
    connId: string,
    to: string,
    data: SignalPayload,
  ): { delivered: boolean } {
    const room = this.room(code);
    if (!room) return { delivered: false };
    // A peer may only signal members of its own room. Without this check the
    // relay would let any seated client inject SDP into an arbitrary room.
    if (!room.participants.has(connId)) return { delivered: false };
    const entry = room.participants.get(to);
    if (!entry) return { delivered: false };
    // Delivery happens here rather than being handed back, so "signal is never
    // broadcast" is enforced in one place instead of trusted to every caller.
    const delivered = entry.conn.send({ t: 'signal', from: connId, data });
    return { delivered };
  }

  /** Broadcasts to every *seated* participant in the room, sender included. */
  broadcast(room: Room, frames: MeetingServerMsg[], exceptId?: string): void {
for (const entry of room.participants.values()) {
      if (exceptId && entry.participant.id === exceptId) continue;
      for (const frame of frames) entry.conn.send(frame);
    }
  }

  get rtcConfig(): RtcConfig {
    return this.rtc;
  }

  private room(code: string): Room | null {
    const key = normalizeCode(code);
    if (!key) return null;
    return this.rooms.get(key) ?? null;
  }

  private allocateCode(
    requested?: string,
  ): { ok: true; code: string } | { ok: false; code: 'invalid_code' | 'room_full'; message: string } {
    if (requested) {
      const key = normalizeCode(requested);
      if (!key) return { ok: false, code: 'invalid_code', message: 'That is not a valid meeting code' };
      if (this.rooms.has(key)) {
        return { ok: false, code: 'room_full', message: 'That meeting code is already in use' };
      }
      return { ok: true, code: key };
    }
    // Probe forward from random codes on the (astronomically unlikely) collision.
    for (let probe = 0; probe < this.maxCodeProbes; probe++) {
      const candidate = probe === 0 ? this.nextCode() : offsetCode(this.nextCode(), probe);
      const key = normalizeCode(candidate) ?? formatCode(candidate);
      if (!this.rooms.has(key)) return { ok: true, code: key };
    }
    return { ok: false, code: 'room_full', message: 'Could not allocate a meeting code, please try again' };
  }
}

/** The subset of client frames the registry itself interprets. */
export type ParticipantFrame =
  | { t: 'state'; state: Partial<ParticipantState> }
  | { t: 'chat'; text: string }
  | { t: 'caption'; text: string; final: boolean }
  | { t: 'reaction'; emoji: string }
  | { t: 'card'; card: unknown; topic?: string }
  | { t: 'card-cleared' }
  | { t: 'ping' }
  | { t: 'leave' };

/** Builds the ICE configuration from env-provided STUN/TURN lists. */
export function buildRtcConfig(env: {
  stunUrl?: string;
  turnUrl?: string;
  turnUser?: string;
  turnCredential?: string;
  /** Raw env value; parsed and clamped. */
  meshLimit?: number | string;
}): RtcConfig {
  const iceServers: IceServerLite[] = [];
  const stun = (env.stunUrl ?? '').trim();
  iceServers.push({ urls: splitUrls(stun, ['stun:stun.l.google.com:19302']) });

const turn = (env.turnUrl ?? '').trim();
  if (turn) {
    // The keys are added only when they have values: `username: undefined`
    // survives `JSON.stringify` as a present-but-empty field on some paths, and
    // a null TURN credential makes some clients reject the whole config.
    const server: IceServerLite = { urls: splitUrls(turn) };
    if (env.turnUser) server.username = env.turnUser;
    if (env.turnCredential) server.credential = env.turnCredential;
    iceServers.push(server);
  }

  return {
    iceServers,
    meshLimit: clampMeshLimit(env.meshLimit),
  };
}

/** Splits a comma-separated env list, falling back to `fallback` when empty. */
function splitUrls(raw: string, fallback: string[] = []): string[] {
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

export function clampMeshLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 6;
  return Math.min(12, Math.max(1, Math.floor(n)));
}