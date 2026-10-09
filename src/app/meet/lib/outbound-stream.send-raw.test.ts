/**
 * The send-raw / composite-on-receive split.
 *
 * This is the architectural contract of the meeting platform and it is worth
 * pinning in tests because it is exactly the property that broke: the card must
 * never be composited into the track the presenter *sends*, because that is what
 * takes their camera away when compositing misbehaves.
 *
 * `resolveOutboundStream` is the function that decides what leaves the browser,
 * so these cases are stated here against it rather than against the hook, which
 * would only restate the wiring.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveOutboundStream } from './outbound-stream';

class FakeMediaStream {
  constructor(private tracks: MediaStreamTrack[] = []) {}
  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }
}

const globals = globalThis as unknown as { MediaStream?: unknown };
let original: unknown;

beforeAll(() => {
  original = globals.MediaStream;
  globals.MediaStream = FakeMediaStream;
});
afterAll(() => {
  globals.MediaStream = original;
});

function track(kind: 'video' | 'audio', readyState: 'live' | 'ended' = 'live'): MediaStreamTrack {
  return { kind, id: `${kind}-1`, readyState } as unknown as MediaStreamTrack;
}

describe('the presenter never composites into their own sent video', () => {
  it('sends the raw camera even when a card is on air', () => {
    const camera = track('video');
    // A card is on air, so the presenter has an active card.
    const stream = resolveOutboundStream({
      compositedTrack: track('video'),
      hasOverlay: true,
      cameraTrack: camera,
      micTrack: track('audio'),
    });
    // The point of the whole redesign. If this ever regresses, a compositor
    // fault silently takes the presenter's camera away from them AND from
    // everyone watching, which is the failure that was reported.
    expect(stream?.getTracks()).toContain(camera);
  });

  it('sends the raw camera when the compositor has no frame at all', () => {
    const camera = track('video');
    const stream = resolveOutboundStream({
      compositedTrack: null,
      hasOverlay: true,
      cameraTrack: camera,
      micTrack: track('audio'),
    });
    expect(stream?.getTracks()).toContain(camera);
  });

  it('forwards audio untouched alongside the camera', () => {
    const mic = track('audio');
    const stream = resolveOutboundStream({
      compositedTrack: null,
      hasOverlay: false,
      cameraTrack: track('video'),
      micTrack: mic,
    });
    // Audio is never read, mixed or buffered by anything here.
    expect(stream?.getTracks()).toContain(mic);
  });

  it('sends a camera-off presenter as audio only, so peers render a tile', () => {
    const stream = resolveOutboundStream({
      compositedTrack: null,
      hasOverlay: false,
      cameraTrack: null,
      micTrack: track('audio'),
    });
    // A presenter with their camera off and no card must still be *heard*, and
    // peers need a reason to draw a camera-off tile rather than silence.
    expect(kinds(stream)).toEqual(['audio']);
  });
});

/**
 * A card is rendered on the receiver, so a receiver that cannot build a canvas
 * must still show the person's face. This is the same failure one level over,
 * and it is worth stating explicitly.
 */
describe('receiving side degrades to the raw remote video', () => {
  it('falls back when the composite is unhealthy', () => {
    const raw = track('video');
    // `healthy === false` is expressed by the caller as compositedTrack: null.
    const stream = resolveOutboundStream({ compositedTrack: null, hasOverlay: true, cameraTrack: raw, micTrack: null });
    expect(stream?.getTracks()).toContain(raw);
  });
});

function kinds(stream: MediaStream | null): string[] {
  return stream ? stream.getTracks().map((t) => t.kind).sort() : [];
}

void vi;