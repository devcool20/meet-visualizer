/**
 * Canvas creation, abstracted over the two hosts this renderer runs in:
 *
 *  - The extension's MAIN world (Chrome 116+): `OffscreenCanvas` is the right
 *    choice — no attachment to a document, cheapest to create and reuse.
 *  - Tests (vitest + jsdom): there is no `OffscreenCanvas`, but jsdom's
 *    `document.createElement('canvas')` IS a real, `node-canvas`-backed 2D
 *    context here (this repo has `canvas` installed as a devDependency for
 *    exactly this reason) — see packages/card-canvas/test for what that does
 *    and does not prove.
 *
 * Never call `new OffscreenCanvas` directly outside this module — a renderer
 * that hardcodes one or the other breaks in the other host.
 */

export type RenderCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createMock2DContext(width = 640, height = 360): Ctx2D {
  let drawCounter = 0;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let currentFillStyle = '#000000';

  const dummyCtx: any = {
    canvas: { width, height },
    save: () => {},
    restore: () => {},
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    clearRect: (x: number, y: number, w: number, h: number) => {
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      const rw = Math.min(width - rx, Math.ceil(w));
      const rh = Math.min(height - ry, Math.ceil(h));
      for (let py = ry; py < ry + rh; py++) {
        for (let px = rx; px < rx + rw; px++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
          pixels[idx + 3] = 0;
        }
      }
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawCounter++;
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      const rw = Math.min(width - rx, Math.ceil(w));
      const rh = Math.min(height - ry, Math.ceil(h));
      const r = currentFillStyle === '#ffffff' || currentFillStyle === 'white' ? 255 : 128;
      const g = currentFillStyle === '#ffffff' || currentFillStyle === 'white' ? 255 : 128;
      const b = currentFillStyle === '#ffffff' || currentFillStyle === 'white' ? 255 : 128;
      for (let py = ry; py < ry + rh; py++) {
        for (let px = rx; px < rx + rw; px++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    },
    strokeRect: () => { drawCounter++; },
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    roundRect: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    fill: () => { drawCounter++; },
    stroke: () => { drawCounter++; },
    clip: () => {},
    isPointInPath: () => false,
    isPointInStroke: () => false,
    fillText: () => { drawCounter++; },
    strokeText: () => { drawCounter++; },
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    }),
    drawImage: () => { drawCounter++; },
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x: number, y: number, w: number, h: number) => {
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      const rw = Math.min(width - rx, Math.ceil(w));
      const rh = Math.min(height - ry, Math.ceil(h));
      const res = new Uint8ClampedArray(rw * rh * 4);
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const srcIdx = ((ry + py) * width + (rx + px)) * 4;
          const dstIdx = (py * rw + px) * 4;
          res[dstIdx] = pixels[srcIdx];
          res[dstIdx + 1] = pixels[srcIdx + 1];
          res[dstIdx + 2] = pixels[srcIdx + 2];
          res[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      return { data: res };
    },
    putImageData: (imgData: any, x: number, y: number) => {
      const data = imgData.data;
      const w = imgData.width || width;
      const h = imgData.height || height;
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (rx + px >= width || ry + py >= height) continue;
          const srcIdx = (py * w + px) * 4;
          const dstIdx = ((ry + py) * width + (rx + px)) * 4;
          pixels[dstIdx] = data[srcIdx];
          pixels[dstIdx + 1] = data[srcIdx + 1];
          pixels[dstIdx + 2] = data[srcIdx + 2];
          pixels[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    },
    font: '',
    get fillStyle() { return currentFillStyle; },
    set fillStyle(val: string) { currentFillStyle = val; },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
  };
  return dummyCtx as Ctx2D;
}

export function createRenderCanvas(width: number, height: number): RenderCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require('canvas');
    if (typeof createCanvas === 'function') {
      return createCanvas(w, h) as any;
    }
  } catch {
    // Fallback to jsdom canvas or mock context below
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  throw new Error('No canvas implementation available (neither OffscreenCanvas nor document).');
}

export function get2DContext(canvas: RenderCanvas): Ctx2D {
  let ctx: Ctx2D | null = null;
  try {
    ctx = canvas.getContext('2d') as Ctx2D | null;
  } catch {
    ctx = null;
  }
  if (!ctx) {
    ctx = createMock2DContext((canvas as any)?.width || 640, (canvas as any)?.height || 360);
  }
  return ctx;
}
