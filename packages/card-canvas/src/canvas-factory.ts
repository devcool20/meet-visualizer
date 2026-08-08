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

let nodeCanvasCtor: any = null;
if (typeof window === 'undefined' || typeof process !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nodeCanvasCtor = require('canvas').createCanvas;
  } catch {
    // Ignore in browser bundle
  }
}

if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && nodeCanvasCtor) {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: any) {
    const ctx = origGetContext.call(this, contextId, options);
    if (ctx || contextId !== '2d') return ctx;
    try {
      const fallbackCanvas = nodeCanvasCtor(this.width || 300, this.height || 150);
      return fallbackCanvas.getContext('2d');
    } catch {
      return null;
    }
  } as any;
}

function createMock2DContext(width = 640, height = 360): Ctx2D {
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
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
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
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    isPointInPath: () => false,
    isPointInStroke: () => false,
    fillText: () => {},
    strokeText: () => {},
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    }),
    drawImage: () => {},
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
    font: '',
    fillStyle: '',
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
  if (nodeCanvasCtor) {
    try {
      return nodeCanvasCtor(w, h) as unknown as HTMLCanvasElement;
    } catch {
      // Fall through to jsdom
    }
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
  let ctx = canvas.getContext('2d');
  if (!ctx && nodeCanvasCtor) {
    try {
      const c = nodeCanvasCtor((canvas as any).width || 300, (canvas as any).height || 150);
      ctx = c.getContext('2d');
    } catch {
      // Ignore
    }
  }
  if (!ctx) {
    ctx = createMock2DContext((canvas as any).width || 640, (canvas as any).height || 360);
  }
  return ctx as Ctx2D;
}
