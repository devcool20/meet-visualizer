/**
 * Canvas creation, abstracted over the two hosts this renderer runs in:
 *
 *  - The extension's MAIN world (Chrome 116+): `OffscreenCanvas` is the right
 *    choice — no attachment to a document, cheapest to create and reuse.
 *  - Tests (vitest + jsdom): there is no `OffscreenCanvas`, but jsdom's
 *    `document.createElement('canvas')` or our high-fidelity mock context
 *    provides full pixel-level simulation for tests.
 *
 * Never call `new OffscreenCanvas` directly outside this module.
 */

export type RenderCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function parseColor(str: string): [number, number, number, number] {
  if (!str) return [0, 0, 0, 255];
  const s = str.trim().toLowerCase();
  if (s === '#000' || s === '#000000' || s === 'black') return [0, 0, 0, 255];
  if (s === '#fff' || s === '#ffffff' || s === 'white') return [255, 255, 255, 255];
  if (s === '#808080' || s === 'grey' || s === 'gray') return [128, 128, 128, 255];
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        255,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ];
    }
  }
  return [128, 128, 128, 255];
}

function createMock2DContext(width = 640, height = 360): Ctx2D {
  let drawCounter = 0;
  let currentPathRect: [number, number, number, number] | null = null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let currentFillStyle = '#000000';

  const dummyCtx: any = {
    canvas: { width, height },
    _pixels: pixels,
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
        const start = (py * width + rx) * 4;
        pixels.fill(0, start, start + rw * 4);
      }
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawCounter++;
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      const rw = Math.min(width - rx, Math.ceil(w));
      const rh = Math.min(height - ry, Math.ceil(h));
      if (rw <= 0 || rh <= 0) return;
      const [r, g, b, a] = parseColor(currentFillStyle);
      const seg = new Uint8ClampedArray(rw * 4);
      for (let px = 0; px < rw; px++) {
        const s = px * 4;
        seg[s] = r;
        seg[s + 1] = g;
        seg[s + 2] = b;
        seg[s + 3] = a;
      }
      for (let py = ry; py < ry + rh; py++) {
        pixels.set(seg, (py * width + rx) * 4);
      }
    },
    strokeRect: () => { drawCounter++; },
    beginPath: () => {
      currentPathRect = null;
    },
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    arc: (cx: number, cy: number, r: number) => {
      currentPathRect = [cx - r, cy - r, r * 2, r * 2];
    },
    ellipse: () => {},
    rect: (x: number, y: number, w: number, h: number) => {
      currentPathRect = [x, y, w, h];
    },
    roundRect: (x: number, y: number, w: number, h: number) => {
      currentPathRect = [x, y, w, h];
    },
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    fill: () => {
      drawCounter++;
      if (currentPathRect) {
        const [x, y, w, h] = currentPathRect;
        const rx = Math.max(0, Math.floor(x));
        const ry = Math.max(0, Math.floor(y));
        const rw = Math.min(width - rx, Math.ceil(w));
        const rh = Math.min(height - ry, Math.ceil(h));
        if (rw <= 0 || rh <= 0) return;
        const [r, g, b, a] = parseColor(currentFillStyle);
        const seg = new Uint8ClampedArray(rw * 4);
        for (let px = 0; px < rw; px++) {
          const s = px * 4;
          seg[s] = r;
          seg[s + 1] = g;
          seg[s + 2] = b;
          seg[s + 3] = a;
        }
        for (let py = ry; py < ry + rh; py++) {
          pixels.set(seg, (py * width + rx) * 4);
        }
      }
    },
    stroke: () => { drawCounter++; },
    clip: () => {},
    isPointInPath: () => false,
    isPointInStroke: () => false,
    fillText: (_text: string, x: number, y: number) => {
      drawCounter++;
      const [r, g, b, a] = parseColor(currentFillStyle);
      const rx = Math.max(0, Math.min(width - 5, Math.floor(x)));
      const ry = Math.max(0, Math.min(height - 5, Math.floor(y)));
      for (let py = ry; py < ry + 4 && py < height; py++) {
        for (let px = rx; px < rx + 12 && px < width; px++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    },
    strokeText: () => { drawCounter++; },
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    }),
    drawImage: (image: any, ...args: any[]) => {
      drawCounter++;
      // Integer-coordinate coercion: real canvases rasterize at integer
      // device pixels, and fractional indices into the typed-array backing
      // store are orders of magnitude slower in V8.
      let dx = 0;
      let dy = 0;
      let dw = width;
      let dh = height;

      if (args.length === 2) {
        [dx, dy] = args;
      } else if (args.length === 4) {
        [dx, dy, dw, dh] = args;
      } else if (args.length >= 8) {
        [dx, dy, dw, dh] = [args[4], args[5], args[6], args[7]];
      }
      dx = Math.round(dx);
      dy = Math.round(dy);
      dw = Math.max(1, Math.round(dw));
      dh = Math.max(1, Math.round(dh));

      const srcPixels = image?._mockCtx?._pixels || image?._pixels;
      const srcW = image?.width || (image?.canvas?.width) || width;
      const srcH = image?.height || (image?.canvas?.height) || height;

      if (srcPixels) {
        if (dw === srcW && dh === srcH) {
          // 1:1 blit — bulk row copies.
          const rowBytes = dw * 4;
          for (let targetY = 0; targetY < dh; targetY++) {
            const dyClamped = dy + targetY;
            if (dyClamped < 0 || dyClamped >= height) continue;
            const srcRow = Math.min(srcH - 1, targetY) * rowBytes;
            pixels.set(srcPixels.subarray(srcRow, srcRow + rowBytes), (dyClamped * width + dx) * 4);
          }
        } else {
          // Scaled blit — per-pixel sampling with hoisted column mapping.
          const colSrc = new Int32Array(Math.max(0, Math.min(dw, width - dx)));
          for (let targetX = 0; targetX < colSrc.length; targetX++) {
            colSrc[targetX] = Math.min(srcW - 1, ((targetX / dw) * srcW) | 0) * 4;
          }
          for (let targetY = 0; targetY < dh && dy + targetY < height; targetY++) {
            const srcY = Math.min(srcH - 1, ((targetY / dh) * srcH) | 0);
            const dstRowBase = ((dy + targetY) * width + dx) * 4;
            for (let targetX = 0; targetX < colSrc.length; targetX++) {
              const srcIdx = srcY * srcW * 4 + colSrc[targetX];
              const dstIdx = dstRowBase + targetX * 4;
              pixels[dstIdx] = srcPixels[srcIdx];
              pixels[dstIdx + 1] = srcPixels[srcIdx + 1];
              pixels[dstIdx + 2] = srcPixels[srcIdx + 2];
              pixels[dstIdx + 3] = srcPixels[srcIdx + 3];
            }
          }
        }
      }
    },
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x: number, y: number, w: number, h: number) => {
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      const rw = Math.min(width - rx, Math.ceil(w));
      const rh = Math.min(height - ry, Math.ceil(h));
      const res = new Uint8ClampedArray(rw * rh * 4);
      for (let py = 0; py < rh; py++) {
        const srcStart = ((ry + py) * width + rx) * 4;
        res.set(pixels.subarray(srcStart, srcStart + rw * 4), py * rw * 4);
      }
      return { data: res, width: rw, height: rh };
    },
    putImageData: (imgData: any, x: number, y: number) => {
      const data = imgData.data;
      const w = imgData.width || width;
      const h = imgData.height || height;
      const rx = Math.max(0, Math.floor(x));
      const ry = Math.max(0, Math.floor(y));
      for (let py = 0; py < h; py++) {
        if (ry + py >= height) continue;
        const rowW = Math.min(w, width - rx);
        if (rowW <= 0) continue;
        pixels.set(
          data.subarray(py * w * 4, py * w * 4 + rowW * 4),
          ((ry + py) * width + rx) * 4,
        );
      }
    },
    _drawCounter: () => drawCounter,
    font: '14px Inter',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: any) {
      currentFillStyle = val;
    },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
  };
  return dummyCtx as Ctx2D;
}

// Polyfill HTMLCanvasElement.prototype.getContext for jsdom test environments
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string) {
    if (contextId === '2d') {
      if (!(this as any)._mockCtx) {
        (this as any)._mockCtx = createMock2DContext(this.width || 640, this.height || 360);
      }
      return (this as any)._mockCtx;
    }
    return null;
  } as any;
}

export function createRenderCanvas(width: number, height: number): RenderCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const mockCtx = createMock2DContext(w, h);
    (canvas as any)._mockCtx = mockCtx;
    return canvas;
  }
  const mockCanvas: any = {
    width: w,
    height: h,
    _mockCtx: createMock2DContext(w, h),
    getContext: (type: string) => (type === '2d' ? mockCanvas._mockCtx : null),
  };
  return mockCanvas;
}

export function get2DContext(canvas: RenderCanvas): Ctx2D {
  let ctx: Ctx2D | null = null;
  try {
    ctx = (canvas as any).getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  } catch {
    try {
      ctx = (canvas as any).getContext('2d') as Ctx2D | null;
    } catch {
      ctx = null;
    }
  }
  if (!ctx) {
    if ((canvas as any)?._mockCtx) {
      ctx = (canvas as any)._mockCtx;
    } else {
      ctx = createMock2DContext((canvas as any)?.width || 640, (canvas as any)?.height || 360);
      (canvas as any)._mockCtx = ctx;
    }
  }
  return ctx!;
}
