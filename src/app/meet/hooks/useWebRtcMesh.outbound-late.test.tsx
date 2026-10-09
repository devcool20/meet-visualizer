/**
 * The mesh must attach the sender's camera even when the camera arrives late.
 *
 * The reported symptom, from the `?debug=1` overlay on the receiving client:
 *
 *     conn=connected  rawTracks=2  vReady=live  camOn=(empty)
 *
 * The connection was up and a *video* track had arrived and was live -- but the
 * tile was still black, and `camOn` was never set, meaning the sender had never
 * broadcast a state frame.
 *
 * The cause is an ordering race in `useWebRtcMesh`. There are two separate
 * effects:
 *
 *   - the roster effect, whose deps are `[selfId, rtc, participantIds, ...]`,
 *     creates the peer connection;
 *   - the outbound effect, whose deps are `[opts.outbound, applyOutbound]`,
 *     pushes the camera into existing connections.
 *
 * `MeetingProvider` only produces `outbound` once `joined` is true *and* the
 * camera track exists, and the track only exists once `getUserMedia` has
 * resolved. A connection created before that reads `outboundRef.current` and
 * gets `null`. If `outbound` never changes identity again, the outbound effect
 * never re-runs for that connection and the camera is never sent -- while the
 * presenter sees themselves perfectly, because self-view bypasses the mesh.
 *
 * The invariant: whenever a connection exists, the current outbound media is
 * applied to it. The mesh must not depend on the two effects happening to
 * interleave in a lucky order.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import { DEFAULT_PARTICIPANT_STATE, type MeetingParticipant, type RtcConfig, type SignalPayload } from '@stash/meeting-spec';
import { useWebRtcMesh } from './useWebRtcMesh';

const RTC: RtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], meshLimit: 8 };

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

class FakeMediaStreamTrack {
  readonly kind: string;
  readonly id: string;
  readyState = 'live';
  constructor(kind: string, id: string) {
    this.kind = kind;
    this.id = id;
  }
}

class FakeMediaStream {
  constructor(private tracks: FakeMediaStreamTrack[] = []) {}
  getTracks(): FakeMediaStreamTrack[] {
    return [...this.tracks];
  }
  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  owner = '';
  connectionState = 'new';
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

  constructor(readonly config: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }

  addTransceiver(kind: string): FakeTransceiver {
    const t = new FakeTransceiver(kind);
    this.transceivers.push(t);
    return t;
  }

  getSenders(): FakeSender[] {
    return this.transceivers.map((t) => t.sender);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.offersCreated++;
    this.transceivers.forEach((t, i) => {
      if (t.mid === null) t.mid = String(i);
    });
    return { type: 'offer', sdp: 'offer' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'answer' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: desc.type as string, sdp: desc.sdp ?? '' };
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
    this.transceivers.forEach((t, i) => {
      if (t.mid === null) t.mid = String(i);
    });
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = { type: desc.type as string, sdp: desc.sdp ?? '' };
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(): Promise<void> {}
  restartIce(): void {}
  close(): void {
    this.connectionState = 'closed';
  }
}

const participant = (id: string): MeetingParticipant => ({
  id,
  name: id,
  role: 'guest',
  joinedAt: 0,
  state: { ...DEFAULT_PARTICIPANT_STATE },
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  FakePeerConnection.instances = [];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeerConnection;
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = FakeMediaStream;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('outbound media on a late-created connection', () => {
  it('sends the camera when the peer joins after the camera was granted', async () => {
    let others: string[] = [];
    let outbound: MediaStream | null = null;

    const Harness = () => {
      useWebRtcMesh({
        rtc: RTC,
        selfId: 'a',
        participants: others.map(participant),
        outbound,
        screenTrack: null,
        sendSignal: (_to: string, _d: SignalPayload) => true,
        onEvent: () => {},
      });
      return null;
    };

    const render = async () => {
      await act(async () => {
        root.render(createElement(Harness));
        await Promise.resolve();
      });
    };

    // Alone in the room, camera already granted.
    outbound = new FakeMediaStream([new FakeMediaStreamTrack('audio', 'mic'), new FakeMediaStreamTrack('video', 'cam')]) as unknown as MediaStream;
    await render();
    expect(FakePeerConnection.instances).toHaveLength(0);

    // Somebody joins. The connection is created now, with media available.
    others = ['b'];
    await render();

    const pc = FakePeerConnection.instances[0];
    expect(pc).toBeDefined();
    // audio, camera, screen -- in that fixed order.
    expect(pc.getSenders()[1].track?.kind).toBe('video');
  });

  it('sends the camera when the peer is already present but the camera arrives later', async () => {
    // The production ordering: roster arrives, connection is built while
    // `outbound` is still null, and the camera only resolves afterwards.
    let others: string[] = [];
    let outbound: MediaStream | null = null;

    const Harness = () => {
      useWebRtcMesh({
        rtc: RTC,
        selfId: 'a',
        participants: others.map(participant),
        outbound,
        screenTrack: null,
        sendSignal: () => true,
        onEvent: () => {},
      });
      return null;
    };

    const render = async () => {
      await act(async () => {
        root.render(createElement(Harness));
        await Promise.resolve();
      });
    };

    // Connection built before any media exists.
    others = ['b'];
    await render();
    const pc = FakePeerConnection.instances[0];
    expect(pc).toBeDefined();

    // Camera granted afterwards. The mesh must notice and attach it.
    outbound = new FakeMediaStream([new FakeMediaStreamTrack('video', 'cam')]) as unknown as MediaStream;
    await render();

    expect(pc.getSenders()[1].track?.kind).toBe('video');
  });
});