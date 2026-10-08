/**
 * The peer mesh.
 *
 * Every participant holds one `RTCPeerConnection` per other participant, so
 * the room is a full mesh: n participants means n(n-1)/2 connections and every
 * participant uploads their own media n-1 times. That is the right shape for
 * small rooms and the wrong shape for large ones, which is exactly why the
 * engine caps the mesh (`STASH_MEETING_MESH_LIMIT`) instead of letting a call
 * quietly collapse into dropped frames.
 *
 * ## Glare avoidance
 *
 * When two peers join at the same moment, both would try to offer. The rule is
 * deterministic and needs no extra round trip: **the lexicographically smaller
 * peer id sends the offer**. Both sides know both ids, so both agree without
 * negotiating, and exactly one offer is created.
 *
 * ## Track replacement
 *
 * The outbound video track changes constantly â€” the presenter's camera, a
 * Stash Live card composited over it, screen share, camera off. Rather than
 * renegotiating for each change, the mesh adds the track once and then calls
 * `RTCRtpSender.replaceTrack`. Replacing a track keeps the transceiver and the
 * connection intact, so a card appearing costs nothing on the wire.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RtcConfig, SignalPayload } from '@stash/meeting-spec';
import type { MeetingParticipant } from '@stash/meeting-spec';

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface PeerMedia {
  /** Audio + camera. Present once the connection carries media. */
  stream: MediaStream | null;
  /** Screen share, when the peer is sharing. */
  screen: MediaStream | null;
  state: PeerConnectionState;
  /** Round-trip time in ms, or null before the first measurement. */
  rttMs: number | null;
}

export type PeerMap = Record<string, PeerMedia>;

export interface UseWebRtcMeshOptions {
  /** Null until the signalling socket reports the room. */
  rtc: RtcConfig | null;
  selfId: string | null;
  /** Everyone else in the room. */
  participants: MeetingParticipant[];
  /** The composited camera+mic stream to send, or null to send nothing. */
  outbound: MediaStream | null;
  /** The screen-share track to send, or null. */
  screenTrack: MediaStreamTrack | null;
  /** Relay function supplied by the signalling socket. */
  sendSignal: (to: string, data: SignalPayload) => boolean;
  onEvent?: (event: MeshEvent) => void;
}

export interface UseWebRtcMeshResult {
  peers: PeerMap;
  /** Feed a relayed signalling frame to the right peer connection. */
  handleSignal: (from: string, data: SignalPayload) => void;
  /** Tear one peer down early, e.g. when its tile is pinned or hidden. */
  dropPeer: (id: string) => void;
}

export type MeshEvent =
  | { type: 'peer-connected'; id: string }
  | { type: 'peer-failed'; id: string; reason: string }
  | { type: 'media-error'; id: string; message: string };

const ICE_SERVER_POLICY: RTCConfiguration = {
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export function useWebRtcMesh(opts: UseWebRtcMeshOptions): UseWebRtcMeshResult {
  const [peers, setPeers] = useState<PeerMap>({});

  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const streamsRef = useRef(new Map<string, { stream: MediaStream | null; screen: MediaStream | null }>());
  const outboundRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const sendSignalRef = useRef(opts.sendSignal);
  const onEventRef = useRef(opts.onEvent);
  const selfIdRef = useRef(opts.selfId);
  const rtcRef = useRef<RtcConfig | null>(null);

  sendSignalRef.current = opts.sendSignal;
  onEventRef.current = opts.onEvent;
  selfIdRef.current = opts.selfId;
  rtcRef.current = opts.rtc;

  outboundRef.current = opts.outbound;
  screenRef.current = opts.screenTrack;

  /* ------------------------------------------------------------------ */
  /* Track plumbing                                                     */
  /* ------------------------------------------------------------------ */

  const applyOutbound = useCallback((pc: RTCPeerConnection, stream: MediaStream | null) => {
    const senders = pc.getSenders();
    if (senders.length === 0) return;
    // Sender order is stable once transceivers are added: audio first, then
    // video, then screen. Every add happens through `ensureTransceivers`.
    const audioSender = senders[0];
    const videoSender = senders[1];
    if (audioSender) {
      const track = stream?.getAudioTracks()[0] ?? null;
      if (audioSender.track !== track) void audioSender.replaceTrack(track).catch(() => {});
    }
    if (videoSender) {
      const track = stream?.getVideoTracks()[0] ?? null;
      if (videoSender.track !== track) void videoSender.replaceTrack(track).catch(() => {});
    }
  }, []);

  const applyScreen = useCallback((pc: RTCPeerConnection, track: MediaStreamTrack | null) => {
    const senders = pc.getSenders();
    const screenSender = senders[2];
    if (!screenSender) return;
    if (screenSender.track !== track) void screenSender.replaceTrack(track).catch(() => {});
  }, []);

  /* ------------------------------------------------------------------ */
  /* Connection lifecycle                                               */
  /* ------------------------------------------------------------------ */

  const setPeer = useCallback((id: string, patch: Partial<PeerMedia>) => {
    setPeers((prev) => {
      const current: PeerMedia = prev[id] ?? { stream: null, screen: null, state: 'new', rttMs: null };
      const next = { ...current, ...patch };
      if (
        current.stream === next.stream &&
        current.screen === next.screen &&
        current.state === next.state &&
        current.rttMs === next.rttMs
      ) {
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const buildConnection = useCallback(
    (peerId: string): RTCPeerConnection | null => {
      if (typeof RTCPeerConnection === 'undefined') return null;
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const config = rtcRef.current;
      if (!config) return null;

      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({ ...ICE_SERVER_POLICY, iceServers: config.iceServers as RTCIceServer[] });
      } catch (err) {
        onEventRef.current?.({ type: 'peer-failed', id: peerId, reason: err instanceof Error ? err.message : 'PC construction failed' });
        return null;
      }
      pcsRef.current.set(peerId, pc);
      streamsRef.current.set(peerId, { stream: null, screen: null });
      setPeer(peerId, { state: 'new' });

      // Add all three transceivers up front, in a fixed order, so
      // `applyOutbound` / `applyScreen` can address them by index and never
      // have to renegotiate mid-call.
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
      } catch {
        // Very old browsers. Fall back to sender-order-by-addTrack below.
      }

      applyOutbound(pc, outboundRef.current);
      applyScreen(pc, screenRef.current);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignalRef.current(peerId, {
          kind: 'candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        const target = stream ?? new MediaStream([event.track]);
        const bag = streamsRef.current.get(peerId) ?? { stream: null, screen: null };
        // Mid 0 and 1 are the mic and camera transceivers we added; mid 2 is
        // the dedicated screen transceiver. Keyed off the transceiver rather
        // than the track kind, because both are `video`.
        if (event.transceiver.mid === '2') bag.screen = target;
        else if (!bag.stream) bag.stream = target;
        else if (!bag.stream.getTracks().includes(event.track)) bag.stream.addTrack(event.track);
        streamsRef.current.set(peerId, bag);
        setPeer(peerId, { stream: bag.stream, screen: bag.screen });
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setPeer(peerId, { state: state as PeerConnectionState });
        if (state === 'connected') {
          onEventRef.current?.({ type: 'peer-connected', id: peerId });
          void measureRtt(pc, peerId, setPeer);
        }
        if (state === 'failed') {
          onEventRef.current?.({ type: 'peer-failed', id: peerId, reason: 'ICE failed' });
          // A failed connection will not recover on its own. One restart is
          // the standard remedy; beyond that the peer is genuinely unreachable.
          try {
            pc.restartIce();
          } catch {
            /* older browsers */
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          void measureRtt(pc, peerId, setPeer);
        }
      };

      return pc;
    },
    [applyOutbound, applyScreen, setPeer],
  );

  /* ------------------------------------------------------------------ */
  /* Negotiation                                                        */
  /* ------------------------------------------------------------------ */

  const negotiate = useCallback(
    async (peerId: string) => {
      const pc = buildConnection(peerId);
      if (!pc) return;
      if (pc.signalingState !== 'stable') return;
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        sendSignalRef.current(peerId, {
          kind: 'description',
          description: { type: offer.type, sdp: offer.sdp },
        });
      } catch (err) {
        onEventRef.current?.({
          type: 'media-error',
          id: peerId,
          message: err instanceof Error ? err.message : 'Could not create an offer',
        });
      }
    },
    [buildConnection],
  );

  const handleSignal = useCallback(
    async (from: string, data: SignalPayload) => {
      const pc = buildConnection(from);
      if (!pc) return;

      try {
        if (data.kind === 'description') {
          const desc: RTCSessionDescriptionInit = {
            type: data.description.type,
            sdp: data.description.sdp,
          };
          // An offer arriving while we are mid-offer means both sides decided
          // to lead. The deterministic rule should prevent it; if it happens
          // anyway, the polite peer (larger id) rolls back rather than
          // deadlocking.
          const collision =
            desc.type === 'offer' &&
            (pc.signalingState !== 'stable' || pc.remoteDescription?.type === 'offer');
          if (collision) {
            const self = selfIdRef.current ?? '';
            const polite = self > from;
            if (!polite) return;
            await Promise.allSettled([pc.setLocalDescription({ type: 'rollback' }), pc.setRemoteDescription(desc)]);
          } else {
            await pc.setRemoteDescription(desc);
          }

          if (desc.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignalRef.current(from, { kind: 'description', description: { type: answer.type, sdp: answer.sdp } });
          }
          return;
        }

        const candidate: RTCIceCandidateInit = {
          candidate: data.candidate.candidate,
          sdpMid: data.candidate.sdpMid ?? undefined,
          sdpMLineIndex: data.candidate.sdpMLineIndex ?? undefined,
          usernameFragment: data.candidate.usernameFragment ?? undefined,
        };
        await pc.addIceCandidate(candidate);
      } catch (err) {
        onEventRef.current?.({
          type: 'media-error',
          id: from,
          message: err instanceof Error ? err.message : 'Signalling failed',
        });
      }
    },
    [buildConnection],
  );

  const closePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* already closed */
      }
    }
    pcsRef.current.delete(peerId);
    streamsRef.current.delete(peerId);
    setPeers((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const teardown = useCallback(() => {
    for (const id of [...pcsRef.current.keys()]) {
      const pc = pcsRef.current.get(id);
      try {
        pc?.close();
      } catch {
        /* already closed */
      }
    }
    pcsRef.current.clear();
    streamsRef.current.clear();
  }, []);

  /* ------------------------------------------------------------------ */
  /* Effects                                                            */
  /* ------------------------------------------------------------------ */

  const selfId = opts.selfId;
  const rtc = opts.rtc;
  const participantIds = useMemo(() => opts.participants.map((p) => p.id).join(','), [opts.participants]);
  const closePeerRef = useRef(closePeer);
  closePeerRef.current = closePeer;

  // Create/destroy connections to match the roster exactly. This is the only
  // place connections are created, so the mesh can never hold a connection to
  // somebody who left.
  useEffect(() => {
    if (!selfId || !rtc) return;
    const ids = participantIds ? participantIds.split(',') : [];
    const wanted = new Set(ids);

    for (const id of [...pcsRef.current.keys()]) {
      if (!wanted.has(id)) closePeerRef.current(id);
    }

    for (const id of ids) {
      if (!wanted.has(id) || id === selfId) continue;
      const pc = buildConnection(id);
      if (!pc) continue;
      // Deterministic offer leadership: smaller id offers.
      if (selfId < id && pc.signalingState === 'stable' && !pc.remoteDescription) {
        void negotiate(id);
      }
    }
  }, [selfId, rtc, participantIds, buildConnection, negotiate]);

  // Outbound media changes are track replacements, never renegotiations.
  useEffect(() => {
    for (const pc of pcsRef.current.values()) applyOutbound(pc, opts.outbound);
  }, [opts.outbound, applyOutbound]);

  useEffect(() => {
    for (const pc of pcsRef.current.values()) applyScreen(pc, opts.screenTrack);
  }, [opts.screenTrack, applyScreen]);

  // Full teardown when the client leaves the room or the component unmounts.
  useEffect(() => teardown, [teardown]);

  const dropPeer = useCallback((id: string) => closePeer(id), [closePeer]);

  return { peers, dropPeer, handleSignal };
}

/**
 * One-shot round-trip probe from the selected candidate pair.
 *
 * Reported per peer so the UI can show a connection-quality warning instead of
 * silently delivering frozen video. Failure is ignored â€” RTT is a nicety, and a
 * browser that refuses `getStats` must not break the call.
 */
async function measureRtt(
  pc: RTCPeerConnection,
  peerId: string,
  setPeer: (id: string, patch: Partial<PeerMedia>) => void,
): Promise<void> {
  try {
    const stats = await pc.getStats();
    let rtt: number | null = null;
    stats.forEach((report) => {
      if (report.type !== 'candidate-pair' || report.state !== 'succeeded') return;
      if (typeof report.currentRoundTripTime !== 'number') return;
      // Prefer the pair the transport is actually nominated on.
      if (report.nominated === false && rtt !== null) return;
      rtt = Math.round(report.currentRoundTripTime * 1000);
    });
    if (rtt !== null) setPeer(peerId, { rttMs: rtt });
  } catch {
    /* stats are optional */
  }
}
