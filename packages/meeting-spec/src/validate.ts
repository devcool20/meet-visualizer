/**
 * Validators for the meeting signalling protocol.
 *
 * The engine validates every inbound frame before it touches room state; the
 * browser validates every inbound frame before it touches React state. A
 * single malformed frame must never be able to move a participant, a card, or
 * a peer connection into a state the other side does not expect.
 *
 * Cards are validated with `parseCardSpec` from `@stash/card-spec` rather than
 * re-declared here, so the meeting path and the extension path can never drift
 * on what a legal card is.
 */
import { z } from 'zod';
import { parseCardSpec } from '@stash/card-spec';
import { MEETING_REACTIONS, MEETING_LIMITS, DEFAULT_PARTICIPANT_STATE } from './types.js';
import type {
  MeetingClientMsg,
  MeetingServerMsg,
  MeetingParticipant,
  MeetingReaction,
  ParticipantState,
  RtcConfig,
  SignalPayload,
  MeetingErrorCode,
  MeetingCardFrame,
  AdmitRequestFrame,
  JoinedFrame,
} from './types.js';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function toResult<T>(parsed: z.SafeParseReturnType<unknown, T>): ValidationResult<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.errors[0];
  const path = first?.path.join('.') || '(root)';
  return { ok: false, error: `${path}: ${first?.message ?? 'invalid'}` };
}

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export const participantStateSchema = z
  .object({
    micOn: z.boolean(),
    camOn: z.boolean(),
    sharing: z.boolean(),
    captionsOn: z.boolean(),
    handRaised: z.boolean(),
  })
  .partial();

export const meetingParticipantSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(MEETING_LIMITS.nameMax),
  role: z.enum(['host', 'guest']),
  state: participantStateSchema,
  joinedAt: z.number(),
  lastSeenAt: z.number().optional(),
});

const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const rtcConfigSchema = z.object({
  iceServers: z.array(iceServerSchema),
  meshLimit: z.number().int().min(1).max(12),
});

const signalPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('description'),
    description: z.object({
      type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
      sdp: z.string().max(512 * 1024).optional(),
    }),
  }),
  z.object({
    kind: z.literal('candidate'),
    candidate: z.object({
      candidate: z.string().max(4096).optional(),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    }),
  }),
]);

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

export const meetingClientMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('create'),
    name: z.string().max(MEETING_LIMITS.nameMax),
    lockOnJoin: z.boolean().optional(),
    // The code to claim. Required for the link path, where re-using the same
    // code is what makes the link keep pointing at the same meeting.
    code: z.string().max(32).optional(),
  }),
  z.object({ t: z.literal('join'), code: z.string().max(32), name: z.string().max(MEETING_LIMITS.nameMax) }),
  z.object({ t: z.literal('signal'), to: z.string().min(1).max(64), data: signalPayloadSchema }),
  z.object({ t: z.literal('state'), state: participantStateSchema }),
  z.object({ t: z.literal('chat'), text: z.string().max(MEETING_LIMITS.chatMax) }),
  z.object({ t: z.literal('caption'), text: z.string().max(MEETING_LIMITS.captionMax), final: z.boolean() }),
  z.object({ t: z.literal('reaction'), emoji: z.enum(MEETING_REACTIONS) }),
  // The card is carried as `unknown` on purpose: `card-spec` is the only
  // authority on card legality, and it is applied by `parseCard` below.
  z.object({
    t: z.literal('card'),
    card: z.unknown(),
    topic: z.string().max(MEETING_LIMITS.captionMax * 2).optional(),
  }),
  z.object({ t: z.literal('card-cleared') }),
  z.object({
    t: z.literal('moderate'),
    action: z.enum(['admit', 'deny', 'remove', 'mute-request']),
    id: z.string().min(1).max(64),
  }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ping') }),
]);

export function parseMeetingClientMsg(input: unknown): ValidationResult<MeetingClientMsg> {
  return toResult(meetingClientMsgSchema.safeParse(input) as z.SafeParseReturnType<unknown, MeetingClientMsg>);
}

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

const joinedShape = {
  t: z.literal('joined'),
  selfId: z.string().min(1).max(64),
  code: z.string().min(1).max(32),
  roomId: z.string().min(1).max(64),
  role: z.enum(['host', 'guest']),
  participants: z.array(meetingParticipantSchema),
  rtc: rtcConfigSchema,
  createdAt: z.number(),
  gated: z.boolean().optional(),
} as const;

export const meetingServerMsgSchema = z.discriminatedUnion('t', [
  z.object(joinedShape),
  z.object({ t: z.literal('waiting'), hostId: z.string().max(64), name: z.string().max(MEETING_LIMITS.nameMax) }),
  z.object({ t: z.literal('admitted'), participants: z.array(meetingParticipantSchema), rtc: rtcConfigSchema }),
  z.object({ t: z.literal('denied') }),
  z.object({ t: z.literal('peer-joined'), participant: meetingParticipantSchema }),
  z.object({ t: z.literal('peer-left'), id: z.string().min(1).max(64) }),
  z.object({ t: z.literal('signal'), from: z.string().min(1).max(64), data: signalPayloadSchema }),
  z.object({ t: z.literal('state'), id: z.string().min(1).max(64), state: participantStateSchema }),
  z.object({ t: z.literal('chat'), id: z.string().min(1).max(64), name: z.string(), text: z.string(), at: z.number() }),
  z.object({
    t: z.literal('caption'),
    id: z.string().min(1).max(64),
    name: z.string(),
    text: z.string(),
    final: z.boolean(),
    at: z.number(),
  }),
  z.object({
    t: z.literal('reaction'),
    id: z.string().min(1).max(64),
    name: z.string(),
    emoji: z.enum(MEETING_REACTIONS),
    at: z.number(),
  }),
  z.object({ t: z.literal('card'), id: z.string().min(1).max(64), name: z.string(), card: z.unknown(), topic: z.string().optional(), at: z.number() }),
  z.object({ t: z.literal('card-cleared'), id: z.string().min(1).max(64) }),
  z.object({ t: z.literal('admit-request'), request: z.object({ id: z.string(), name: z.string() }) }),
  z.object({ t: z.literal('removed'), by: z.string() }),
  z.object({ t: z.literal('mute-request'), by: z.string() }),
  z.object({ t: z.literal('host-migrated'), hostId: z.string() }),
  z.object({ t: z.literal('ended'), by: z.string() }),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ t: z.literal('pong') }),
]);

export function parseMeetingServerMsg(input: unknown): ValidationResult<MeetingServerMsg> {
  return toResult(meetingServerMsgSchema.safeParse(input) as z.SafeParseReturnType<unknown, MeetingServerMsg>);
}

/* ------------------------------------------------------------------ */
/* Normalisers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validates a client-supplied card with the card-spec authority.
 *
 * A card that fails is dropped rather than broadcast: the receiving clients
 * would have no way to render it, and a half-rendered card over someone's
 * face is worse than no card.
 */
export function parseCard(input: unknown): ValidationResult<MeetingCardFrame['card']> {
  return parseCardSpec(input);
}

/** Merges a partial client-reported state onto the previous state. */
export function mergeParticipantState(prev: ParticipantState, patch: Partial<ParticipantState>): ParticipantState {
  return { ...DEFAULT_PARTICIPANT_STATE, ...prev, ...patch };
}

/** Normalises a participant for broadcast (drops the server-only fields). */
export function publicParticipant(p: MeetingParticipant): MeetingParticipant {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    state: { ...DEFAULT_PARTICIPANT_STATE, ...p.state },
    joinedAt: p.joinedAt,
  };
}

export type { MeetingReaction, RtcConfig, SignalPayload, MeetingErrorCode, AdmitRequestFrame, JoinedFrame };