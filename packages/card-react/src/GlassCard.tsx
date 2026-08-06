/**
 * `GlassCard` — the React/DOM renderer's entry point.
 *
 * Renders a `CardSpec` as real DOM using the actual `backdrop-filter` glass
 * recipe (plan §3.2 step 3 / the approved mockup at `src/app/App.tsx` L801,
 * L1198, L1386). This is the dashboard/editor/landing surface; the extension's
 * pure-canvas renderer lives in `@stash/card-canvas` and is bound to this one
 * only by shared `card-core` layout math and golden fixture tests (plan §5.1).
 *
 * Every block is positioned with the EXACT `y` that `layoutCard` (card-core)
 * computed, via `position: absolute; top: <y>px`. This is deliberate, not
 * lazy: normal document flow would let the browser's own text-wrapping and
 * margin collapsing silently diverge from the canvas renderer's arithmetic,
 * which is exactly the drift the golden fixture parity tests (§5.2) exist to
 * catch. Pinning both surfaces to the same numbers is what makes "looks right
 * in the dashboard" mean "looks right in the meeting".
 */
import { useMemo, useEffect, useState, type CSSProperties } from 'react';
import { CARD, TYPE, resolveTheme, layoutCard, FONTS } from '@stash/card-core';
import type { GlassCardProps } from './types.js';
import { createDomTextMeasurer } from './measure.js';
import { BlockRenderer } from './blocks/BlockRenderer.js';

/**
 * Glass recipe from the plan, verbatim. Kept as one object so every consumer
 * (this file only, deliberately — no other component should re-derive glass
 * styling) draws from a single definition.
 */
const GLASS_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.45)',
  backdropFilter: 'blur(20px) saturate(120%)',
  WebkitBackdropFilter: 'blur(20px) saturate(120%)',
  border: '1px solid rgba(26,21,18,0.06)',
  boxShadow: '0 8px 32px 0 rgba(26,21,18,0.03)',
};

export function GlassCard({ spec, width = CARD.width, theme: themeOverride, reducedMotion, className }: GlassCardProps) {
  const theme = useMemo(() => resolveTheme(themeOverride ?? spec.theme), [themeOverride, spec.theme]);
  const measure = useMemo(() => createDomTextMeasurer(), []);
  const layout = useMemo(() => layoutCard(spec, measure), [spec, measure]);
  const scale = width / CARD.width;

  // Entry state: `reducedMotion` skips travel/scale and does an instant
  // 150ms opacity fade per plan §3.3; otherwise a soft scale + opacity rise
  // that matches the spring choreography's silhouette without re-implementing
  // the physics in CSS (the physics live once, in card-core's `CardAnimator`,
  // for the canvas surface — see `card-canvas/src/composite.ts`).
  const [entered, setEntered] = useState(reducedMotion ?? false);
  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
    // Re-run the enter transition whenever the card identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, spec.revision, reducedMotion]);

  return (
    <div
      className={className}
      role="img"
      aria-label={spec.subtitle ? `${spec.title} — ${spec.subtitle}` : spec.title}
      style={{
        width: CARD.width,
        height: layout.height,
        borderRadius: CARD.radius,
        boxSizing: 'border-box',
        fontFamily: FONTS.sans,
        color: theme.text,
        transform: `scale(${scale}) ${entered ? 'translateY(0)' : 'translateY(4px)'}`,
        transformOrigin: 'top left',
        opacity: entered ? 1 : 0,
        transition: reducedMotion
          ? 'opacity 150ms linear'
          : 'opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)',
        position: 'relative',
        overflow: 'hidden',
        ...GLASS_STYLE,
      }}
    >
      <p
        style={{
          position: 'absolute',
          margin: 0,
          top: CARD.paddingTop,
          left: CARD.paddingX,
          right: CARD.paddingX,
          fontSize: TYPE.title.size,
          fontWeight: TYPE.title.weight,
          lineHeight: `${TYPE.title.lineHeight}px`,
          color: theme.text,
        }}
      >
        {spec.title}
      </p>
      {spec.subtitle && (
        <p
          style={{
            position: 'absolute',
            margin: 0,
            top: CARD.paddingTop + TYPE.title.lineHeight,
            left: CARD.paddingX,
            right: CARD.paddingX,
            fontSize: TYPE.subtitle.size,
            fontWeight: TYPE.subtitle.weight,
            lineHeight: `${TYPE.subtitle.lineHeight}px`,
            color: theme.textMuted,
          }}
        >
          {spec.subtitle}
        </p>
      )}
      {layout.blocks.map((laid, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: laid.y,
            left: CARD.paddingX,
            width: CARD.width - CARD.paddingX * 2,
            height: laid.height,
          }}
        >
          <BlockRenderer block={laid.block} theme={theme} measure={measure} />
        </div>
      ))}
    </div>
  );
}
