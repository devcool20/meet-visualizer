/**
 * Two peers, one room: does the mesh actually negotiate?
 *
 * The reported symptom was that a guest saw the roster (`2` in the badge, both
 * tiles present) but every tile was black, and no "Connection failed" banner
 * appeared. A banner only renders for `failed`/`disconnected`, so a black tile
 * with no banner means the connections were still sitting at `new` -- i.e.
 * negotiation never produced media, rather than ICE having failed.
 *
 * Static reading could not separate "the offer was never sent" from "the offer
 * arrived but the answer never came back", so this drives the real hook through
 * a fake `RTCPeerConnection` and a fake signalling bus. The fakes model only
 * what the hook touches: transceivers, senders, the offer/answer exchange, and
 * `ontrack`. Everything else is jsdom's.
 *
 * The scenario mirrors the real join order: `a` is seated first and alone, `b`
 * joins second, and only then does `a` learn about `b` and offer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import { DEFAULT_PARTICIPANT_STATE, type MeetingParticipant, type RtcConfig, type SignalPayload } from '@stash/meeting-spec';
import { useWebRtcMesh, type MeshEvent, type PeerMap } from './useWebRtcMesh';

const RTC: RtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  meshLimit: 8,
};

interface FakeTrack {
  kind: string;
  id: string;
  readyState: string;
}

class FakeSender {
  track: FakeTrack | null = null;
  constructor(readonly transceiver: FakeTransceiver) {}
  replaceTrack(track: FakeTrack | null): Promise<void> {
    this.track = track;
    return Promise.resolve();
  }
}

class FakeTransceiver {
  mid: string | null = null;
  currentDirection: string | null = null;
  sender: FakeSender;
  receiver: { track: FakeTrack | null } = { track: null };
  constructor(readonly kind: string) {
    this.sender = new FakeSender(this);
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  /** Set immediately before a peer renders, so new connections can be attributed. */
  static currentOwner = '';

  owner: string;
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;

  transceivers: FakeTransceiver[] = [];
  pair: FakePeerConnection | null = null;

  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  offersCreated = 0;
  answersCreated = 0;

  constructor(readonly config: RTCConfiguration) {
    this.owner = FakePeerConnection.currentOwner;
    FakePeerConnection.instances.push(this);
    // Auto-pair with the other peer's connection as soon as it exists. The
    // offer/answer exchange finishes inside the same tick the second connection
    // is built, so pairing cannot be deferred to the test body.
    const counterpart = FakePeerConnection.instances.find((c) => c !== this && c.owner !== this.owner);
    if (counterpart) {
      this.pair = counterpart;
      counterpart.pair = this;
    }
  }

  addTransceiver(kind: string, _init?: RTCRtpTransceiverInit): FakeTransceiver {
    const t = new FakeTransceiver(kind);
    this.transceivers.push(t);
    return t;
  }

  getSenders(): FakeSender[] {
    return this.transceivers.map((t) => t.sender);
  }

  async createOffer(_opts?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.offersCreated++;
    this.transceivers.forEach((t, i) => {
      if (t.mid === null) t.mid = String(i);
      t.currentDirection = 'sendrecv';
    });
    return { type: 'offer', sdp: `offer:${this.transceivers.length}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.answersCreated++;
    return { type: 'answer', sdp: 'answer' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
    this.transceivers.forEach((t, i) => {
      if (t.mid === null) t.mid = String(i);
    });
    if (desc.type === 'answer' && this.pair) {
      // The exchange completed: each side now delivers the other's tracks.
      this.pair.deliverTracksTo(this);
      this.deliverTracksTo(this.pair);
      this.markConnected();
      this.pair.markConnected();
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (desc.type === 'offer' && this.pair) {
      // Mirror the offered m-line shape, as a browser does when answering.
      this.transceivers = this.pair.transceivers.map((ot) => {
        const t = this.addTransceiver(ot.kind);
        t.mid = ot.mid;
        return t;
      });
    }
  }

  async addIceCandidate(_c: RTCIceCandidateInit): Promise<void> {}

  restartIce(): void {}

    close(): void {
    this.connectionState = 'closed';
  }

  markConnected(): void {
    if (this.connectionState === 'connected') return;
    this.connectionState = 'connected';
    this.iceConnectionState = 'completed';
    this.onconnectionstatechange?.();
  }

  /** Fire `ontrack` on this connection for every track the peer is sending. */
  deliverTracksTo(peer: FakePeerConnection): void {
    for (const sent of peer.transceivers) {
      const track = sent.sender.track;
      if (!track) continue;
      for (const recv of this.transceivers.filter((t) => t.mid === sent.mid)) {
        recv.receiver.track = track;
        this.ontrack?.({ track, transceiver: recv, streams: [] });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

/**
 * jsdom implements neither `MediaStream` nor `MediaStreamTrack`, but `ontrack`
 * constructs a `MediaStream` when the SDP carries no msid -- which it never
 * does here, because the mesh sends via `addTransceiver` + `replaceTrack`. Only
 * the surface the hook touches is modelled.
 */
class FakeMediaStreamTrack {
  readonly kind: string;
  readonly id: string;
  readyState: string = 'live';
  constructor(kind: string, id: string) {
    this.kind = kind;
    this.id = id;
  }
}

class FakeMediaStream {
  private tracks: FakeMediaStreamTrack[];
  constructor(tracks: FakeMediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks(): FakeMediaStreamTrack[] {
    return [...this.tracks];
  }
  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  addTrack(track: FakeMediaStreamTrack): void {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
}

/** A camera + mic, as `MeetingProvider` would hand the mesh. */
const outboundWithCamera = (): MediaStream =>
  new FakeMediaStream([new FakeMediaStreamTrack('audio', 'mic'), new FakeMediaStreamTrack('video', 'cam')]) as unknown as MediaStream;

interface Mounted {
  peers: () => PeerMap;
  /** Frames this peer sent, for assertions. */
  sent: Array<{ to: string; data: SignalPayload }>;
  /** Mesh events this peer raised. */
  events: MeshEvent[];
  /** Replace the roster this peer believes in, as a `joined`/`peer-joined` frame would. */
  setOthers: (ids: string[]) => Promise<void>;
  /** Deliver a relayed signalling frame, as the engine's relay would. */
  deliver: (from: string, data: SignalPayload) => Promise<void>;
}

const participant = (id: string): MeetingParticipant => ({
  id,
  name: id,
  role: 'guest',
  joinedAt: 0,
  state: { ...DEFAULT_PARTICIPANT_STATE },
});

async function mountPeer(
  selfId: string,
  bus: Map<string, (d: SignalPayload) => Promise<void>>,
  outbound: MediaStream | null = null,
): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  let others: string[] = [];
  let latest: PeerMap = {};
  let handle: (from: string, data: SignalPayload) => void = () => {};
  const sent: Array<{ to: string; data: SignalPayload }> = [];
  const events: MeshEvent[] = [];

  const Harness = () => {
    const mesh = useWebRtcMesh({
      rtc: RTC,
      selfId,
participants: others.map(participant),
      outbound,
      screenTrack: null,
      sendSignal: (to, data) => {
        sent.push({ to, data });
        void bus.get(to)?.(data);
        return true;
      },
onEvent: (e) => events.push(e),
    });
    latest = mesh.peers;
    handle = mesh.handleSignal;
    return null;
  };

  const render = async (): Promise<void> => {
    // Attribute any connection created by this render to this peer.
    FakePeerConnection.currentOwner = selfId;
    await act(async () => {
      root.render(createElement(Harness));
      await Promise.resolve();
    });
  };

  await render();

  return {
    peers: () => latest,
    sent,
    events,
    setOthers: async (ids: string[]) => {
      others = ids;
      await render();
    },
    deliver: async (from: string, data: SignalPayload) => {
    await act(async () => {
    handle(from, data);
        await Promise.resolve();
      });
    },
  };
}

beforeEach(() => {
  FakePeerConnection.instances = [];
  FakePeerConnection.currentOwner = '';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeerConnection;
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = FakeMediaStream;
  (globalThis as unknown as { MediaStreamTrack: unknown }).MediaStreamTrack = FakeMediaStreamTrack;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mesh negotiation between two peers', () => {
  it('creates exactly one offer and attaches the remote camera', async () => {
    const bus = new Map<string, (d: SignalPayload) => Promise<void>>();
    const a = await mountPeer('a', bus);
    const b = await mountPeer('b', bus);
    bus.set('a', (d) => a.deliver('b', d));
    bus.set('b', (d) => b.deliver('a', d));

    // b joins; a then learns about b, which is what makes a offer.
    await b.setOthers(['a']);
    await a.setOthers(['b']);

    const offerers = FakePeerConnection.instances.filter((c) => c.offersCreated > 0);
    // Exactly one offer across the pair: the lexicographically smaller id leads,
    // so the two sides never glare and deadlock.
    expect(offerers).toHaveLength(1);
    expect(offerers[0].owner).toBe('a');

    // Both sides reached `connected`, which is what clears the warning banner.
    for (const c of FakePeerConnection.instances) {
      expect(c.connectionState).toBe('connected');
    }

    // Each side holds a peer entry keyed by the other id -- what a tile renders.
    expect(Object.keys(a.peers())).toEqual(['b']);
    expect(Object.keys(b.peers())).toEqual(['a']);
  });

it('exposes the remote camera on the peer stream', async () => {
    // This is the production symptom: the roster showed both participants, the
    // connection reached `connected`, but the tile stayed black because
    // `peer.stream` never picked up the remote camera. `ontrack` builds its
    // stream itself when the SDP carries no msid -- which is exactly the case
    // here, since the mesh uses `addTransceiver` + `replaceTrack` rather than
    // `addTrack`. So this asserts the fallback path end to end.
    const bus = new Map<string, (d: SignalPayload) => Promise<void>>();
    const a = await mountPeer('a', bus, outboundWithCamera());
    const b = await mountPeer('b', bus, outboundWithCamera());
    bus.set('a', (d) => a.deliver('b', d));
    bus.set('b', (d) => b.deliver('a', d));

    await b.setOthers(['a']);
    await a.setOthers(['b']);

    const peerAonB = b.peers()['a'];
    expect(peerAonB).toBeDefined();
    expect(peerAonB.state).toBe('connected');

    // The camera arrived: a real stream carrying a video track, which is what a
    // tile needs before it will show anything at all.
    expect(peerAonB.stream).not.toBeNull();
    const videoTracks = peerAonB.stream!.getVideoTracks();
    expect(videoTracks).toHaveLength(1);
    expect(videoTracks[0].kind).toBe('video');
  });
});