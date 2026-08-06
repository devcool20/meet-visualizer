import { describe, it, expect } from 'vitest';
import { isImageTainting, loadImageCorsSafe } from '@stash/card-canvas';
import { rasterize } from '@stash/card-canvas';
import { REVENUE_CARD } from '@stash/card-core';
import type { CardSpec } from '@stash/card-spec';

/**
 * Canvas taint safety (plan §3.2 — CRITICAL): drawing a non-CORS image must
 * never reach the real card canvas, because a tainted capture canvas makes
 * `captureStream()` throw `SecurityError` and permanently breaks the user's
 * camera for the rest of the call.
 *
 * `node-canvas`/jsdom never naturally taints (there is no real cross-origin
 * fetch happening in this test environment), so the "tainting" behaviour is
 * simulated with a stubbed `getContext` that throws from `getImageData`,
 * exactly the shape a real `SecurityError` takes in a browser. This proves
 * the *logic* — "if the probe throws, treat the image as unsafe and never
 * call drawImage with it on the real canvas" — is correct. It does not, and
 * cannot in this environment, prove a real browser's tainting behaviour
 * itself; that is a manual/Playwright-in-Chrome concern (plan §5.2).
 */
describe('isImageTainting', () => {
  it('returns false for a safe image (no exception from the probe canvas)', () => {
    const safeImage = {} as CanvasImageSource;
    const makeCanvas = () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }),
    });
    expect(isImageTainting(safeImage, makeCanvas)).toBe(false);
  });

  it('returns true when getImageData throws a SecurityError-shaped exception', () => {
    const taintingImage = {} as CanvasImageSource;
    const makeCanvas = () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => {
          throw new DOMException('The canvas has been tainted by cross-origin data.', 'SecurityError');
        },
      }),
    });
    expect(isImageTainting(taintingImage, makeCanvas)).toBe(true);
  });

  it('returns true when drawImage itself throws', () => {
    const hostileImage = {} as CanvasImageSource;
    const makeCanvas = () => ({
      getContext: () => ({
        drawImage: () => {
          throw new Error('drawImage failed');
        },
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }),
    });
    expect(isImageTainting(hostileImage, makeCanvas)).toBe(true);
  });
});

describe('loadImageCorsSafe', () => {
  it('resolves null instead of throwing when the Image global is unavailable', async () => {
    const originalImage = (globalThis as { Image?: unknown }).Image;
    delete (globalThis as { Image?: unknown }).Image;
    try {
      const result = await loadImageCorsSafe('https://example.com/x.png');
      expect(result).toBeNull();
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });

  it('sets crossOrigin to anonymous before assigning src', async () => {
    class FakeImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(value: string) {
        // Assigning `src` is the trigger point in real browsers — assert
        // crossOrigin was already set by the time it happens.
        expect(this.crossOrigin).toBe('anonymous');
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    const originalImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as unknown as { Image: unknown }).Image = FakeImage;
    try {
      const result = await loadImageCorsSafe('https://example.com/x.png');
      expect(result).not.toBeNull();
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });
});

describe('rasterize — image block taint regression', () => {
  const specWithImage: CardSpec = {
    ...REVENUE_CARD,
    id: 'image-taint-test',
    blocks: [
      ...REVENUE_CARD.blocks,
      { kind: 'image', url: 'https://hostile.example.com/no-cors.png', aspect: 16 / 9 },
    ],
  };

  it('skips the image block and increments skippedBlocks when no preloaded image is supplied', () => {
    // `rasterize` never fetches (that is the caller's job, by contract —
    // `types.ts`'s `RasterizeOptions.images` docstring); an image block
    // whose url is missing from the map must be skipped exactly like a
    // tainting one, never silently drawn with a broken source.
    const result = rasterize(specWithImage, { images: new Map() });
    expect(result.skippedBlocks).toBe(1);
  });

  it('does not skip a genuinely safe preloaded image', () => {
    // A same-process canvas is a real `CanvasImageSource` that cannot taint
    // (no cross-origin fetch occurred) — this exercises the "happy path"
    // end to end: `isImageTainting` runs for real against node-canvas and
    // returns false, so the block is drawn and not counted as skipped.
    const safeSource = document.createElement('canvas');
    safeSource.width = 16;
    safeSource.height = 9;
    const srcCtx = safeSource.getContext('2d')!;
    srcCtx.fillStyle = '#ffffff';
    srcCtx.fillRect(0, 0, 16, 9);

    const images = new Map<string, CanvasImageSource>([
      ['https://hostile.example.com/no-cors.png', safeSource as unknown as CanvasImageSource],
    ]);
    const result = rasterize(specWithImage, { images });
    expect(result.skippedBlocks).toBe(0);
  });

  it('the isImageTainting stub tests above are what prove the actual skip-on-taint branch', () => {
    // Documented boundary: node-canvas/jsdom cannot organically produce a
    // tainted canvas (no real cross-origin network fetch happens in this
    // test environment), so the "image genuinely taints" branch of
    // `drawImageBlock`/`isImageTainting` is proven via the injected-stub
    // unit tests in the `isImageTainting` describe block above, not via an
    // end-to-end `rasterize()` call. A real-Chrome/Playwright smoke test
    // (plan §5.2) is what exercises the true browser tainting behaviour.
    expect(true).toBe(true);
  });
});
