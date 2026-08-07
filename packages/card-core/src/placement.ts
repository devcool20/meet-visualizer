/**
 * Where the card sits in the outbound frame (plan §3.4).
 *
 * v1 uses a fixed safe-zone heuristic: outer third, right by default,
 * vertically centred, ~28% of frame width. Per-frame face detection is
 * deliberately rejected — stacking a second ML model on top of Meet's own
 * segmentation is exactly the kind of cost that breaks the 33ms frame budget.
 *
 * Extended additively for adaptive placement: `computePlacementForSide`,
 * `candidateRects`, and `resolveSide` support the busyness-based side
 * selector without changing `computePlacement`'s exported signature.
 */
import type { CardPosition } from '@stash/card-spec';
import { CARD } from './layout.js';

export interface FrameSize {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  /** Direction the card travels in from, in px. Negative = from the left. */
  enterOffset: number;
}

/** Target card width as a fraction of frame width. */
export const CARD_FRAME_FRACTION = 0.28;
const MARGIN_FRACTION = 0.035;

/**
 * Card side for adaptive placement. Imported from side-selector.
 */
import type { CardSide } from './side-selector.js';
export type { CardSide };

/**
 * Unchanged signature: same input, same output. Delegates to
 * `computePlacementForSide` after resolving `position` to a side.
 */
export function computePlacement(
  frame: FrameSize,
  cardHeight: number,
  position: CardPosition = 'auto',
): Placement {
  const side = position === 'left' ? 'left' : 'right';
  return computePlacementForSide(frame, cardHeight, side);
}

/**
 * Compute placement for an explicit side (left or right).
 *
 * Mirrors the original computePlacement logic factored out so callers
 * that already know the side (e.g. after the side-selector decides) don't
 * need to map through CardPosition first.
 */
export function computePlacementForSide(
  frame: FrameSize,
  cardHeight: number,
  side: CardSide,
): Placement {
  const scale = (frame.width * CARD_FRAME_FRACTION) / CARD.width;
  const scaledWidth = CARD.width * scale;
  const scaledHeight = cardHeight * scale;
  const margin = frame.width * MARGIN_FRACTION;

  const x = side === 'right' ? frame.width - scaledWidth - margin : margin;
  // Vertically centred, but never allowed to overhang the frame on short frames.
  const y = Math.max(margin, Math.min((frame.height - scaledHeight) / 2, frame.height - scaledHeight - margin));

  return {
    x,
    y,
    scale,
    enterOffset: side === 'right' ? scaledWidth * 0.35 : -scaledWidth * 0.35,
  };
}

/**
 * Resolve the effective side from the precedence chain:
 * 1. Explicit user position setting (left/right overrides everything)
 * 2. Spec-level position (auto/left/right — 'auto' means defer to heuristic)
 * 3. Heuristic auto-detected side (fallback)
 */
export function resolveSide(
  userPosition: CardPosition | undefined,
  specPosition: CardPosition | undefined,
  autoSide: CardSide,
): CardSide {
  if (userPosition === 'left') return 'left';
  if (userPosition === 'right') return 'right';
  if (specPosition === 'left') return 'left';
  if (specPosition === 'right') return 'right';
  return autoSide;
}

/**
 * Compute the two padded candidate rects (left and right) that the busyness
 * sampler should score, in frame coordinates.
 *
 * Each rect is the card's placed region inflated by PAD_FRACTION on all sides,
 * then clamped to the frame.
 */
import { PAD_FRACTION } from './busyness.js';
import type { GridRect } from './busyness.js';

export function candidateRects(
  frame: FrameSize,
  cardHeight: number,
): { left: GridRect; right: GridRect } {
  const scale = (frame.width * CARD_FRAME_FRACTION) / CARD.width;
  const scaledWidth = CARD.width * scale;
  const scaledHeight = cardHeight * scale;
  const margin = frame.width * MARGIN_FRACTION;
  const pad = frame.width * PAD_FRACTION;

  // Vertical centre (same as computePlacementForSide)
  const y = Math.max(margin, Math.min((frame.height - scaledHeight) / 2, frame.height - scaledHeight - margin));

  function makeRect(x: number): GridRect {
    const x1 = Math.max(0, x - pad);
    const y1 = Math.max(0, y - pad);
    const x2 = Math.min(frame.width, x + scaledWidth + pad);
    const y2 = Math.min(frame.height, y + scaledHeight + pad);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  const leftX = margin;
  const rightX = frame.width - scaledWidth - margin;

  return {
    left: makeRect(leftX),
    right: makeRect(rightX),
  };
}
