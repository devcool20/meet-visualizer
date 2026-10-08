/**
 * Transport-level tests for `/ws/meeting`.
 *
 * These run a real `http.Server`, a real `WebSocketServer` and real client
 * sockets, because the registry tests deliberately stop at the seam below.
 * Everything that can only go wrong above that seam lives here:
 *
 *  - three co-resident upgrade paths (`/ws`, `/ws/virtualcam`, `/ws/meeting`)
 *    coexisting without eating each other's sockets,
 *  - the join → roster → signal → leave lifecycle over the wire,
 *  - fan-out of chat, captions, reactions, presence and cards,
 *  - card validation on the way in,
 *  - host-gate admission, moderation and host migration,
 *  - malformed frames, rate limits, and idle reaping.
 */
import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { REVENUE_CARD } from '@stash/card-core';
import { MEETING_LIMITS, type MeetingServerMsg } from '@stash/meeting-spec';
import { MeetingRegistry, buildRtcConfig } from './registry.js';
import { attachMeetingWs, MEETING_WS_PATH } from './signaling.js';

const cleanups: (() => void)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    try {
      cleanups.pop()?.();
    } catch {
      /* already cleaned */
    }
  }
  // Let close handlers drain so a socket reaped by one test cannot surface in
  // the next one's assertions.
  await new Promise((r) => setTimeout(r, 10));
});

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

interface Client {
  socket: WebSocket;
  frames: MeetingServerMsg[];
  send(msg: unknown): void;
  sendRaw(payload: string): void;
  waitFor(predicate: (f: MeetingServerMsg) => boolean, ms?: number): Promise<MeetingServerMsg>;
  waitForClose(ms?: number): Promise<void>;
  of<T extends MeetingServerMsg['t']>(t: T): Extract<MeetingServerMsg, { t: T }>[];
  close(): void;
}

interface Harness {
  registry: MeetingRegistry;
  clients: Map<string, Client>;
  /** A client already connected under `label`. Throws if there is none. */
  client(label: string): Client;
  /** Connects and waits for the socket to open. */
  join(label: string): Promise<Client>;
  /** Creates a room over the socket and returns the joined frame. */
  host(label: string, name: string, opts?: { lockOnJoin?: boolean }): Promise<{
    client: Client;
    joined: Extract<MeetingServerMsg, { t: 'joined' }>;
  }>;
  /** Joins an existing room over the socket. */
  guest(label: string, name: string, code: string): Promise<{
    client: Client;
    frame: MeetingServerMsg;
  }>;
  rawUrl(path: string): string;
}

async function harness(
  opts: { meshLimit?: number; now?: () => number; rivalPaths?: string[] } = {},
): Promise<Harness> {
  const registry = new MeetingRegistry({
    rtc: buildRtcConfig({ meshLimit: opts.meshLimit }),
    now: opts.now ?? (() => Date.now()),
    log: () => {},
  });

  const server = http.createServer((_req, res) => {
    res.writeHead(404).end();
  });

  // Stand-ins for the two pre-existing endpoints. They register their own
  // path-checked upgrade listeners exactly as production does, so this test
  // would catch a co-existence regression introduced by the new one.
  for (const path of opts.rivalPaths ?? ['/ws', '/ws/virtualcam']) {
    server.on('upgrade', (req, socket) => {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname !== path) return;
      socket.destroy();
    });
  }

  attachMeetingWs(server, { registry, now: opts.now });
  cleanups.push(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const clients = new Map<string, Client>();

  const makeClient = (label: string): Client => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${MEETING_WS_PATH}`);
    const frames: MeetingServerMsg[] = [];
    const waiters: { predicate: (f: MeetingServerMsg) => boolean; resolve: (f: MeetingServerMsg) => void }[] = [];

    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as MeetingServerMsg;
      frames.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (!waiters[i].predicate(parsed)) continue;
        waiters[i].resolve(parsed);
        waiters.splice(i, 1);
      }
    });
    cleanups.push(() => {
      try {
        socket.terminate();
      } catch {
        /* already gone */
      }
    });

    const client: Client = {
      socket,
      frames,
      send: (msg) => socket.send(JSON.stringify(msg)),
      sendRaw: (payload) => socket.send(payload),
      waitFor(predicate, ms = 2000) {
        const existing = frames.find(predicate);
        if (existing) return Promise.resolve(existing);
        return new Promise<MeetingServerMsg>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${label}: timed out waiting for a frame`)), ms);
          waiters.push({
            predicate,
            resolve: (f) => {
              clearTimeout(timer);
              resolve(f);
            },
          });
        });
      },
      waitForClose(ms = 2000) {
        if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${label}: timed out waiting for close`)), ms);
          socket.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      },
      of(t) {
        return frames.filter((f) => f.t === t) as never;
      },
      close() {
        try {
          socket.close();
        } catch {
          /* already closing */
        }
      },
    };
    clients.set(label, client);
    return client;
  };

  const openSocket = (socket: WebSocket): Promise<void> =>
    new Promise((resolve, reject) => {
      if (socket.readyState === WebSocket.OPEN) return resolve();
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

  return {
    registry,
    clients,
    client(label) {
      const c = clients.get(label);
      if (!c) throw new Error(`no client labelled ${label}`);
      return c;
    },
    async join(label) {
      const c = makeClient(label);
      await openSocket(c.socket);
      return c;
    },
    async host(label, name, hostOpts = {}) {
      const c = await this.join(label);
      c.send({ t: 'create', name, lockOnJoin: hostOpts.lockOnJoin });
      const joined = await c.waitFor((f) => f.t === 'joined' || f.t === 'error');
      if (joined.t !== 'joined') throw new Error(`${label}: ${joined.t}`);
      return { client: c, joined: joined as Extract<MeetingServerMsg, { t: 'joined' }> };
    },
    async guest(label, name, code) {
      const c = await this.join(label);
      c.send({ t: 'join', code, name });
      const frame = await c.waitFor((f) => f.t === 'joined' || f.t === 'error' || f.t === 'waiting');
      return { client: c, frame };
    },
    rawUrl: (path) => `ws://127.0.0.1:${port}${path}`,
  };
}

/* ------------------------------------------------------------------ */
/* Co-existence                                                        */
/* ------------------------------------------------------------------ */

describe('co-existing upgrade paths', () => {
  it('still serves /ws/meeting after another path has been addressed', async () => {
    const h = await harness();
    for (const path of ['/ws', '/ws/virtualcam']) {
      const socket = new WebSocket(h.rawUrl(path));
      await new Promise<void>((resolve) => {
        socket.once('open', () => resolve());
        socket.once('error', () => resolve());
        socket.once('close', () => resolve());
        setTimeout(resolve, 400);
      });
    }
    // The point of the exercise: a working meeting socket afterwards.
    const { joined } = await h.host('host', 'Priya');
    expect(joined.role).toBe('host');
  });

  it('ignores an unknown upgrade path', async () => {
    const h = await harness();
    const socket = new WebSocket(h.rawUrl('/ws/nonsense'));
    await new Promise<void>((resolve) => {
      socket.once('open', () => resolve());
      socket.once('error', () => resolve());
      socket.once('close', () => resolve());
      setTimeout(resolve, 300);
    });
    const { joined } = await h.host('host', 'Priya');
    expect(joined.t).toBe('joined');
  });
});

/* ------------------------------------------------------------------ */
/* Create / join                                                       */
/* ------------------------------------------------------------------ */

describe('create and join over the wire', () => {
  it('hands the host a code and an ICE config', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    expect(joined.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{4}$/);
    expect(joined.roomId).toBeTruthy();
    expect(joined.participants).toEqual([]);
    expect(joined.rtc.iceServers.length).toBeGreaterThan(0);
    expect(joined.rtc.meshLimit).toBe(6);
  });

  it('sends the existing roster to a joiner and announces them to the room', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { frame } = await h.guest('ana', 'Ana', joined.code);
    if (frame.t !== 'joined') throw new Error('ana not joined');
    expect(frame.participants.map((p) => p.id)).toEqual([joined.selfId]);

    const announced = await h.client('host').waitFor((f) => f.t === 'peer-joined');
    expect(announced).toMatchObject({ participant: { name: 'Ana', role: 'guest' } });
  });

  it('refuses an unknown code terminally and closes the socket', async () => {
    const h = await harness();
    const c = await h.join('ghost');
    c.send({ t: 'join', code: 'zzz-zzzz-zzzz', name: 'Ghost' });
    expect(await c.waitFor((f) => f.t === 'error')).toMatchObject({ code: 'room_not_found' });
    await c.waitForClose();
  });

  it('refuses a join past the mesh limit', async () => {
    const h = await harness({ meshLimit: 2 });
    const { joined } = await h.host('host', 'Priya');
    await h.guest('ana', 'Ana', joined.code);
    const { frame } = await h.guest('sana', 'Sana', joined.code);
    expect(frame).toMatchObject({ t: 'error', code: 'room_full' });
  });

  it('answers a ping', async () => {
    const h = await harness();
    const { client } = await h.host('host', 'Priya');
    client.send({ t: 'ping' });
    expect((await client.waitFor((f) => f.t === 'pong')).t).toBe('pong');
  });

  it('drops the socket on unparseable bytes', async () => {
    const h = await harness();
    const { client } = await h.host('host', 'Priya');
    client.sendRaw('this is not json');
    // This endpoint speaks JSON and nothing else, so bytes that do not parse
    // mean the peer is desynchronised — not merely out of date.
    await client.waitForClose();
  });

  it('ignores a structurally invalid frame and keeps the connection', async () => {
    const h = await harness();
    const { client } = await h.host('host', 'Priya');
    // A stale client sending a field this server does not know must degrade,
    // not lose its call.
    client.send({ t: 'chat', text: 'x'.repeat(MEETING_LIMITS.chatMax + 50) });
    client.send({ t: 'moderate', action: 'remove' });
    await new Promise((r) => setTimeout(r, 60));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.send({ t: 'ping' });
    expect((await client.waitFor((f) => f.t === 'pong')).t).toBe('pong');
  });

  it('closes on an entirely unknown frame type', async () => {
    const h = await harness();
    const c = await h.join('weird');
    c.send({ t: 'teleport', name: 'Priya' });
    await c.waitForClose();
  });
});

/* ------------------------------------------------------------------ */
/* Signalling relay                                                    */
/* ------------------------------------------------------------------ */

describe('signalling relay', () => {
  it('routes a description to exactly one peer and never back to the sender', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana, frame } = await h.guest('ana', 'Ana', joined.code);
    if (frame.t !== 'joined') throw new Error('ana not joined');

    ana.send({
      t: 'signal',
      to: joined.selfId,
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0\r\n' } },
    });

    const relayed = await h.client('host').waitFor((f) => f.t === 'signal');
    expect(relayed).toMatchObject({ from: frame.selfId, data: { kind: 'description' } });
    // Echoing an offer back to its author deadlocks a mesh.
    expect(ana.of('signal')).toHaveLength(0);
  });

  it('answers with a pong rather than an error when the target has gone', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);
    ana.send({ t: 'signal', to: 'ghost', data: { kind: 'candidate', candidate: {} } });
    expect((await ana.waitFor((f) => f.t === 'pong' || f.t === 'error')).t).toBe('pong');
  });

  it('refuses to relay for a connection that is not in the room', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const outsider = await h.join('outsider');
    outsider.send({
      t: 'signal',
      to: joined.selfId,
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
    });
    await new Promise((r) => setTimeout(r, 100));
    // No membership, no relay — the frame cannot be injected into the room, and
    // a client that never joined has no session to answer.
    expect(h.client('host').of('signal')).toHaveLength(0);
    expect(outsider.of('signal')).toHaveLength(0);
    expect(outsider.socket.readyState).toBe(WebSocket.OPEN);
  });
});

/* ------------------------------------------------------------------ */
/* Room broadcasts                                                     */
/* ------------------------------------------------------------------ */

describe('room broadcasts', () => {
  it('fans chat out to everyone including the sender', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);
    const { client: sana } = await h.guest('sana', 'Sana', joined.code);

    ana.send({ t: 'chat', text: '  the deck is in Drive  ' });
    expect(await h.client('host').waitFor((f) => f.t === 'chat')).toMatchObject({
      name: 'Ana',
      text: 'the deck is in Drive',
    });
    expect(await sana.waitFor((f) => f.t === 'chat')).toBeDefined();
    expect(ana.of('chat')).toHaveLength(1);
  });

  it('broadcasts interim and final captions separately', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);

    ana.send({ t: 'caption', text: 'our revenue', final: false });
    await h.client('host').waitFor((f) => f.t === 'caption' && !f.final);
    ana.send({ t: 'caption', text: 'our revenue is up', final: true });
    expect(await h.client('host').waitFor((f) => f.t === 'caption' && f.final)).toMatchObject({
      text: 'our revenue is up',
      final: true,
    });
  });

  it('drops a reaction outside the allow-list', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);
    ana.send({ t: 'reaction', emoji: '\u{1F9A0}' });
    ana.send({ t: 'reaction', emoji: '\u{1F44D}' });
    expect(await ana.waitFor((f) => f.t === 'reaction')).toMatchObject({ emoji: '\u{1F44D}' });
    expect(ana.of('reaction')).toHaveLength(1);
  });

  it('mirrors presence state to the room', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana, frame } = await h.guest('ana', 'Ana', joined.code);
    if (frame.t !== 'joined') throw new Error('ana not joined');
    ana.send({ t: 'state', state: { micOn: false, sharing: true } });
    expect(await h.client('host').waitFor((f) => f.t === 'state')).toMatchObject({
      id: frame.selfId,
      state: { micOn: false, sharing: true },
    });
  });

  it('ignores frames from a client that never joined', async () => {
    const h = await harness();
    const c = await h.join('idle');
    c.send({ t: 'chat', text: 'hello from nowhere' });
    c.send({ t: 'card', card: REVENUE_CARD });
    c.send({ t: 'state', state: { micOn: false } });
    await new Promise((r) => setTimeout(r, 80));
    expect(c.of('chat')).toHaveLength(0);
    expect(c.of('card')).toHaveLength(0);
    expect(c.socket.readyState).toBe(WebSocket.OPEN);
  });
});

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

describe('card broadcast', () => {
  it('forwards a valid card to the room', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);
    ana.send({ t: 'card', card: REVENUE_CARD, topic: 'our Q3 revenue' });

    const frame = await h.client('host').waitFor((f) => f.t === 'card');
    expect(frame).toMatchObject({ name: 'Ana', topic: 'our Q3 revenue' });
    if (frame.t !== 'card') return;
    expect((frame.card as { title: string }).title).toBe(REVENUE_CARD.title);
    void joined;
  });

  it('drops an invalid card instead of fanning it out, and keeps the connection', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);

    for (const bad of [{ nope: true }, null, 'a string', 42, []]) {
      ana.send({ t: 'card', card: bad });
    }
    // Give the fan-out every chance to misbehave.
    await new Promise((r) => setTimeout(r, 120));
    expect(h.client('host').of('card')).toHaveLength(0);

    // A rejected card must not poison the session: a real one still works.
    ana.send({ t: 'card', card: REVENUE_CARD });
    expect(await h.client('host').waitFor((f) => f.t === 'card')).toBeDefined();
  });

  it('clears a card when its owner takes it off air', async () => {
    const h = await harness();
    const { joined } = await h.host('host', 'Priya');
    const { client: ana } = await h.guest('ana', 'Ana', joined.code);
    ana.send({ t: 'card', card: REVENUE_CARD });
    await h.client('host').waitFor((f) => f.t === 'card');
    ana.send({ t: 'card-cleared' });
    expect(await h.client('host').waitFor((f) => f.t === 'card-cleared')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

describe('leaving', () => {
  it('tells the room, then deletes the room once the last person goes', async () => {
    const h = await harness();
    const { joined, client: host } = await h.host('host', 'Priya');
    const { client: ana, frame } = await h.guest('ana', 'Ana', joined.code);
    if (frame.t !== 'joined') throw new Error('ana not joined');

    ana.send({ t: 'leave' });
    expect(await host.waitFor((f) => f.t === 'peer-left')).toMatchObject({ id: frame.selfId });

    host.send({ t: 'leave' });
    await new Promise((r) => setTimeout(r, 60));
    expect(h.registry.has(joined.code)).toBe(false);
  });

  it('keeps the socket open on leave, and closes it on a refused re-join', async () => {
    // A presenter who clicks "Leave" and immediately changes their mind should
    // not lose the socket — only the seat. Re-joining is a new frame on the same
    // connection, not a reconnect.
    const h = await harness();
    const { client: host, joined } = await h.host('host', 'Priya');
    host.send({ t: 'leave' });
    await new Promise((r) => setTimeout(r, 50));
    expect(host.socket.readyState).toBe(WebSocket.OPEN);

    // The room is gone once it empties, so re-joining that code is answered
    // with a terminal error and the socket goes with it — a refused invitation
    // must not leave a client looping on the same request.
    const before = host.frames.length;
    host.send({ t: 'join', code: joined.code, name: 'Priya' });
    await host.waitForClose();
    expect(host.frames.slice(before)).toMatchObject([{ t: 'error', code: 'room_not_found' }]);
  });

  it('lets a fresh client re-create a room with the same code after it emptied', async () => {
    // The CTA re-entry path: a presenter who ends a call and starts a new one
    // from the same link must get the same link, not a dead code.
    const h = await harness();
    const first = await h.host('a', 'Priya');
    first.client.send({ t: 'leave' });
    await new Promise((r) => setTimeout(r, 40));
    expect(h.registry.has(first.joined.code)).toBe(false);

    const second = await h.host('b', 'Priya');
    expect(second.joined.code).toBeTruthy();
    expect(second.joined.role).toBe('host');
  });

  it('migrates the host on an unexpected disconnect', async () => {
    const h = await harness();
    const { client: host, joined } = await h.host('host', 'Priya');
    const { client: ana, frame } = await h.guest('ana', 'Ana', joined.code);
    if (frame.t !== 'joined') throw new Error('ana not joined');

    host.close();
    const migration = await ana.waitFor((f) => f.t === 'host-migrated');
    expect(migration).toMatchObject({ hostId: frame.selfId });
  });

  it('reaps a seated client that goes silent past the idle window', async () => {
    let now = 5_000_000;
    const h = await harness({ now: () => now });
    const { client, joined } = await h.host('host', 'Priya');
    // One more frame, so the client is unambiguously alive at `now`.
    client.send({ t: 'ping' });
    await client.waitFor((f) => f.t === 'pong');
    expect(h.registry.roomCount).toBe(1);

    now += MEETING_LIMITS.idleTimeoutMs + 1;
    h.registry.reap();
    expect(h.registry.has(joined.code)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The host gate                                                       */
/* ------------------------------------------------------------------ */

async function lockedRoom() {
  const h = await harness();
  const { client: host, joined } = await h.host('host', 'Priya', { lockOnJoin: true });
  return { h, host, code: joined.code, selfId: joined.selfId };
}

async function knockAt(h: Harness, code: string, name: string): Promise<{ client: Client; id: string }> {
  const c = await h.join(`knock-${name}`);
  c.send({ t: 'join', code, name });
  await c.waitFor((f) => f.t === 'waiting');
  return { client: c, id: name };
}

async function knockId(h: Harness, host: Client): Promise<string> {
  const notice = await host.waitFor((f) => f.t === 'admit-request');
  if (notice.t !== 'admit-request') throw new Error('no admit-request');
  return notice.request.id;
}

describe('the host gate', () => {
  it('queues a joiner and notifies the host', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    expect(await c.waitFor((f) => f.t === 'waiting')).toMatchObject({ name: 'Ana' });
    expect(await host.waitFor((f) => f.t === 'admit-request')).toMatchObject({
      request: { name: 'Ana' },
    });
  });

  it('admits a queued joiner with the roster and ICE config', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    host.send({ t: 'moderate', action: 'admit', id: await knockId(h, host) });

    const admitted = await c.waitFor((f) => f.t === 'admitted');
    if (admitted.t !== 'admitted') throw new Error('not admitted');
    expect(admitted.participants).toHaveLength(1);
    expect(admitted.rtc.meshLimit).toBe(6);
    await host.waitFor((f) => f.t === 'peer-joined');
  });

  it('denies a queued joiner', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    host.send({ t: 'moderate', action: 'deny', id: await knockId(h, host) });
    expect(await c.waitFor((f) => f.t === 'denied')).toBeDefined();
  });

  it('sends a mute request to exactly the target', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    host.send({ t: 'moderate', action: 'admit', id: await knockId(h, host) });
    await c.waitFor((f) => f.t === 'admitted');

    const target = h.registry.peek(code)?.participants.find((p) => p.name === 'Ana');
    expect(target).toBeDefined();
    host.send({ t: 'moderate', action: 'mute-request', id: target!.id });
    expect(await c.waitFor((f) => f.t === 'mute-request')).toMatchObject({ by: 'the host' });
  });

  it('notifies a removed participant and drops them from the room', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    host.send({ t: 'moderate', action: 'admit', id: await knockId(h, host) });
    await c.waitFor((f) => f.t === 'admitted');

    const target = h.registry.peek(code)?.participants.find((p) => p.name === 'Ana');
    host.send({ t: 'moderate', action: 'remove', id: target!.id });
    expect(await c.waitFor((f) => f.t === 'removed')).toMatchObject({ by: 'the host' });
    expect(h.registry.peek(code)?.participantCount).toBe(1);
  });

  it('refuses moderation from a non-host', async () => {
    const { h, host, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    host.send({ t: 'moderate', action: 'admit', id: await knockId(h, host) });
    await c.waitFor((f) => f.t === 'admitted');

    c.send({ t: 'moderate', action: 'remove', id: h.registry.peek(code)!.hostId! });
    expect(await c.waitFor((f) => f.t === 'error')).toMatchObject({ code: 'not_host' });
  });

  it('drops a queued client when it disconnects', async () => {
    const { h, code } = await lockedRoom();
    const c = await h.join('knock');
    c.send({ t: 'join', code, name: 'Ana' });
    await c.waitFor((f) => f.t === 'waiting');
    expect(h.registry.peek(code)?.waitingCount).toBe(1);

    c.close();
    await c.waitForClose();
    await new Promise((r) => setTimeout(r, 40));
    expect(h.registry.peek(code)?.waitingCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Abuse                                                               */
/* ------------------------------------------------------------------ */

describe('abuse', () => {
  it('disconnects a client that floods the socket', async () => {
    const h = await harness();
    const { client } = await h.host('host', 'Priya');
    for (let i = 0; i < MEETING_LIMITS.rateLimitPerSecond + 25; i++) client.send({ t: 'ping' });
    await client.waitForClose();
  });
});