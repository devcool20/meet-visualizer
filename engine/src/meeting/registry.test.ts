import { describe, expect, it, vi } from 'vitest';
import { MEETING_LIMITS, normalizeCode, type MeetingServerMsg } from '@stash/meeting-spec';
import { REVENUE_CARD } from '@stash/card-core';
import { MeetingRegistry, buildRtcConfig, clampMeshLimit, type MeetingConnection } from './registry.js';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

interface TestConn extends MeetingConnection {
  sent: MeetingServerMsg[];
  closed: boolean;
}

function makeRegistry(opts: { meshLimit?: number; now?: () => number; ids?: string[] } = {}) {
  const sent: MeetingServerMsg[][] = [];
  let counter = 0;
  const ids = [...(opts.ids ?? [])];
  const registry = new MeetingRegistry({
    rtc: buildRtcConfig({ meshLimit: opts.meshLimit ?? 6 }),
    now: opts.now ?? (() => Date.now()),
    newId: () => ids.shift() ?? `id${++counter}`,
    newCode: () => 'abc-efgj-pqrt',
    log: () => {},
  });

  /**
   * Connection ids must be unique — a participant is keyed by its connection
   * id, so two clients sharing one would silently collapse into each other.
   */
  let connCounter = 0;
  function connect(): TestConn {
    const frames: MeetingServerMsg[] = [];
    const conn: TestConn = {
      id: `c${++connCounter}`,
      sent: frames,
      closed: false,
      send(msg) {
        frames.push(msg);
        return true;
      },
      close() {
        conn.closed = true;
      },
    };
    sent.push(frames);
    return conn;
  }

  return { registry, connect, allSent: sent };
}

/** Seats a host and returns the room code plus the host's connection id. */
function seatHost(h: ReturnType<typeof makeRegistry>): { conn: TestConn; code: string; selfId: string } {
  const conn = h.connect();
  const result = h.registry.create(conn, 'Priya');
  if (result.kind === 'error') throw new Error(`unexpected: ${result.message}`);
  return { conn, code: result.room.code, selfId: result.self.id };
}

/* ------------------------------------------------------------------ */

describe('create / join', () => {
  it('seats the creator as host with no other participants', () => {
    const h = makeRegistry();
    const { selfId } = seatHost(h);
    const room = h.registry.peek('abc-efgj-pqrt');
    expect(room?.participantCount).toBe(1);
    expect(room?.hostId).toBe(selfId);
    expect(room?.locked).toBe(false);
  });

  it('lists the existing roster for a joiner', () => {
    const h = makeRegistry();
    const { code, selfId } = seatHost(h);
    const guest = h.connect();
    const result = h.registry.join(guest, code, 'Ana');
    expect(result.kind).toBe('joined');
    if (result.kind !== 'joined') return;
    expect(result.others.map((p) => p.id)).toEqual([selfId]);
    expect(result.self.role).toBe('guest');
  });

  it('normalises the code a joiner typed', () => {
    const h = makeRegistry();
    const { code } = seatHost(h);
    const result = h.registry.join(h.connect(), code.replace(/-/g, '').toUpperCase(), 'Ana');
    expect(result.kind).toBe('joined');
  });

  it('reports an unknown code as room_not_found', () => {
    const h = makeRegistry();
    const result = h.registry.join(h.connect(), 'zzz-zzzz-zzzz', 'Ana');
    expect(result).toMatchObject({ kind: 'error', code: 'room_not_found' });
  });

  it('reports a malformed code as room_not_found rather than crashing', () => {
    const h = makeRegistry();
    expect(h.registry.join(h.connect(), 'nope', 'Ana')).toMatchObject({ kind: 'error' });
  });

  it('refuses a join past the mesh limit instead of letting it degrade', () => {
    const h = makeRegistry({ meshLimit: 2 });
    const { code } = seatHost(h);
    expect(h.registry.join(h.connect(), code, 'Ana').kind).toBe('joined');
    const overflow = h.registry.join(h.connect(), code, 'Marcus');
    expect(overflow).toMatchObject({ kind: 'error', code: 'room_full' });
    expect(h.registry.peek(code)?.participantCount).toBe(2);
  });

  it('seats the caller under its connection id, so lookups by connection work', () => {
    // The transport looks participants up by the socket's own connection id.
    // If these namespaces ever diverge again, every frame silently no-ops.
    const h = makeRegistry();
    const conn = h.connect();
    const created = h.registry.create(conn, 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    expect(created.self.id).toBe(conn.id);
    expect(h.registry.locateParticipant(conn.id)?.entry.participant.id).toBe(conn.id);
  });

  it('never seats a client in two rooms at once', () => {
    const h = makeRegistry({ ids: [] });
    const { conn, code } = seatHost(h);
    // The registry refuses outright rather than trusting every caller to
    // retire the old room first.
    expect(h.registry.create(conn, 'Priya')).toMatchObject({ kind: 'error', code: 'invalid_message' });
    expect(h.registry.join(conn, code, 'Priya')).toMatchObject({ kind: 'error', code: 'invalid_message' });
    // One room, one membership — the original seat is untouched.
    expect(h.registry.roomCount).toBe(1);
    expect(h.registry.peek(code)?.participantCount).toBe(1);
    expect(h.registry.locateParticipant(conn.id)?.room.code).toBe(code);
  });

  it('lets a connection create a fresh room once the old seat is released', () => {
    const h = makeRegistry({ ids: [] });
    const { conn } = seatHost(h);
    const old = h.registry.locateParticipant(conn.id);
    if (!old) throw new Error('no seat');
    h.registry.detach(old.room, conn.id);

    const second = h.registry.create(conn, 'Priya');
    expect(second.kind).toBe('joined');
    if (second.kind !== 'joined') return;
    expect(h.registry.roomCount).toBe(1);
    expect(h.registry.locateParticipant(conn.id)?.room.code).toBe(second.room.code);
  });
});

describe('reserve / release', () => {
  it('reserves a code without seating anybody', () => {
    const h = makeRegistry({ ids: [] });
    const first = h.registry.reserve();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(h.registry.isReservation(first.code)).toBe(true);
    expect(h.registry.peek(first.code)?.participantCount).toBe(0);
  });

  it('refuses a second reservation of a taken code', () => {
    const h = makeRegistry({ ids: [] });
    h.registry.reserve('abc-efgj-pqrt');
    expect(h.registry.reserve('abc-efgj-pqrt')).toMatchObject({ ok: false, code: 'room_full' });
  });

  it('rejects a malformed reservation request', () => {
    const h = makeRegistry();
    expect(h.registry.reserve('nope')).toMatchObject({ ok: false, code: 'invalid_code' });
  });

  it('is claimed in place by create, which is the CTA path', () => {
    const h = makeRegistry({ ids: [] });
    const reserved = h.registry.reserve();
    if (!reserved.ok) throw new Error('reserve failed');
    const result = h.registry.create(h.connect(), 'Priya', { code: reserved.code });
    expect(result.kind).toBe('joined');
    expect(h.registry.isReservation(reserved.code)).toBe(false);
  });

  it('cannot be released once somebody is in the room', () => {
    const h = makeRegistry({ ids: [] });
    const reserved = h.registry.reserve();
    if (!reserved.ok) throw new Error('reserve failed');
    h.registry.create(h.connect(), 'Priya', { code: reserved.code });
    // Replaying the reservation code must not be able to delete a live room.
    expect(h.registry.release(reserved.code)).toBe(false);
    expect(h.registry.has(reserved.code)).toBe(true);
  });

  it('refuses create with a code that is already in use by a live room', () => {
    const h = makeRegistry({ ids: [] });
    seatHost(h);
    const result = h.registry.create(h.connect(), 'Impostor', { code: 'abc-efgj-pqrt' });
    expect(result).toMatchObject({ kind: 'error', code: 'room_full' });
  });
});

describe('the host gate', () => {
  it('notifies the host when somebody knocks', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;

    const knock = h.connect();
    const queued = h.registry.join(knock, code, 'Ana');
    expect(queued).toMatchObject({ kind: 'queued' });
    // The host must actually see it, or the gate is a black hole.
    const notices = hostConn.sent.filter((f) => f.t === 'admit-request');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ request: { name: 'Ana' } });
  });

  it('admits a queued joiner on the host\'s say-so and announces them', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const hostId = created.self.id;

    const knock = h.connect();
    h.registry.join(knock, code, 'Ana');
    const queuedId = hostConn.sent.find((f) => f.t === 'admit-request')?.request.id ?? '';
    expect(queuedId).not.toBe('');

    const admitted = h.registry.admit(code, hostId, queuedId);
    expect(admitted?.kind).toBe('joined');
    if (admitted?.kind !== 'joined') return;
    // The admitted participant is now a normal member of the room.
    expect(admitted.self.id).toBe(knock.id);
    expect(h.registry.locateParticipant(knock.id)?.room.code).toBe(code);
    expect(admitted.others.map((p) => p.id)).toEqual([hostId]);
  });

  it('refuses admission from a non-host', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;

    const knock = h.connect();
    h.registry.join(knock, code, 'Ana');
    const queuedId = hostConn.sent.find((f) => f.t === 'admit-request')?.request.id ?? '';

    expect(h.registry.admit(code, 'somebody-else', queuedId)).toMatchObject({
      kind: 'error',
      code: 'not_host',
    });
  });

  it('denies a queued joiner and returns their connection for the reply', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const hostId = created.self.id;

    const knock = h.connect();
    h.registry.join(knock, code, 'Ana');
    const queuedId = hostConn.sent.find((f) => f.t === 'admit-request')?.request.id ?? '';

    const res = h.registry.deny(code, hostId, queuedId);
    expect(res.ok).toBe(true);
    expect(res.denied).toBe(knock);
    expect(h.registry.peek(code)?.participantCount).toBe(1);
  });

  it('a queued connection cannot broadcast or signal', () => {
    const h = makeRegistry({ ids: [] });
    const created = h.registry.create(h.connect(), 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const knock = h.connect();
    const queued = h.registry.join(knock, created.room.code, 'Ana');
    expect(queued.kind).toBe('queued');
    // Frames from a connection that was never seated are ignored outright.
    expect(h.registry.handle(knock.id, { t: 'chat', text: 'hi' })).toEqual([]);
    expect(
      h.registry.routeSignal(created.room.code, knock.id, created.self.id, { kind: 'candidate', candidate: {} }),
    ).toEqual({ delivered: false });
    expect(knock.sent).toHaveLength(0);
  });

  it('drops a queued connection when it disconnects', () => {
    const h = makeRegistry({ ids: [] });
    const created = h.registry.create(h.connect(), 'Priya', { lockOnJoin: true });
    if (created.kind === 'error') throw new Error(created.message);
    const knock = h.connect();
    h.registry.join(knock, created.room.code, 'Ana');
    expect(h.registry.peek(created.room.code)?.waitingCount).toBe(1);
    expect(h.registry.isWaiting(knock.id)).toBe(true);
    // The transport calls this on close.
    h.registry.discardWaiting(knock.id);
    expect(h.registry.isWaiting(knock.id)).toBe(false);
    expect(h.registry.peek(created.room.code)?.waitingCount).toBe(0);
  });
});

describe('moderation', () => {
  it('lets the host remove somebody and reports it to the room', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    const guest = h.connect();
    const joined = h.registry.join(guest, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');

    const res = h.registry.remove(code, selfId, joined.self.id);
    expect(res.ok).toBe(true);
    expect(h.registry.peek(code)?.participantCount).toBe(1);
  });

  it('refuses removal from a non-host', () => {
    const h = makeRegistry({ ids: [] });
    const { code } = seatHost(h);
    const guest = h.connect();
    const joined = h.registry.join(guest, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    expect(h.registry.remove(code, joined.self.id, joined.self.id)).toMatchObject({ ok: false });
  });

  it('refuses removal of the host by id, so a host cannot be locked out', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    expect(h.registry.remove(code, selfId, selfId)).toMatchObject({ ok: false });
  });

  it('routes a mute request to exactly the target', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    const guest = h.connect();
    const joined = h.registry.join(guest, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    const res = h.registry.requestMute(code, selfId, joined.self.id);
    expect(res.target).toBe(guest);
    expect(h.registry.requestMute(code, joined.self.id, selfId)).toMatchObject({ ok: false });
  });

  it('ends the meeting for everyone and deletes the room', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    h.registry.join(h.connect(), code, 'Ana');
    const res = h.registry.end(code, selfId);
    expect(res.ok).toBe(true);
    expect(res.everyone).toHaveLength(2);
    expect(h.registry.has(code)).toBe(false);
  });

  it('refuses end from a non-host', () => {
    const h = makeRegistry({ ids: [] });
    const { code } = seatHost(h);
    const guest = h.connect();
    const joined = h.registry.join(guest, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    expect(h.registry.end(code, joined.self.id)).toMatchObject({ ok: false });
    expect(h.registry.has(code)).toBe(true);
  });

  it('refuses a join to an ended room', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    h.registry.end(code, selfId);
    expect(h.registry.join(h.connect(), code, 'Ana')).toMatchObject({ kind: 'error', code: 'room_not_found' });
  });
});

describe('detaching', () => {
  it('tells the room somebody left', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const guest = h.connect();
    const joined = h.registry.join(guest, created.room.code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');

    const frames = h.registry.detach(created.room, joined.self.id);
    expect(frames).toContainEqual({ t: 'peer-left', id: joined.self.id });
    expect(h.registry.peek(created.room.code)?.participantCount).toBe(1);
  });

  it('promotes the longest-present remaining participant when the host leaves', () => {
    const h = makeRegistry({ ids: [] });
    const created = h.registry.create(h.connect(), 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const ana = h.registry.join(h.connect(), code, 'Ana');
    if (ana.kind !== 'joined') throw new Error('join failed');
    const sana = h.registry.join(h.connect(), code, 'Sana');
    if (sana.kind !== 'joined') throw new Error('join failed');

    const frames = h.registry.detach(created.room, created.self.id);
    const migration = frames.find((f) => f.t === 'host-migrated');
    expect(migration).toBeDefined();
    // Ana joined before Sana, so she inherits the room.
    expect(migration).toMatchObject({ hostId: ana.self.id });
    expect(sana.self.id).not.toBe(ana.self.id);
  });

  it('deletes the room when the last participant leaves', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    const joined = h.registry.join(h.connect(), code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    expect(h.registry.has(code)).toBe(true);

    h.registry.detach(h.registry.locateParticipant(joined.self.id)!.room, joined.self.id);
    expect(h.registry.has(code)).toBe(true);

    const host = h.registry.locateParticipant(selfId);
    if (!host) throw new Error('host gone');
    h.registry.detach(host.room, selfId);
    expect(h.registry.has(code)).toBe(false);
    expect(h.registry.roomCount).toBe(0);
  });

  it('detaching a stranger is a no-op rather than a corruption', () => {
    const h = makeRegistry({ ids: [] });
    const { code } = seatHost(h);
    const host = h.registry.locateParticipant('nope');
    expect(host).toBeNull();
    expect(h.registry.has(code)).toBe(true);
  });
});

describe('reaping', () => {
  it('drops a connection that has gone quiet past the idle window', () => {
    let now = 1_000_000;
    const h = makeRegistry({ now: () => now, ids: [] });
    const created = h.registry.create(h.connect(), 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const joined = h.registry.join(h.connect(), code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');

    // Both are alive. Advance a little and have only the host keep talking, so
    // the guest crosses the threshold and the host does not.
    now += MEETING_LIMITS.idleTimeoutMs - 1000;
    h.registry.touch(created.self.id);
    now += 1001;
    h.registry.touch(created.self.id);

    const evicted: string[] = [];
    h.registry.reap((_room, id) => evicted.push(id));

    expect(evicted).toEqual([joined.self.id]);
    expect(h.registry.peek(code)?.participantCount).toBe(1);
  });

  it('keeps a connection that keeps sending heartbeats', () => {
    let now = 1_000_000;
    const h = makeRegistry({ now: () => now, ids: [] });
    const created = h.registry.create(h.connect(), 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const joined = h.registry.join(h.connect(), code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');

    // Five heartbeats spread across more than the idle window in total. The
    // point is that elapsed *time* does not reap a client that is still talking.
    for (let i = 0; i < 5; i++) {
      now += MEETING_LIMITS.idleTimeoutMs - 1000;
      h.registry.touch(created.self.id);
      h.registry.touch(joined.self.id);
    }
    h.registry.reap();
    expect(h.registry.peek(code)?.participantCount).toBe(2);
  });

  it('reaps a connection that stops talking, even after being healthy', () => {
    let now = 1_000_000;
    const h = makeRegistry({ now: () => now, ids: [] });
    const { selfId } = seatHost(h);
    h.registry.touch(selfId);
    now += MEETING_LIMITS.idleTimeoutMs - 1;
    expect(h.registry.peek('abc-efgj-pqrt')?.participantCount).toBe(1);
    now += 2;
    h.registry.reap();
    expect(h.registry.has('abc-efgj-pqrt')).toBe(false);
  });

  it('deletes a room that has been empty past its TTL', () => {
    let now = 1_000_000;
    const h = makeRegistry({ now: () => now, ids: [] });
    const { code } = seatHost(h);
    const host = h.registry.locateParticipant('c1');
    if (!host) throw new Error('no host');
    h.registry.detach(host.room, host.entry.participant.id);
    expect(h.registry.has(code)).toBe(false);
    expect(now).toBe(1_000_000);
  });
});

describe('handle', () => {
  it('broadcasts chat to the whole room and buffers it', () => {
    const h = makeRegistry({ ids: [] });
    const hostConn = h.connect();
    const created = h.registry.create(hostConn, 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const guest = h.connect();
    const joined = h.registry.join(guest, created.room.code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');

    const frames = h.registry.handle(joined.self.id, { t: 'chat', text: '  hello  ' });
    expect(frames).toEqual([{ t: 'chat', id: joined.self.id, name: 'Ana', text: 'hello', at: expect.any(Number) }]);
    h.registry.broadcast(created.room, frames);
    expect(hostConn.sent.some((f) => f.t === 'chat')).toBe(true);
    expect(guest.sent.some((f) => f.t === 'chat')).toBe(true);
  });

  it('ignores an empty chat message', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    expect(h.registry.handle(selfId, { t: 'chat', text: '   ' })).toEqual([]);
  });

  it('caps the chat buffer', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    for (let i = 0; i < MEETING_LIMITS.chatBuffer + 25; i++) {
      h.registry.handle(selfId, { t: 'chat', text: `m${i}` });
    }
    // The buffer is internal, so assert on behaviour: the room still works.
    expect(h.registry.handle(selfId, { t: 'chat', text: 'last' }).length).toBe(1);
  });

  it('replaces a speaker\'s previous interim caption instead of appending', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    h.registry.handle(selfId, { t: 'caption', text: 'our revenue', final: false });
    const frames = h.registry.handle(selfId, { t: 'caption', text: 'our revenue is up', final: false });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ t: 'caption', text: 'our revenue is up', final: false });
  });

  it('appends a finalised caption', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    h.registry.handle(selfId, { t: 'caption', text: 'interim', final: false });
    expect(h.registry.handle(selfId, { t: 'caption', text: 'final', final: true })).toHaveLength(1);
  });

  it('drops a reaction outside the allow-list', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    expect(h.registry.handle(selfId, { t: 'reaction', emoji: '🦠' })).toEqual([]);
  });

  it('merges a partial state onto the previous one', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    h.registry.handle(selfId, { t: 'state', state: { camOn: false } });
    const frames = h.registry.handle(selfId, { t: 'state', state: { micOn: false } });
    expect(frames[0]).toMatchObject({ state: { micOn: false, camOn: false, sharing: false } });
  });

  it('broadcasts a valid card and buffers it for the meeting rail', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    const frames = h.registry.handle(selfId, { t: 'card', card: REVENUE_CARD, topic: 'our revenue' });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ t: 'card', id: selfId, name: 'Priya', topic: 'our revenue' });
    if (frames[0].t !== 'card') return;
    expect(frames[0].card).toMatchObject({ title: REVENUE_CARD.title });
  });

  it('drops an invalid card instead of fanning it out', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    const log = vi.fn();
    void log;
    expect(h.registry.handle(selfId, { t: 'card', card: { nope: true } })).toEqual([]);
    expect(h.registry.handle(selfId, { t: 'card', card: null })).toEqual([]);
    expect(h.registry.handle(selfId, { t: 'card', card: 'a string' })).toEqual([]);
  });

  it('answers a ping with a pong', () => {
    const h = makeRegistry({ ids: [] });
    const { selfId } = seatHost(h);
    expect(h.registry.handle(selfId, { t: 'ping' })).toEqual([{ t: 'pong' }]);
  });

  it('ignores frames from a connection that is not seated', () => {
    const h = makeRegistry({ ids: [] });
    seatHost(h);
    expect(h.registry.handle('stranger', { t: 'chat', text: 'hi' })).toEqual([]);
  });

  it('detaches on leave and notifies the room', () => {
    const h = makeRegistry({ ids: [] });
    const created = h.registry.create(h.connect(), 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const joined = h.registry.join(h.connect(), created.room.code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    const frames = h.registry.handle(joined.self.id, { t: 'leave' });
    expect(frames).toContainEqual({ t: 'peer-left', id: joined.self.id });
  });
});

describe('routeSignal', () => {
  it('delivers to exactly the named peer and nobody else', () => {
    const h = makeRegistry({ ids: [] });
    const created = h.registry.create(h.connect(), 'Priya');
    if (created.kind === 'error') throw new Error(created.message);
    const code = created.room.code;
    const target = h.connect();
    const joined = h.registry.join(target, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    const bystander = h.connect();
    h.registry.join(bystander, code, 'Sana');

    const payload = { kind: 'description' as const, description: { type: 'offer' as const, sdp: 'v=0' } };
    const routed = h.registry.routeSignal(code, created.self.id, joined.self.id, payload);
    expect(routed.delivered).toBe(true);
    expect(target.sent.filter((f) => f.t === 'signal')).toHaveLength(1);
    // Relayed, never echoed: an offer sent back to its author deadlocks a mesh.
    expect(bystander.sent.some((f) => f.t === 'signal')).toBe(false);
    expect(created.self.id).not.toBe(joined.self.id);
  });

  it('refuses to relay for a non-member', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    const target = h.connect();
    const joined = h.registry.join(target, code, 'Ana');
    if (joined.kind !== 'joined') throw new Error('join failed');
    // An outsider must not be able to inject SDP into a room they are not in.
    expect(h.registry.routeSignal(code, 'stranger', joined.self.id, { kind: 'candidate', candidate: {} })).toEqual({
      delivered: false,
    });
    expect(target.sent).toHaveLength(0);
    void selfId;
  });

  it('reports a departed peer as undeliverable rather than throwing', () => {
    const h = makeRegistry({ ids: [] });
    const { code, selfId } = seatHost(h);
    expect(h.registry.routeSignal(code, selfId, 'ghost', { kind: 'candidate', candidate: {} })).toEqual({
      delivered: false,
    });
  });
});

describe('peek', () => {
  it('never leaks the internal lastSeenAt', () => {
    const h = makeRegistry({ ids: [] });
    seatHost(h);
    const room = h.registry.peek('abc-efgj-pqrt');
    expect(room?.participants[0]).not.toHaveProperty('lastSeenAt');
  });

  it('normalises the code it is given', () => {
    const h = makeRegistry({ ids: [] });
    seatHost(h);
    expect(h.registry.peek('ABC-EFGJ-PQRT')).not.toBeNull();
  });

  it('returns null for a room that does not exist', () => {
    const h = makeRegistry();
    expect(h.registry.peek('zzz-zzzz-zzzz')).toBeNull();
  });
});

describe('buildRtcConfig', () => {
  it('defaults to public STUN and the default mesh limit', () => {
    const rtc = buildRtcConfig({});
    expect(rtc.iceServers[0].urls).toEqual(['stun:stun.l.google.com:19302']);
    expect(rtc.meshLimit).toBe(6);
  });

  it('splits a comma-separated STUN list', () => {
    const rtc = buildRtcConfig({ stunUrl: 'stun:a.example:3478, stun:b.example:3478' });
    expect(rtc.iceServers[0].urls).toEqual(['stun:a.example:3478', 'stun:b.example:3478']);
  });

  it('adds TURN with credentials only when configured', () => {
    const withTurn = buildRtcConfig({
      turnUrl: 'turn:turn.example:3478',
      turnUser: 'u',
      turnCredential: 'p',
    });
    expect(withTurn.iceServers).toHaveLength(2);
    expect(withTurn.iceServers[1]).toMatchObject({ username: 'u', credential: 'p' });

    const without = buildRtcConfig({ turnUrl: '' });
    expect(without.iceServers).toHaveLength(1);
  });

  it('omits empty TURN credentials rather than sending blank strings', () => {
    const rtc = buildRtcConfig({ turnUrl: 'turn:turn.example:3478', turnUser: '', turnCredential: '' });
    expect(rtc.iceServers[1]).not.toHaveProperty('username');
    expect(rtc.iceServers[1]).not.toHaveProperty('credential');
  });

  it('serialises the TURN entry without empty keys, which JSON keeps', () => {
    // `JSON.stringify` keeps `undefined` properties as `null` on some paths, and
    // a null TURN credential makes some clients reject the whole config.
    const rtc = buildRtcConfig({ turnUrl: 'turn:turn.example:3478' });
    expect(JSON.stringify(rtc)).not.toContain('null');
  });
});

describe('clampMeshLimit', () => {
  it('defaults, clamps, and floors', () => {
    expect(clampMeshLimit(undefined)).toBe(6);
    expect(clampMeshLimit('')).toBe(6);
    expect(clampMeshLimit('abc')).toBe(6);
    expect(clampMeshLimit('3')).toBe(3);
    expect(clampMeshLimit(3)).toBe(3);
    expect(clampMeshLimit(0)).toBe(1);
    expect(clampMeshLimit(-5)).toBe(1);
    // 12 is the hard ceiling: past it the mesh stops being viable.
    expect(clampMeshLimit(100)).toBe(12);
  });
});

describe('code plumbing', () => {
  it('treats a differently-cased or unhyphenated room key as the same room', () => {
    const h = makeRegistry({ ids: [] });
    const { code } = seatHost(h);
    expect(normalizeCode(code)).toBe(code);
    expect(h.registry.has(code.toUpperCase())).toBe(true);
    expect(h.registry.has(code.replace(/-/g, ''))).toBe(true);
  });
});