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
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire a 2D context.');
  return ctx as Ctx2D;
}
