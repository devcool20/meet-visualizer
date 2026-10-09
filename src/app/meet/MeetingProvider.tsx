/**
 * The meeting context — one place where media, signalling, mesh and Stash Live
 * cards are wired together.
 *
 * Composition lives here rather than in the room page so the route, the lobby
 * and the in-call surface share one instance and one lifecycle. The important
 * thing this layer adds over wiring the hooks by hand is **outbound track
 * arbitration**: at any moment exactly one of three things is what other
 * participants see from you, and that choice has to be identical for the mesh,
 * the self-view, and the compositing decision — otherwise the presenter sees
 * something nobody else does.
 *
 * The lobby is a socket gate, not a separate screen: `joined` is false until
 * "Join now", so the socket does not exist and this client is not in the
 * roster while devices are being chosen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_USER_SETTINGS, parseCardSpec, type CardPosition, type CardSpec, type UserSettings } from '@stash/card-spec';
import type { MeetingParticipant, SignalPayload } from '@stash/meeting-spec';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import { useLocalMedia } from './hooks/useLocalMedia';
import { useMeetingSocket, type JoinIntent } from './hooks/useMeetingSocket';
import { useRemoteCompositors } from './hooks/useRemoteCompositors';
import { useWebRtcMesh, type MeshEvent, type PeerMap } from './hooks/useWebRtcMesh';
import { useOutboundCompositor } from './hooks/useOutboundCompositor';
import { useScreenShare } from './hooks/useScreenShare';
import { useAudioLevel, useRemoteLevels } from './hooks/useAudioLevel';
import { useStashLiveCards } from './hooks/useStashLiveCards';
import { useCaptionBroadcast, captionsSupported } from './hooks/useCaptionBroadcast';
import { useMeetingClock } from './hooks/useMeetingClock';

export type Panel = 'none' | 'people' | 'chat' | 'cards';

export interface MeetingContextValue {
  /* ---- identity & lifecycle ---- */
  /** False until "Join now"; the socket does not exist before it. */
  joined: boolean;
  setJoined: (v: boolean) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  code: string | null;
  status: ReturnType<typeof useMeetingSocket>['status'];
  selfId: string | null;
  isHost: boolean;
  hostId: string | null;
  joinedAt: number;
  elapsedMs: number;
  /** Everyone else in the room, in join order. */
  participants: MeetingParticipant[];
  /** Roster including self, with live self state. */
  roster: MeetingParticipant[];
  waitingForHost: boolean;
  pendingJoiners: { id: string; name: string }[];
  failure: { code: string; message: string } | null;
  endedBy: string | null;
  mutedByHost: boolean;
  clearMuteRequest: () => void;

  /* ---- local media ---- */
  media: ReturnType<typeof useLocalMedia>;
  share: ReturnType<typeof useScreenShare>;
  micLevel: { level: number; speaking: boolean };
  remoteLevels: Record<string, { level: number; speaking: boolean }>;
  peerStreams: PeerMap;
  /** Per-peer streams with any card composited over them, for remote tiles. */
  composites: Record<string, { stream: MediaStream | null; card: CardSpec | null }>;
  selfState: MeetingParticipant['state'];
  setMicOn: (on: boolean) => void;
  setCamOn: (on: boolean) => void;
  toggleShare: () => void;

  /* ---- stash live ---- */
  stash: ReturnType<typeof useStashLiveCards>;
  /** The stream other participants receive. */
outbound: MediaStream | null;
  /**
   * What the self tile renders. Deliberately the RAW camera, never the
   * composited stream.
   *
   * These used to be the same object, on the theory that a presenter should see
   * exactly what the room sees. That is right in principle and wrong in
   * practice: it puts the presenter's only view of themselves behind the entire
   * compositing pipeline, so any fault in that pipeline — a card whose raster
   * goes wrong, a tainted canvas, a backdrop that overdraws — takes away the
   * one thing the presenter must never lose. The card is previewed properly in
   * the cards rail, which renders the real `GlassCard` at full size instead of
   * shrinking it into a video frame.
   */
  preview: MediaStream | null;
  compositing: boolean;
  compositorError: string | null;
  /** Non-fatal mesh notice, e.g. a peer that could not be reached. */
  connectionWarning: string | null;
  /** The card's on-air position. Mirrors `UserSettings.position`. */
  cardPosition: CardPosition;
  setCardPosition: (p: CardPosition) => void;
  /** Whether Stash Live generates from everything you say. */
  ambient: boolean;
  setAmbient: (on: boolean) => void;
  /** The card on air, whichever peer owns it. */
  activeCard: { card: CardSpec; ownerId: string; ownerName: string; isSelf: boolean } | null;
  /** Clears the card off air. Only meaningful for the owner's own card. */
  dismissCard: () => void;

  /* ---- room features ---- */
  panel: Panel;
  setPanel: (p: Panel) => void;
  chat: ReturnType<typeof useMeetingSocket>['chat'];
  captions: ReturnType<typeof useMeetingSocket>['captions'];
  captionsOn: boolean;
  setCaptionsOn: (on: boolean) => void;
  /** True when this browser can transcribe locally; captions need it. */
  captionsSupported: boolean;
  /** Set when captions were requested but the recogniser failed. */
  captionError: string | null;
  roomCards: ReturnType<typeof useMeetingSocket>['cards'];
  reactions: ReturnType<typeof useMeetingSocket>['reactions'];
  unread: number;
  clearUnread: () => void;

  /* ---- actions ---- */
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  sendCaption: (text: string, final: boolean) => void;
  admit: (id: string) => void;
  deny: (id: string) => void;
  removeParticipant: (id: string) => void;
  requestMute: (id: string) => void;
  leave: () => void;
}

const MeetingContext = createContext<MeetingContextValue | null>(null);

export function useMeetingContext(): MeetingContextValue {
  const ctx = useContext(MeetingContext);
  if (!ctx) throw new Error('useMeetingContext must be used inside <MeetingProvider>');
  return ctx;
}

const NAME_KEY = 'stash_meeting_name';

function loadName(): string {
  try {
    const stored = localStorage.getItem(NAME_KEY)?.trim();
    if (stored) return stored;
  } catch {
    /* private mode */
  }
  return '';
}

function persistName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* private mode */
  }
}

export interface MeetingProviderProps {
/**
   * How this client claims the room.
   *
   * `enter` is the default and the important one: a link's code may or may not
   * still be live, so join it if it is and start it if it is not. Hardcoding
   * `create` here is what made every shared link silently mint a brand-new
   * meeting under a different code.
   */
  intent: { mode: 'create' | 'enter' | 'join'; code: string; lockOnJoin?: boolean };
  children: ReactNode;
}

export function MeetingProvider({ intent, children }: MeetingProviderProps) {
  const { getAccessToken, session } = useAuth();

  const [displayName, setDisplayNameState] = useState<string>(() => loadName());
  const [joined, setJoined] = useState(false);
  const [joinedAt, setJoinedAt] = useState(0);
  const [panel, setPanel] = useState<Panel>('none');
  const [captionsOn, setCaptionsOnState] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [mutedByHost, setMutedByHost] = useState(false);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);

  const effectiveName = displayName || session?.user.name || session?.user.email?.split('@')[0] || '';

  const setDisplayName = useCallback((v: string) => {
    setDisplayNameState(v);
    persistName(v);
  }, []);

const joinIntent = useMemo<JoinIntent>(() => {
    const name = effectiveName || 'Guest';
    if (intent.mode === 'enter') return { mode: 'enter', name, code: intent.code };
    if (intent.mode === 'join') return { mode: 'join', name, code: intent.code };
    return { mode: 'create', name, code: intent.code, lockOnJoin: intent.lockOnJoin };
  }, [intent, effectiveName]);

  /* ------------------------------------------------------------------ */
  /* Media                                                              */
  /* ------------------------------------------------------------------ */

  // Devices open in the lobby so a presenter can see themselves before
  // committing to the call. Holding a camera open before "Join now" is also
  // what makes the pre-join meter meaningful.
  const media = useLocalMedia();
  const share = useScreenShare();
  const micLevel = useAudioLevel(media.micTrack ? new MediaStream([media.micTrack]) : null, { enabled: joined });

  /* ------------------------------------------------------------------ */
  /* Signalling                                                         */
  /* ------------------------------------------------------------------ */

  const broadcastRef = useRef<(spec: CardSpec, topic?: string) => void>(() => {});
  const clearRef = useRef<() => void>(() => {});
  // The Stash hook is declared above the socket (it needs the socket's `send`),
  // but it receives signalling frames before the mesh exists. This ref is
  // filled as soon as the mesh is built and is the seam between the two.
  const meshSignalRef = useRef<(from: string, data: SignalPayload) => void>(() => {});

  const stash = useStashLiveCards({
    getAccessToken,
    userId: session?.user.id,
    settings,
    onBroadcast: (spec, topic) => broadcastRef.current(spec, topic),
    onCleared: () => clearRef.current(),
  });

  const socket = useMeetingSocket({
    intent: joinIntent,
    enabled: joined,
    onSignal: (from, data) => meshSignalRef.current(from, data),
  });

  useEffect(() => {
    broadcastRef.current = (spec, topic) => {
      socket.send({ t: 'card', card: spec, topic });
    };
    clearRef.current = () => {
      socket.send({ t: 'card-cleared' });
    };
  }, [socket.send]);

  /* ------------------------------------------------------------------ */
  /* Stash Live -> outbound track arbitration                           */
  /* ------------------------------------------------------------------ */

  const cameraTrack = media.camOn ? media.cameraTrack : null;
  const micTrack = media.micTrack;

  const placeholder = useMemo(() => {
    if (stash.phase === 'generating') return { kind: 'generating' as const, title: 'Building your card' };
    if (stash.phase === 'failed' && stash.error) {
      return { kind: 'error' as const, title: 'Card failed', detail: stash.error.message };
    }
    return null;
  }, [stash.phase, stash.error]);

  const compositor = useOutboundCompositor({
    cameraTrack,
    micTrack,
    card: stash.card,
    placeholder,
    settings,
  });

  /**
   * What leaves this browser.
   *
   * Always the raw camera. The card travels as data over the signalling
   * socket and is composited by each receiver (`useRemoteCompositors`), so the
   * presenter's camera and a card can never interfere with each other. Baking
   * the card in was inherited from the extension, where injecting into somebody
   * else's browser was the only option available.
   */
  const outbound = useMemo<MediaStream | null>(() => {
    if (!joined) return null;
    const tracks = [micTrack, cameraTrack].filter((t): t is MediaStreamTrack => !!t && t.readyState !== 'ended');
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, [joined, micTrack, cameraTrack]);

  /**
   * The self tile's stream: the camera, straight from the device.
   *
   * Built here rather than in the compositor so it is structurally impossible
   * for a compositing fault to reach the presenter's own view. A new stream
   * object per render is fine — `MeetingTile` reassigns `srcObject` and calls
   * `play()`, and the camera track identity never changes.
   */
  const preview = useMemo<MediaStream | null>(() => {
    const tracks = [micTrack, cameraTrack].filter((t): t is MediaStreamTrack => !!t && t.readyState !== 'ended');
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, [micTrack, cameraTrack]);

  /* ------------------------------------------------------------------ */
  /* Mesh                                                               */
  /* ------------------------------------------------------------------ */

  const meshEventRef = useRef<(e: MeshEvent) => void>(() => {});
  useEffect(() => {
    meshEventRef.current = (event: MeshEvent) => {
      if (event.type === 'peer-failed') {
        setConnectionWarning('Someone in this meeting could not be reached.');
        return;
      }
      if (event.type === 'media-error') {
        // A single ICE hiccup is noise; surfacing each one would flash a banner
        // every few seconds on a flaky network.
        setConnectionWarning('A connection is having trouble. Still negotiating.');
        return;
      }
      if (event.type === 'peer-connected') setConnectionWarning(null);
    };
  }, []);

  const sendSignal = useCallback(
    (to: string, data: SignalPayload) => socket.send({ t: 'signal', to, data }),
    [socket.send],
  );

  const mesh = useWebRtcMesh({
    rtc: socket.rtc,
    selfId: socket.selfId,
    participants: socket.participants,
    outbound,
    screenTrack: share.track,
    sendSignal,
    onEvent: (e) => meshEventRef.current(e),
  });

  meshSignalRef.current = mesh.handleSignal;

  /* ------------------------------------------------------------------ */
  /* Presence                                                           */
  /* ------------------------------------------------------------------ */

  const selfState = useMemo<MeetingParticipant['state']>(
    () => ({
      micOn: media.micOn,
      camOn: media.camOn,
      sharing: !!share.track,
      captionsOn,
      handRaised: false,
    }),
    [media.micOn, media.camOn, share.track, captionsOn],
  );

  useEffect(() => {
    if (!joined) return;
    socket.send({ t: 'state', state: selfState });
  }, [joined, selfState, socket.send]);

  // Mute automatically when the host asks, then stop nagging about it once the
  // host's request clears (they can send another).
  useEffect(() => {
    if (!socket.muteRequestedBy) {
      setMutedByHost(false);
      return;
    }
    setMutedByHost(true);
    if (media.micOn) media.setMicOn(false);
  }, [socket.muteRequestedBy, media.micOn, media]);

  const clock = useMeetingClock(joinedAt);

  // Stamp the start of the call the moment the server says we are in.
  const joinedRef = useRef(joinedAt);
  joinedRef.current = joinedAt;
  useEffect(() => {
    if (joinedRef.current === 0 && socket.status === 'open') setJoinedAt(Date.now());
  }, [socket.status]);

  /* ------------------------------------------------------------------ */
  /* Settings from the account                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const api = getApiClient(getAccessToken);
        const me = await api.getMe();
        if (!cancelled && me.settings) setSettings(me.settings);
      } catch {
        // Defaults are correct and safe; a settings fetch must never block a call.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  /* ------------------------------------------------------------------ */
  /* Levels                                                             */
  /* ------------------------------------------------------------------ */

  const levelStreams = useMemo(() => {
    const map: Record<string, MediaStream | null> = {};
    for (const [id, entry] of Object.entries(mesh.peers)) map[id] = entry?.stream ?? null;
    return map;
  }, [mesh.peers]);

  const remoteLevels = useRemoteLevels(levelStreams);

  /* ------------------------------------------------------------------ */
  /* Receiving-side cards                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Cards are composited here, on arrival, rather than baked into the sender's
   * video. See `useRemoteCompositors` for why that is the better trade.
   */
  const clearedCardSenders = useMemo(() => {
    // `socket.cards` already drops entries when their owner clears them, so the
    // cleared set is only needed for the short window in which a stale card
    // would otherwise linger on a tile.
    const seen = new Set<string>();
    for (const entry of socket.cards) seen.add(entry.id);
    return seen;
  }, [socket.cards]);

  const composites = useRemoteCompositors({
    peers: mesh.peers,
    cards: socket.cards,
    cleared: clearedCardSenders,
    settings,
  });

  /* ------------------------------------------------------------------ */
  /* Derived room state                                                 */
  /* ------------------------------------------------------------------ */

  const roster = useMemo<MeetingParticipant[]>(() => {
    if (!socket.selfId) return socket.participants;
    const self: MeetingParticipant = {
      id: socket.selfId,
      name: effectiveName || 'You',
      role: socket.isHost ? 'host' : 'guest',
      state: selfState,
      joinedAt: joinedAt || Date.now(),
    };
    return [self, ...socket.participants];
  }, [socket.selfId, socket.isHost, socket.participants, selfState, joinedAt, effectiveName]);

  /**
   * The card the room is looking at.
   *
   * Broadcast metadata is the only way a remote participant can know that the
   * data now burned into their video of somebody else is Stash Live output —
   * the pixels alone cannot say so. Their own video is the source of truth;
   * the room's newest validated broadcast is the fallback.
   */
  const activeCard = useMemo(() => {
    if (stash.card) {
      return { card: stash.card, ownerId: socket.selfId ?? 'self', ownerName: effectiveName || 'You', isSelf: true };
    }
    const names = new Map(roster.map((p) => [p.id, p.name]));
    for (let i = socket.cards.length - 1; i >= 0; i--) {
      const entry = socket.cards[i];
      const parsed = parseCardSpec(entry.card);
      if (!parsed.ok) continue;
      return {
        card: parsed.value,
        ownerId: entry.id,
        ownerName: names.get(entry.id) ?? entry.name,
        isSelf: false,
      };
    }
    return null;
  }, [stash.card, socket.cards, socket.selfId, roster, effectiveName]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      socket.send({ t: 'chat', text: trimmed });
    },
    [socket.send],
  );

  const sendReaction = useCallback((emoji: string) => socket.send({ t: 'reaction', emoji }), [socket.send]);

  const sendCaption = useCallback(
    (text: string, final: boolean) => socket.send({ t: 'caption', text, final }),
    [socket.send],
  );

  const setCaptionsOn = useCallback((on: boolean) => setCaptionsOnState(on), []);

  /**
   * Captions.
   *
   * Device-side, and relayed as text — see `useCaptionBroadcast`. Each speaker
   * transcribes their own voice, so the room's audio stream is never read and
   * nothing is sent to an ASR provider.
   */
  useCaptionBroadcast({
    enabled: captionsOn && joined,
    onCaption: (text, final) => socket.send({ t: 'caption', text, final }),
    onError: setCaptionError,
  });

  /**
   * Card position.
   *
   * Applied to the compositor immediately — this is a live presentation
   * choice, not a preference — and persisted so the next call starts where this
   * one ended. A failed persist is silent: the card still moves.
   */
  const setCardPosition = useCallback(
    (p: CardPosition) => {
      setSettings((prev) => ({ ...prev, position: p }));
      void (async () => {
        try {
          const api = getApiClient(getAccessToken);
          const me = await api.updateSettings({ position: p });
          if (me.settings) setSettings(me.settings);
        } catch {
          /* the local value already took effect */
        }
      })();
    },
    [getAccessToken],
  );

  const toggleShare = useCallback(() => {
    if (share.track) share.stop();
    else void share.start();
  }, [share]);

  const dismissCard = useCallback(() => {
    stash.dismiss();
  }, [stash]);

  const admit = useCallback((id: string) => socket.send({ t: 'moderate', action: 'admit', id }), [socket.send]);
  const deny = useCallback((id: string) => socket.send({ t: 'moderate', action: 'deny', id }), [socket.send]);
  const removeParticipant = useCallback(
    (id: string) => socket.send({ t: 'moderate', action: 'remove', id }),
    [socket.send],
  );
  const requestMute = useCallback(
    (id: string) => socket.send({ t: 'moderate', action: 'mute-request', id }),
    [socket.send],
  );

  const leave = useCallback(() => {
    socket.send({ t: 'leave' });
  }, [socket.send]);

  const value = useMemo<MeetingContextValue>(
    () => ({
      joined,
      setJoined,
      displayName: effectiveName,
      setDisplayName,
      code: socket.code,
      status: socket.status,
      selfId: socket.selfId,
      isHost: socket.isHost,
      hostId: socket.hostId,
      joinedAt,
      elapsedMs: clock,
      participants: socket.participants,
      roster,
      waitingForHost: socket.waitingForHost,
      pendingJoiners: socket.pendingJoiners,
      failure: socket.error,
      endedBy: socket.endedBy,
      mutedByHost,
      clearMuteRequest: () => setMutedByHost(false),

      media,
      share,
      micLevel,
      remoteLevels,
      peerStreams: mesh.peers,
      composites,
      selfState,
      setMicOn: media.setMicOn,
      setCamOn: media.setCamOn,
      toggleShare,

      stash,
      outbound,
      preview,
      compositing: compositor.compositing,
      compositorError: compositor.error,
      connectionWarning,
      cardPosition: settings.position,
      setCardPosition,
      ambient: stash.ambient,
      setAmbient: stash.setAmbient,
      activeCard,
      dismissCard,

      panel,
      setPanel,
      chat: socket.chat,
      captions: socket.captions,
      captionsOn,
      setCaptionsOn,
      captionsSupported: captionsSupported(),
      captionError,
      roomCards: socket.cards,
      reactions: socket.reactions,
      unread: socket.unread,
      clearUnread: socket.clearUnread,

      sendChat,
      sendReaction,
      sendCaption,
      admit,
      deny,
      removeParticipant,
      requestMute,
      leave,
    }),
    [
      joined,
      effectiveName,
      setDisplayName,
      socket,
      joinedAt,
      clock,
      roster,
      mutedByHost,
      media,
      share,
      micLevel,
      remoteLevels,
      mesh.peers,
      selfState,
      toggleShare,
      stash,
      outbound,
      preview,
      compositor.compositing,
      compositor.error,
      connectionWarning,
      settings.position,
      setCardPosition,
      stash.ambient,
      activeCard,
      dismissCard,
      panel,
      captionsOn,
      setCaptionsOn,
      captionError,
      sendChat,
      sendReaction,
      sendCaption,
      admit,
      deny,
      removeParticipant,
      requestMute,
      leave,
    ],
  );

  return <MeetingContext.Provider value={value}>{children}</MeetingContext.Provider>;
}