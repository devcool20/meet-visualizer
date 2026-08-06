/**
 * Canvas-side text measurer, using an `OffscreenCanvas`/`HTMLCanvasElement`
 * 2D context's `measureText` — the counterpart to `card-react`'s DOM-canvas
 * measurer (`card-react/src/measure.ts`). Both feed `layoutCard` a real
 * font-metrics-backed `TextMeasurer` so their wrap decisions match plan
 * §5.1's parity requirement as closely as two independent text stacks can.
 */
import { FONTS, type TextMeasurer } from '@stash/card-core';
import { createRenderCanvas, get2DContext, type Ctx2D } from './canvas-factory.js';

let scratchCtx: Ctx2D | null = null;

function getScratchCtx(): Ctx2D {
  if (!scratchCtx) {
    scratchCtx = get2DContext(createRenderCanvas(8, 8));
  }
  return scratchCtx;
}

export function createCanvasTextMeasurer(): TextMeasurer {
  const ctx = getScratchCtx();
  return (text, fontSize, weight, mono) => {
    ctx.font = `${weight} ${fontSize}px ${mono ? FONTS.mono : FONTS.sans}`;
    return ctx.measureText(text).width;
  };
}

/** Sets `ctx.font` the same way for every draw function in this package. */
export function setFont(ctx: Ctx2D, fontSize: number, weight: number, mono = false): void {
  ctx.font = `${weight} ${fontSize}px ${mono ? FONTS.mono : FONTS.sans}`;
}
