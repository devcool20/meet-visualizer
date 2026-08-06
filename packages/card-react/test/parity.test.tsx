import { describe, it, expect } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { GlassCard, createDomTextMeasurer } from '@stash/card-react';
import { createCanvasTextMeasurer } from '@stash/card-canvas';
import {
  layoutCard,
  APPROVED_CARDS,
  COVERAGE_CARD,
} from '@stash/card-core';

/**
 * Renderer parity (plan §5.1): "the guarantee is 'if it looks right in the
 * dashboard preview it looks right in the meeting,' enforced by CI".
 *
 * Both renderers call the SAME `layoutCard` (card-core) for every geometry
 * decision, so true parity risk lives in whether each renderer's own
 * `TextMeasurer` produces close-enough wrap decisions, and whether each
 * renderer actually POSITIONS its output at the `y` `layoutCard` returned
 * rather than recomputing its own.
 *
 * What this test proves:
 *  1. `createDomTextMeasurer()` (card-react) and `createCanvasTextMeasurer()`
 *     (card-canvas) feed `layoutCard` measurements that agree closely enough
 *     to produce IDENTICAL card height and per-block y-offsets for every
 *     approved card plus the coverage card. In this test environment both
 *     measurers are backed by the same underlying engine (node-canvas via
 *     jsdom's `document.createElement('canvas')`), so exact equality is the
 *     right assertion here — see the module docstring on each measurer file.
 *  2. `GlassCard` (card-react) renders each block at exactly the `y` from
 *     `layoutCard`'s own output (via its `position:absolute;top:<y>px`
 *     placement), not a value it recomputed independently.
 *
 * What this test does NOT prove (documented rather than faked): pixel-exact
 * rendering equality between the DOM and canvas outputs. jsdom has no visual
 * rasterizer for arbitrary CSS (flex layout, `backdrop-filter`, etc.), so a
 * true pixel diff between the two renderers is only meaningful in a real
 * browser (plan §5.2's Playwright smoke test), not in this unit-test
 * environment. The canvas renderer's own use of `layoutCard`'s `y` for every
 * block (rather than recomputing it) is verified separately by code
 * inspection (`rasterize.ts`'s block loop uses `laid.y` directly) and by the
 * per-block-kind smoke tests in `blocks.test.ts`, which call each `draw*`
 * function at those exact computed coordinates without throwing.
 */
describe('renderer parity — layout geometry', () => {
  const fixtures = [...APPROVED_CARDS, COVERAGE_CARD];

  it('DOM and canvas measurers agree on card height and every block y-offset', () => {
    const domMeasure = createDomTextMeasurer();
    const canvasMeasure = createCanvasTextMeasurer();

    for (const spec of fixtures) {
      const domLayout = layoutCard(spec, domMeasure);
      const canvasLayout = layoutCard(spec, canvasMeasure);

      expect(canvasLayout.height, `${spec.id}: height`).toBe(domLayout.height);
      expect(canvasLayout.blocks.length).toBe(domLayout.blocks.length);
      domLayout.blocks.forEach((domBlock, i) => {
        const canvasBlock = canvasLayout.blocks[i];
        expect(canvasBlock.y, `${spec.id}: block[${i}] (${domBlock.block.kind}) y`).toBe(domBlock.y);
        expect(canvasBlock.height, `${spec.id}: block[${i}] (${domBlock.block.kind}) height`).toBe(domBlock.height);
      });
    }
  });
});

describe('renderer parity — GlassCard (React/DOM) honours layoutCard y-offsets', () => {
  const fixtures = [...APPROVED_CARDS, COVERAGE_CARD];

  it('positions every block at the exact y layoutCard computed for it', () => {
    const domMeasure = createDomTextMeasurer();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    for (const spec of fixtures) {
      const layout = layoutCard(spec, domMeasure);
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root: Root = createRoot(container);
      act(() => {
        root.render(createElement(GlassCard, { spec, reducedMotion: true }));
      });

      const cardRoot = container.firstElementChild as HTMLElement;
      const blockEls = Array.from(cardRoot.children).filter(
        (el): el is HTMLElement => el.tagName === 'DIV',
      );
      expect(blockEls.length, `${spec.id}: rendered block count`).toBe(layout.blocks.length);
      blockEls.forEach((el, i) => {
        expect(el.style.top, `${spec.id}: block[${i}] top style`).toBe(`${layout.blocks[i].y}px`);
      });

      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
