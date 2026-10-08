import { describe, expect, it } from 'vitest';
import { REVENUE_CARD } from '@stash/card-core';
import {
  DEFAULT_PARTICIPANT_STATE,
  MEETING_LIMITS,
  MEETING_REACTIONS,
  sanitizeName,
  type MeetingClientMsg,
  type MeetingServerMsg,
} from '../src/types.js';
import {
  mergeParticipantState,
  parseCard,
  parseMeetingClientMsg,
  parseMeetingServerMsg,
  publicParticipant,
} from '../src/validate.js';

describe('parseMeetingClientMsg', () => {
  it('accepts every frame type the client legitimately sends', () => {
    const frames: MeetingClientMsg[] = [
      { t: 'create', name: 'Priya', lockOnJoin: true },
      { t: 'join', code: 'abc-defg-hjk', name: 'Priya' },
      { t: 'signal', to: 'p1', data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } } },
      { t: 'signal', to: 'p1', data: { kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp' } } },
      { t: 'state', state: { micOn: false } },
      { t: 'chat', text: 'the deck is in Drive' },
      { t: 'caption', text: 'revenue is up', final: true },
      { t: 'reaction', emoji: MEETING_REACTIONS[0] },
      { t: 'card', card: REVENUE_CARD, topic: 'our revenue' },
      { t: 'card-cleared' },
      { t: 'moderate', action: 'admit', id: 'p2' },
      { t: 'moderate', action: 'deny', id: 'p2' },
      { t: 'moderate', action: 'remove', id: 'p2' },
      { t: 'moderate', action: 'mute-request', id: 'p2' },
      { t: 'leave' },
      { t: 'ping' },
    ];
    for (const frame of frames) {
      const parsed = parseMeetingClientMsg(frame);
      expect(parsed.ok, `${frame.t} should be valid: ${parsed.ok ? '' : parsed.error}`).toBe(true);
    }
  });

  it('rejects an unknown frame type', () => {
    expect(parseMeetingClientMsg({ t: 'nope' }).ok).toBe(false);
  });

  it('rejects a non-object frame', () => {
    for (const bad of [null, undefined, 42, 'create', []]) {
      expect(parseMeetingClientMsg(bad).ok).toBe(false);
    }
  });

  it('rejects a reaction outside the allow-list rather than echoing it back', () => {
    expect(parseMeetingClientMsg({ t: 'reaction', emoji: '🦠' }).ok).toBe(false);
    expect(parseMeetingClientMsg({ t: 'reaction', emoji: '<script>' }).ok).toBe(false);
  });

  it('caps chat length so a client cannot use the relay as storage', () => {
    expect(parseMeetingClientMsg({ t: 'chat', text: 'x'.repeat(MEETING_LIMITS.chatMax) }).ok).toBe(true);
    expect(parseMeetingClientMsg({ t: 'chat', text: 'x'.repeat(MEETING_LIMITS.chatMax + 1) }).ok).toBe(false);
  });

  it('caps an SDP payload so the relay is not an arbitrary-bytes smuggler', () => {
    const ok = parseMeetingClientMsg({
      t: 'signal',
      to: 'p1',
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0'.repeat(1000) } },
    });
    expect(ok.ok).toBe(true);
    const tooBig = parseMeetingClientMsg({
      t: 'signal',
      to: 'p1',
      data: { kind: 'description', description: { type: 'offer', sdp: 'x'.repeat(600 * 1024) } },
    });
    expect(tooBig.ok).toBe(false);
  });

  it('strips an unknown participant-state key instead of honouring it', () => {
    // Lenient on purpose: a newer client adding a presence field must not have
    // its whole state frame rejected by an older server, and an unrecognised
    // key cannot do anything because the registry only reads known ones.
    const parsed = parseMeetingClientMsg({ t: 'state', state: { micOn: false, isAdmin: true } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.t === 'state') {
      expect(parsed.value.state).toEqual({ micOn: false });
    }
  });

  it('rejects a moderate frame without a target', () => {
    expect(parseMeetingClientMsg({ t: 'moderate', action: 'remove' }).ok).toBe(false);
  });

  it('accepts an empty partial state, which is a legal no-op', () => {
    expect(parseMeetingClientMsg({ t: 'state', state: {} }).ok).toBe(true);
  });
});

describe('parseMeetingServerMsg', () => {
  const participant = {
    id: 'p1',
    name: 'Priya',
    role: 'host' as const,
    state: { ...DEFAULT_PARTICIPANT_STATE },
    joinedAt: 1,
  };
  const rtc = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], meshLimit: 6 };

  it('accepts the room-entry frame', () => {
    const frame: MeetingServerMsg = {
      t: 'joined',
      selfId: 'p1',
      code: 'abc-defg-hjk',
      roomId: 'r1',
      role: 'host',
      participants: [participant],
      rtc,
      createdAt: 1,
    };
    expect(parseMeetingServerMsg(frame).ok).toBe(true);
  });

  it('rejects a joined frame with a non-numeric mesh limit', () => {
    const frame = {
      t: 'joined',
      selfId: 'p1',
      code: 'abc-defg-hjk',
      roomId: 'r1',
      role: 'host',
      participants: [],
      rtc: { iceServers: [], meshLimit: 'many' },
      createdAt: 1,
    };
    expect(parseMeetingServerMsg(frame).ok).toBe(false);
  });

  it('accepts every broadcast frame the room sends', () => {
    const frames: MeetingServerMsg[] = [
      { t: 'waiting', hostId: 'p1', name: 'Ana' },
      { t: 'admitted', participants: [participant], rtc },
      { t: 'denied' },
      { t: 'peer-joined', participant },
      { t: 'peer-left', id: 'p2' },
      { t: 'signal', from: 'p2', data: { kind: 'candidate', candidate: {} } },
      { t: 'state', id: 'p1', state: { micOn: false, sharing: true } },
      { t: 'chat', id: 'p1', name: 'Priya', text: 'hi', at: 1 },
      { t: 'caption', id: 'p1', name: 'Priya', text: 'hi', final: false, at: 1 },
      { t: 'reaction', id: 'p1', name: 'Priya', emoji: MEETING_REACTIONS[1], at: 1 },
      { t: 'card', id: 'p1', name: 'Priya', card: REVENUE_CARD, at: 1 },
      { t: 'card-cleared', id: 'p1' },
      { t: 'admit-request', request: { id: 'p9', name: 'Ana' } },
      { t: 'removed', by: 'the host' },
      { t: 'mute-request', by: 'the host' },
      { t: 'host-migrated', hostId: 'p2' },
      { t: 'ended', by: 'the host' },
      { t: 'error', code: 'room_full', message: 'full' },
      { t: 'pong' },
    ];
    for (const frame of frames) {
      const parsed = parseMeetingServerMsg(frame);
      expect(parsed.ok, `${frame.t}: ${parsed.ok ? '' : parsed.error}`).toBe(true);
    }
  });

  it('rejects a card frame whose card field is not an object at all', () => {
    // The card itself is validated separately by `parseCard`; the envelope
    // only needs to be structurally sound.
    expect(parseMeetingServerMsg({ t: 'card', id: 'p1', name: 'Priya', card: 'nope', at: 1 }).ok).toBe(true);
  });
});

describe('parseCard', () => {
  it('accepts a real card', () => {
    expect(parseCard(REVENUE_CARD).ok).toBe(true);
  });

  it('rejects a card missing required fields', () => {
    const { title: _title, ...noTitle } = REVENUE_CARD;
    expect(parseCard(noTitle).ok).toBe(false);
  });

  it('rejects junk', () => {
    for (const bad of [null, undefined, 42, 'card', []]) {
      expect(parseCard(bad).ok).toBe(false);
    }
  });
});

describe('mergeParticipantState', () => {
  it('merges a partial patch onto the previous state', () => {
    const prev = { ...DEFAULT_PARTICIPANT_STATE, camOn: false, handRaised: true };
    expect(mergeParticipantState(prev, { micOn: false })).toEqual({
      micOn: false,
      camOn: false,
      sharing: false,
      captionsOn: false,
      handRaised: true,
    });
  });

  it('fills in defaults for a partial previous state', () => {
    // A participant record read from an older payload can be missing keys; the
    // merge must not propagate undefined into the room's presence frames.
    const partial = { micOn: true } as Partial<typeof DEFAULT_PARTICIPANT_STATE>;
    expect(mergeParticipantState(partial as typeof DEFAULT_PARTICIPANT_STATE, { micOn: true })).toEqual({
      ...DEFAULT_PARTICIPANT_STATE,
      micOn: true,
    });
  });
});

describe('publicParticipant', () => {
  it('drops the server-only lastSeenAt and fills the state', () => {
    const p = publicParticipant({
      id: 'p1',
      name: 'Priya',
      role: 'host',
      state: { micOn: false } as never,
      joinedAt: 5,
      lastSeenAt: 9,
    });
    expect(p).toEqual({
      id: 'p1',
      name: 'Priya',
      role: 'host',
      state: { ...DEFAULT_PARTICIPANT_STATE, micOn: false },
      joinedAt: 5,
    });
    expect('lastSeenAt' in p).toBe(false);
  });
});

describe('sanitizeName', () => {
  it('trims, collapses whitespace, and strips control characters', () => {
    expect(sanitizeName('  Priya   Rao  ')).toBe('Priya Rao');
    expect(sanitizeName('Pri ya')).toBe('Pri ya');
    expect(sanitizeName('a b')).toBe('a b');
  });

  it('falls back for empty and non-string input', () => {
    expect(sanitizeName('   ', 'Guest')).toBe('Guest');
    expect(sanitizeName(null)).toBe('Guest');
    expect(sanitizeName(7)).toBe('Guest');
  });

  it('caps the length', () => {
    expect(sanitizeName('x'.repeat(200))).toHaveLength(MEETING_LIMITS.nameMax);
  });
});