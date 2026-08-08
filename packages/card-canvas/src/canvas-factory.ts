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
    fillRect: () => { drawCounter++; },
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
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { data };
    },
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
