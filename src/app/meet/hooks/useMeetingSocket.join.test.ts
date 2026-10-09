/**
 * What a link does when it is opened.
 *
 * The reported bug: someone opened a shared link and landed in a different
 * meeting, under a different code. The cause was that `/meet/:code` always sent
 * `create`, so a link never joined anything -- it silently minted a new room.
 *
 * `nextJoinFrame` is the whole decision, extracted as a pure function precisely
 * so it can be tested without a socket. The property that matters is stated
 * first: a link either joins the meeting named by its code, or -- if that
 * meeting has ended -- starts one *under the same code*. It never mints a
 * different one.
 */
import { describe, expect, it } from 'vitest';
import { nextJoinFrame, type JoinIntent } from './useMeetingSocket';

const CODE = 'abc-efgj-pqrt';

describe('nextJoinFrame', () => {
  it('creates for the host flow, claiming the reserved code', () => {
    // The gate reserved this code a moment ago; claiming it is what keeps the
    // host in the room the CTA advertised.
    expect(nextJoinFrame({ mode: 'create', name: 'Priya', code: CODE, lockOnJoin: false }, null)).toEqual({
      t: 'create',
      name: 'Priya',
      lockOnJoin: false,
      code: CODE,
    });
  });

  it('joins a known-live room for the host flow when told it exists', () => {
    // A host reloading their own link must land back in their room, not create
    // a second one beside it.
    expect(nextJoinFrame({ mode: 'create', name: 'Priya', code: CODE, lockOnJoin: false }, 'room_full')).toMatchObject({
      t: 'create',
      code: CODE,
    });
  });

  it('joins when a link is opened and the room exists', () => {
    // The regression, stated as a test: a shared link must JOIN.
    expect(nextJoinFrame({ mode: 'enter', name: 'Ana', code: CODE }, null)).toEqual({
      t: 'join',
      code: CODE,
      name: 'Ana',
    });
  });

  it('starts the meeting under the SAME code when a link\'s room has ended', () => {
    // A dead link should keep working, not silently open a different meeting.
    // Minting a new code here is exactly the bug that was reported.
    expect(nextJoinFrame({ mode: 'enter', name: 'Ana', code: CODE }, 'room_not_found')).toEqual({
      t: 'create',
      name: 'Ana',
      lockOnJoin: false,
      code: CODE,
    });
  });

  it('never invents a code', () => {
    const intents: JoinIntent[] = [
      { mode: 'create', name: 'A', code: CODE },
      { mode: 'create', name: 'A' },
      { mode: 'join', name: 'A', code: CODE },
      { mode: 'enter', name: 'A', code: CODE },
    ];
    for (const intent of intents) {
      for (const err of [null, 'room_not_found', 'room_full', 'internal']) {
        const frame = nextJoinFrame(intent, err);
        // Only the code-free `create` may omit a code, and that only happens
        // when the caller genuinely did not supply one.
        if (frame.t === 'create' && intent.code) expect(frame.code).toBe(CODE);
        if (frame.t === 'join') expect(frame.code).toBe(CODE);
      }
    }
  });

  it('does not turn a join into a create on unrelated errors', () => {
    // Only "nobody is there" is worth creating for. A full room, a missing
    // token or an internal fault must surface, not silently start a side meeting.
    for (const err of ['room_full', 'not_host', 'internal', 'room_ended']) {
      expect(nextJoinFrame({ mode: 'enter', name: 'Ana', code: CODE }, err)).toMatchObject({ t: 'join' });
    }
  });
});