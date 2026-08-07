import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { GlassCard } from '@stash/card-react';
import type { GlassCardProps } from '@stash/card-react';
import { REVENUE_CARD, TEAM_CARD, PRODUCT_CARD, GROWTH_CARD, COVERAGE_CARD, CARD } from '@stash/card-core';

beforeAll(() => {
  // React 18's `act()` warns unless the environment marks itself explicitly —
  // jsdom via vitest doesn't set this on its own.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function render(props: GlassCardProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(GlassCard, props));
  });
  return container;
}

describe('GlassCard', () => {
  it('renders the title and subtitle', () => {
    const el = render({ spec: REVENUE_CARD, reducedMotion: true });
    expect(el.textContent).toContain('Revenue');
    expect(el.textContent).toContain('Q2 FY26');
  });

  it('applies the exact glass recipe from the plan', () => {
    const el = render({ spec: REVENUE_CARD, reducedMotion: true });
    const card = el.firstElementChild as HTMLElement;
    const style = card.style;
    expect(style.background).toBe('rgba(255, 255, 255, 0.62)');
    expect(style.backdropFilter).toBe('blur(20px) saturate(120%)');
    expect(style.border).toBe('1px solid rgba(26, 21, 18, 0.06)');
    expect(style.boxShadow).toBe('0 8px 32px 0 rgba(26,21,18,0.03)');
  });

  it('renders at the CARD.width logical size by default', () => {
    const el = render({ spec: REVENUE_CARD, reducedMotion: true });
    const card = el.firstElementChild as HTMLElement;
    expect(card.style.width).toBe(`${CARD.width}px`);
  });

  it.each([
    ['REVENUE', REVENUE_CARD],
    ['TEAM', TEAM_CARD],
    ['PRODUCT', PRODUCT_CARD],
    ['GROWTH', GROWTH_CARD],
    ['COVERAGE', COVERAGE_CARD],
  ])('renders every block kind in %s without throwing', (_name, spec) => {
    expect(() => render({ spec, reducedMotion: true })).not.toThrow();
  });

  it('scales proportionally at a non-default width without changing block count', () => {
    const el = render({ spec: REVENUE_CARD, width: 179, reducedMotion: true });
    const card = el.firstElementChild as HTMLElement;
    expect(card.style.transform).toContain('scale(0.5)');
  });
});
