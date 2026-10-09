/**
 * The compositor canvas must be a real rendered layer.
 *
 * The reported symptom was that every remote participant's tile was pure black
 * -- with no initials, so the element had mounted and `showVideo` was true --
 * while the presenter saw their own camera perfectly. The connection was healthy
 * and the mesh was negotiating correctly; only the receiving side was dark.
 *
 * The cause: `OutboundCompositor` built its canvas with a bare
 * `document.createElement('canvas')` and never attached it to the document. A
 * canvas that contributes no visible pixels can be skipped by the compositor, and
 * `captureStream()` then hands back a track that never produces a frame. The
 * receiver renders that stream, so it renders black -- forever, with no error
 * surfaced anywhere.
 *
 * This is the same constraint the camera `<video>` inside the compositor is
 * already mounted to satisfy, and its comment says so explicitly. The canvas had
 * simply been missed.
 *
 * jsdom cannot prove the browser-side skipping behaviour, so these assert the
 * thing that is actually under our control and was actually wrong: the canvas is
 * attached to the document while the compositor is alive, and removed on
 * teardown.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OutboundCompositor } from './outbound-compositor';

class FakeTrack {
  readonly kind = 'video';
  readonly id = 'cam';
  readyState: MediaStreamTrackState = 'live';
  getSettings() {
    return { width: 640, height: 360 };
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  stop(): void {
    this.readyState = 'ended';
  }
}

class FakeCanvas {
  draws = 0;
  getContext() {
    return {
      fillStyle: '',
      fillRect: () => {
        this.draws++;
      },
      drawImage: () => {
        this.draws++;
      },
    } as never;
  }
  captureStream(): { getVideoTracks: () => MediaStreamTrack[] } {
    return { getVideoTracks: () => [new FakeTrack() as unknown as MediaStreamTrack] };
  }
}

const globals = globalThis as unknown as {
  HTMLCanvasElement?: unknown;
  requestAnimationFrame?: unknown;
  cancelAnimationFrame?: unknown;
  document?: Document;
};
let originalCanvas: unknown;
let canvases: Array<{ el: HTMLCanvasElement; fake: FakeCanvas }> = [];

beforeAll(() => {
  originalCanvas = globals.HTMLCanvasElement;
  globals.requestAnimationFrame = vi.fn(() => 0);
  globals.cancelAnimationFrame = vi.fn();

  // Intercept canvas creation so the assertions can see what the compositor
  // builds and where it puts it. A real <canvas> element is returned so
  // `appendChild` behaves normally; only the 2D context and `captureStream`,
  // which jsdom does not implement, are stubbed on the instance.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return realCreate(tag);
    const el = realCreate('canvas');
    const fake = new FakeCanvas();
    canvases.push({ el, fake });
    (el as unknown as { getContext: () => unknown }).getContext = () => fake.getContext();
    (el as unknown as { captureStream: () => unknown }).captureStream = () =>
      fake.captureStream() as unknown as MediaStream;
    return el;
  }) as typeof document.createElement);
});

afterAll(() => {
  vi.restoreAllMocks();
  globals.HTMLCanvasElement = originalCanvas;
});

describe('OutboundCompositor canvas mounting', () => {
  it('attaches the canvas to the document so captureStream yields frames', () => {
    canvases = [];
    const comp = new OutboundCompositor({});

    expect(canvases).toHaveLength(1);
    const canvas = canvases[0].el;
    expect(canvas.isConnected).toBe(true);

    // Sanity: the track really is derived from this canvas.
    expect(comp.videoTrack).not.toBeNull();

    comp.destroy();
  });

  it('removes the canvas from the document on destroy', () => {
    canvases = [];
    const comp = new OutboundCompositor({});
    const canvas = canvases[0].el;
    expect(canvas.isConnected).toBe(true);

    comp.destroy();
    expect(canvas.isConnected).toBe(false);
  });

  it('keeps the canvas invisible and unclickable while attached', () => {
    canvases = [];
const comp = new OutboundCompositor({});

    // Mounted, but must not be visible or steal clicks from the UI.
    expect(canvases[0].el.style.opacity).toBe('0.01');
    expect(canvases[0].el.style.pointerEvents).toBe('none');
    expect(canvases[0].el.style.zIndex).toBe('-1');

    comp.destroy();
  });
});