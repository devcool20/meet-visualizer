/**
 * Stash Live meeting wire contract.
 *
 * This is the signalling protocol for the built-in meeting platform — the
 * `/ws/meeting` endpoint on the engine. It is plain JSON in both directions
 * and is intentionally separate from the card protocol in `@stash/card-spec`
 * (which is the *extension* capture path).
 *
 * Two shapes cross this socket that are not JSON we own outright:
 *
 *  1. `SignalPayload` — opaque SDP/ICE. The relay never inspects it; it only
 *     routes it to exactly one `to` peer. It is still structurally validated
 *     so a hostile client cannot use the relay as an arbitrary-bytes smuggler.
 *  2. `CardSpec` — the Stash Live card, validated with `parseCardSpec` from
 *     `@stash/card-spec` before it is fanned out to the room. A card that
 *     fails validation is dropped, never broadcast.
 *
 * The relay is a mesh rendezvous point, not an SFU: audio/video never touch
 * this socket. That is why there is no media plumbing here at all.
 */
import type { CardSpec } from '@stash/card-spec';

/* ------------------------------------------------------------------ */
/* Participants                                                        */
/* ------------------------------------------------------------------ */

export type MeetingRole = 'host' | 'guest';

/** The self-reported live state of a participant, mirrored to the room. */
export interface ParticipantState {
  micOn: boolean;
  camOn: boolean;
  /** This participant is screen-sharing; the sharer sends a separate track. */
  sharing: boolean;
  /** This participant has live captions on, so others should send theirs. */
  captionsOn: boolean;
  handRaised: boolean;
}

export const DEFAULT_PARTICIPANT_STATE: ParticipantState = {
  micOn: true,
  camOn: true,
  sharing: false,
  captionsOn: false,
  handRaised: false,
};

export interface MeetingParticipant {
  /** Stable-per-connection id. Comparisons use this, never the name. */
  id: string;
  name: string;
  role: MeetingRole;
  state: ParticipantState;
  joinedAt: number;
  /** Wall-clock ms of the last inbound frame — drives idle reaping. Server-only. */
  lastSeenAt?: number;
}

/* ------------------------------------------------------------------ */
/* Signalling payload                                                  */
/* ------------------------------------------------------------------ */

/** Structurally-compatible with the DOM `RTCIceServer`. */
export interface IceServerLite {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * WebRTC configuration handed to every client on join. Issued by the engine
 * so a TURN deployment only needs one env var change.
 */
export interface RtcConfig {
  iceServers: IceServerLite[];
  /**
   * Hard ceiling on remote peers per participant. The mesh is O(n^2); the
   * engine refuses joins past this rather than letting a room degrade into
   * unusable freeze.
   */
  meshLimit: number;
}

/** SDP or ICE, relayed opaquely. */
export type SignalPayload =
  | { kind: 'description'; description: RTCDescriptionLite }
  | { kind: 'candidate'; candidate: RTCIceCandidateLite };

/** Structurally-compatible with the DOM `RTCSessionDescriptionInit`. */
export interface RTCDescriptionLite {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface RTCIceCandidateLite {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/* ------------------------------------------------------------------ */
/* Chat, captions, reactions, cards                                    */
/* ------------------------------------------------------------------ */

/** The reactions a client may send. Anything else is rejected. */
export const MEETING_REACTIONS = ['\u{1F44D}', '\u{1F44F}', '\u{1F389}', '\u{1F914}', '\u{1F525}', '\u{1F4A1}'] as const;

export type MeetingReaction = (typeof MEETING_REACTIONS)[number];

/** Broadcast whenever anyone puts a card on their own camera. */
export interface MeetingCardFrame {
  card: CardSpec;
  /** The utterance or prompt that produced it, for the room's card rail. */
  topic?: string;
  at: number;
}

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

/**
 * A presence patch. Partial by design: a client reports what changed rather
 * than re-sending its whole state, and consumers merge. The engine currently
 * broadcasts the merged result, which is a valid superset.
 */
export type ParticipantStatePatch = Partial<ParticipantState>;

export type MeetingClientMsg =
  | { t: 'create'; name: string; lockOnJoin?: boolean; code?: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'signal'; to: string; data: SignalPayload }
  | { t: 'state'; state: ParticipantStatePatch }
  | { t: 'chat'; text: string }
  | { t: 'caption'; text: string; final: boolean }
  | { t: 'reaction'; emoji: string }
  | { t: 'card'; card: unknown; topic?: string }
  | { t: 'card-cleared' }
  | { t: 'moderate'; action: 'admit' | 'deny' | 'remove' | 'mute-request'; id: string }
  | { t: 'leave' }
  | { t: 'ping' };

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

export type MeetingErrorCode =
  | 'invalid_message'
  | 'invalid_code'
  | 'room_not_found'
  | 'room_full'
  | 'room_locked'
  | 'room_ended'
  | 'not_in_room'
  | 'not_host'
  | 'peer_not_found'
  | 'internal';

export interface JoinedFrame {
  selfId: string;
  code: string;
  roomId: string;
  role: MeetingRole;
  /** Everyone already in the room, including nobody — the client offers to all of them. */
  participants: MeetingParticipant[];
  rtc: RtcConfig;
  createdAt: number;
  /** Set when the room requires host approval. */
  gated?: boolean;
}

export interface AdmitRequestFrame {
  id: string;
  name: string;
}

export type MeetingServerMsg =
  | ({ t: 'joined' } & JoinedFrame)
  /** Queued behind a host gate; the client shows "Waiting to be let in". */
  | { t: 'waiting'; hostId: string; name: string }
  | { t: 'admitted'; participants: MeetingParticipant[]; rtc: RtcConfig }
  | { t: 'denied' }
  | { t: 'peer-joined'; participant: MeetingParticipant }
  | { t: 'peer-left'; id: string }
  | { t: 'signal'; from: string; data: SignalPayload }
  | { t: 'state'; id: string; state: ParticipantStatePatch }
  | { t: 'chat'; id: string; name: string; text: string; at: number }
  | { t: 'caption'; id: string; name: string; text: string; final: boolean; at: number }
  | { t: 'reaction'; id: string; name: string; emoji: string; at: number }
  | ({ t: 'card'; id: string; name: string } & MeetingCardFrame)
  | { t: 'card-cleared'; id: string }
  | { t: 'admit-request'; request: AdmitRequestFrame }
  | { t: 'removed'; by: string }
  | { t: 'mute-request'; by: string }
  /** Host left; the earliest remaining participant is promoted. */
  | { t: 'host-migrated'; hostId: string }
  | { t: 'ended'; by: string }
  | { t: 'error'; code: MeetingErrorCode; message: string }
  | { t: 'pong' };

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const MEETING_LIMITS = {
  /** Max characters in a display name. */
  nameMax: 40,
  /** Max characters in a chat message. */
  chatMax: 800,
  /** Max characters in one caption line. */
  captionMax: 220,
  /** Max simultaneous captions kept in the room's transcript buffer. */
  captionBuffer: 50,
  /** Max cards retained in the room's "cards in this meeting" rail. */
  cardBuffer: 24,
  /** Max chat messages retained in the room buffer. */
  chatBuffer: 200,
  /** Host gate: max pending joiners before the oldest is dropped. */
  waitingQueueMax: 12,
  /** A connection with no inbound frame for this long is reaped. */
  idleTimeoutMs: 45_000,
  /** Heartbeat cadence expected from clients. */
  heartbeatMs: 15_000,
  /** A room with no participants is deleted after this long. */
  roomTtlMs: 10 * 60_000,
  /** Inbound frames per second per connection before disconnect. */
  rateLimitPerSecond: 40,
} as const;

/** Trims and collapses a display name, falling back to a generic label. */
export function sanitizeName(raw: unknown, fallback = 'Guest'): string {
  if (typeof raw !== 'string') return fallback;
  // Strip control characters, collapse runs of whitespace, trim length.
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MEETING_LIMITS.nameMax);
  return cleaned || fallback;
}