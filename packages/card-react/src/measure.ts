/**
 * DOM-side text measurer.
 *
 * `layoutCard` (card-core) requires an explicit `TextMeasurer` so the caller's
 * real text metrics drive wrapping — see the comment on `approximateMeasurer`
 * in `card-core/src/layout.ts`. We measure with a scratch <canvas> rather than
 * rendering hidden DOM and reading `getBoundingClientRect`, because that is
 * synchronous, allocation-free after the first call, and is also what the
 * canvas renderer uses — the closest thing to shared code the two renderers
 * can have without literally sharing an implementation (plan §5.1).
 */
import { FONTS, approximateMeasurer, type TextMeasurer } from '@stash/card-core';

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!scratchCtx) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d');
  }
  return scratchCtx;
}

/**
 * Creates a measurer backed by `CanvasRenderingContext2D.measureText`.
 *
 * Falls back to `approximateMeasurer` when no DOM is available (e.g. SSR),
 * rather than throwing — a slightly wrong wrap on a server-rendered preview is
 * far cheaper than a hard crash.
 */
export function createDomTextMeasurer(): TextMeasurer {
  const ctx = getScratchCtx();
  if (!ctx) return approximateMeasurer;
  return (text, fontSize, weight, mono) => {
    ctx.font = `${weight} ${fontSize}px ${mono ? FONTS.mono : FONTS.sans}`;
    return ctx.measureText(text).width;
  };
}
