/**
 * A tile that stays black forever.
 *
 * The reported symptom: both participants appeared in the roster, the peer
 * connection reached `connected`, and `peer.stream` was populated -- yet every
 * tile rendered black. The connection was healthy; only the `<video>` was empty.
 *
 * The cause is an ordering bug between the render and the effect. `showVideo`
 * requires *both* `cameraOn` and `stream`, and the `<video>` element only
 * exists while `showVideo` is true. But the effect that assigns `srcObject`
 * depends solely on `stream`. So when the stream arrives first -- which is the
 * normal order, because WebRTC delivers the track before the owner's presence
 * state round-trips through the signalling socket -- the effect runs while the
 * element is still unmounted, bails on a null ref, and never runs again. When
 * `cameraOn` finally arrives the element mounts with no `srcObject`, and a black
 * tile is the correct rendering of that element.
 *
 * The tile must attach the stream whenever the element it renders changes, not
 * only when the stream changes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import { MeetingTile, type MeetingTileProps } from './MeetingTile';

/**
 * A stream stand-in. jsdom implements neither `MediaStream` nor
 * `MediaStreamTrack`, and the tile asks the stream whether it has a live video
 * track -- that question is the whole point of these tests, so it is modelled
 * honestly rather than stubbed away.
 */
const liveTrack = () => ({ kind: 'video', id: 'v1', readyState: 'live' }) as unknown as MediaStreamTrack;
const endedTrack = () => ({ kind: 'video', id: 'v1', readyState: 'ended' }) as unknown as MediaStreamTrack;

const streamWith = (tracks: MediaStreamTrack[]) =>
  ({
    id: 'remote-camera',
    getVideoTracks: () => tracks,
    getAudioTracks: () => [],
    getTracks: () => tracks,
  }) as unknown as MediaStream;

const stream = streamWith([liveTrack()]);

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom does not implement media playback; `play()` is what actually starts
  // the element painting frames, so it must be observable here.
  window.HTMLMediaElement.prototype.play = function play(): Promise<void> {
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function pause(): void {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const base = (over: Partial<MeetingTileProps> = {}): MeetingTileProps => ({
  id: 'p1',
  name: 'Local Dev',
  stream: null,
  screen: null,
  cameraOn: false,
  micOn: true,
  isSelf: false,
  isHost: false,
  ...over,
});

/**
 * The camera element specifically, not just any `<video>`: the tile also renders
 * one for a screen share, and React reuses DOM nodes across renders, so a bare
 * `querySelector('video')` can hand back an element from a previous state.
 */
const video = (): HTMLVideoElement | null => container.querySelector('video[aria-label$="camera"]');

describe('MeetingTile camera attachment', () => {
  it('attaches the stream as soon as the element mounts', async () => {
    // The element mounts with the stream already attached, in the same commit.
    // Previously the effect keyed only on `stream`, so a mount triggered by some
    // other prop left the element with no srcObject -- a permanently black tile.
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: true })));
    });

    const el = video();
    expect(el).not.toBeNull();
    expect(el!.srcObject).toBe(stream);
  });

  it('still attaches when the camera turns on before the track arrives', async () => {
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream: null, cameraOn: true })));
    });
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: true })));
    });

    expect(video()!.srcObject).toBe(stream);
  });

  it('shows video when a live track exists even if the reported flag says off', async () => {
    // The regression, straight from the `?debug=1` overlay: a healthy
    // connection with a live video track, but `camOn` reading false because the
    // presence flag travels on a different path and had not caught up. The tile
    // trusted the flag, rendered a <video>, and painted nothing.
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: false })));
    });

    expect(video()).not.toBeNull();
    expect(video()!.srcObject).toBe(stream);
  });

  it('falls back to initials only when there is genuinely no camera', async () => {
    // A stream carrying no video track, or one that has ended, is a real
    // "camera off" -- so initials, not a black element.
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream: null, cameraOn: true })));
    });
    expect(video()).toBeNull();

    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream: streamWith([endedTrack()]), cameraOn: true })));
    });
    expect(video()).toBeNull();
  });

  it('detaches the stream when the track ends', async () => {
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: true })));
    });
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream: streamWith([endedTrack()]), cameraOn: true })));
    });

    // With the camera off there is no `<video>` at all, so nothing can keep
    // playing a stale frame.
    expect(video()).toBeNull();
  });
});