/**
 * Where the card sits in the outbound frame (plan §3.4).
 *
 * v1 uses a fixed safe-zone heuristic: outer third, right by default,
 * vertically centred, ~28% of frame width. Per-frame face detection is
 * deliberately rejected — stacking a second ML model on top of Meet's own
 * segmentation is exactly the kind of cost that breaks the 33ms frame budget.
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

export function computePlacement(
  frame: FrameSize,
  cardHeight: number,
  position: CardPosition = 'auto',
): Placement {
  const side = position === 'left' ? 'left' : 'right';
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
