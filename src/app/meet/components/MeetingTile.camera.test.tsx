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

/** A stream stand-in; jsdom's `MediaStream` is not implemented. */
const stream = { id: 'remote-camera' } as unknown as MediaStream;

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

const video = (): HTMLVideoElement | null => container.querySelector('video');

describe('MeetingTile camera attachment', () => {
  it('attaches the stream when the element mounts after the stream arrives', async () => {
    // Step 1: the track lands first, with `cameraOn` still false, so no
    // `<video>` exists yet -- exactly what the socket round trip produces.
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: false })));
    });
    expect(video()).toBeNull();

    // Step 2: the owner's presence state arrives and the camera is on. The tile
    // now renders a `<video>`, which must immediately receive the stream that
    // has been available all along.
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

  it('detaches the stream when the camera turns off', async () => {
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: true })));
    });
    await act(async () => {
      root.render(createElement(MeetingTile, base({ stream, cameraOn: false })));
    });

    // With the camera off there is no `<video>` at all, so nothing can keep
    // playing a stale frame.
    expect(video()).toBeNull();
  });
});