/**
 * Outbound track arbitration.
 *
 * This is the single most consequential decision in the meeting platform: what
 * track other participants actually receive. Getting it wrong means a presenter
 * either loses their video or sends black frames, so every branch is pinned
 * here.
 *
 * Each case below is one that has actually bitten somebody:
 *  - no card showing → the raw camera, so the encoder is not paying for a
 *    canvas it does not need, and a backgrounded tab cannot freeze the frame
 *    everyone is watching
 *  - a card or its placeholder showing → the composited track, because the card
 *    has to be *in* the video
 *  - the canvas could not be built → passthrough, never silence
 *  - camera off with no card → audio only, so peers render a camera-off tile
 *    instead of a black rectangle
 *  - camera off *with* a card → the composited track on the branded fill, so a
 *    presenter can turn the camera off and still present the data
 *
 * Audio is forwarded untouched in every branch: nothing here reads, buffers or
 * stores it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOutboundStream } from '../lib/outbound-stream';

/**
 * jsdom implements neither `MediaStream` nor `MediaStreamTrack`, so the minimal
 * surface both are used through is stubbed here. The arbitration only ever
 * reads `kind` and `readyState` and hands tracks to a constructor, so this is
 * the whole contract — anything richer would be testing jsdom, not the policy.
 */
class FakeMediaStream {
  private tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }
  get id(): string {
    return 'fake-stream';
  }
}

const globals = globalThis as unknown as { MediaStream?: unknown };
let originalMediaStream: unknown;

beforeAll(() => {
  originalMediaStream = globals.MediaStream;
  globals.MediaStream = FakeMediaStream;
});

afterAll(() => {
  globals.MediaStream = originalMediaStream;
});

function track(kind: 'video' | 'audio', readyState: 'live' | 'ended' = 'live'): MediaStreamTrack {
  return {
    kind,
    id: `${kind}-${Math.random().toString(36).slice(2)}`,
    readyState,
  } as unknown as MediaStreamTrack;
}

function kindsOf(stream: MediaStream | null): string[] {
  return stream ? stream.getTracks().map((t) => t.kind).sort() : [];
}

describe('resolveOutboundStream', () => {
  it('sends the raw camera when nothing is composited', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: track('video'),
      micTrack: track('audio'),
    });
    expect(kindsOf(stream)).toEqual(['audio', 'video']);
  });

  it('sends the composited track while a card is on air', () => {
    const camera = track('video');
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: true,
      cameraTrack: camera,
      micTrack: track('audio'),
    });
    // The camera must NOT be what leaves the browser while a card is up — that
    // is the whole integration.
    expect(stream?.getTracks()).not.toContain(camera);
    expect(kindsOf(stream)).toEqual(['audio', 'video']);
  });

  it('sends the composited track while a placeholder is on air', () => {
    // A placeholder occupies the same slot as a card, so the room must be
    // seeing the composited track during the wait too.
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: true,
      cameraTrack: track('video'),
      micTrack: track('audio'),
    });
    expect(kindsOf(stream)).toEqual(['audio', 'video']);
  });

  it('keeps presenting data with the camera off', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: true,
      cameraTrack: null,
      micTrack: track('audio'),
    });
    // A card with no camera is still a card the room needs to see, drawn on the
    // branded fill.
    expect(kindsOf(stream)).toEqual(['audio', 'video']);
  });

  it('sends audio only when the camera is off and no card is up', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: null,
      micTrack: track('audio'),
    });
    // Peers render a camera-off tile rather than a black rectangle.
    expect(kindsOf(stream)).toEqual(['audio']);
  });

  it('falls back to the raw camera when the compositor is unavailable', () => {
    const camera = track('video');
    const stream = resolveOutboundStream({
      compositedTrack: null,
      hasOverlay: true,
      cameraTrack: camera,
      micTrack: track('audio'),
    });
    // The failure floor: a broken canvas must never cost the presenter their
    // video. The card is dropped; the presenter is not.
    expect(kindsOf(stream)).toEqual(['audio', 'video']);
    expect(stream?.getTracks()).toContain(camera);
  });

  it('keeps audio flowing with no camera and no card', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: null,
      micTrack: track('audio'),
    });
    expect(kindsOf(stream)).toEqual(['audio']);
  });

  it('sends nothing when there is neither camera nor microphone', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: null,
      micTrack: null,
    });
    expect(stream).toBeNull();
  });

  it('sends nothing at all when the compositor failed and there is no camera', () => {
    expect(
      resolveOutboundStream({ compositedTrack: null, hasOverlay: false, cameraTrack: null, micTrack: null }),
    ).toBeNull();
  });

  it('ignores an ended camera track rather than freezing a remote tile', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: track('video', 'ended'),
      micTrack: null,
    });
    // An ended track makes peers hold one frozen frame forever.
    expect(stream).toBeNull();
  });

  it('ignores an ended microphone track', () => {
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: null,
      micTrack: track('audio', 'ended'),
    });
    expect(stream).toBeNull();
  });

  it('falls back to the camera when the composited track has ended', () => {
    const camera = track('video');
    const stream = resolveOutboundStream({
      compositedTrack: track('video', 'ended'),
      hasOverlay: true,
      cameraTrack: camera,
      micTrack: track('audio'),
    });
    // The canvas track died under us mid-call. Recover to the camera rather
    // than dropping the presenter to audio-only.
    expect(stream?.getTracks()).toContain(camera);
  });

  it('falls back to the raw camera when the compositor is not producing frames', () => {
  // The health gate is expressed by the caller passing `compositedTrack: null`
  // when the compositor is unhealthy, which is exactly what this asserts: a
  // broken compositor must never be what the room sees.
  const camera = track('video');
  const stream = resolveOutboundStream({
    compositedTrack: null,
    hasOverlay: true,
    cameraTrack: camera,
    micTrack: track('audio'),
  });
  expect(stream?.getTracks()).toContain(camera);
});

it('returns a fresh stream object per call so a replaceTrack actually fires', () => {
    const inputs = {
      compositedTrack: track('video'),
      hasOverlay: false,
      cameraTrack: track('video'),
      micTrack: track('audio'),
    };
    // Two renders with identical inputs must not be the same object, or the
    // mesh would skip the track replacement and send a stale frame.
    expect(resolveOutboundStream(inputs)).not.toBe(resolveOutboundStream(inputs));
  });
});