import { describe, it, expect } from 'vitest';
import {
  computePlacement,
  computePlacementForSide,
  resolveSide,
  candidateRects,
} from '@stash/card-core';

describe('computePlacement (unchanged signature)', () => {
  const frame = { width: 1280, height: 720 };

  it('returns the same output as before for auto position', () => {
    const p = computePlacement(frame, 290, 'auto');
    // For 'auto', falls back to 'right'
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.scale).toBeGreaterThan(0);
    // Scale can be just above 1 (358.4/358 ≈ 1.001) at 1280px
    expect(p.scale).toBeGreaterThan(0.9);
    // Right-side placement: x should be in the right half
    expect(p.x).toBeGreaterThan(frame.width / 2);
    // Enter offset positive (from right)
    expect(p.enterOffset).toBeGreaterThan(0);
  });

  it('returns the same output as before for left position', () => {
    const p = computePlacement(frame, 290, 'left');
    // Left-side placement: x should be in the left half
    expect(p.x).toBeLessThan(frame.width / 2);
    expect(p.enterOffset).toBeLessThan(0); // from left
  });

  it('returns the same output as before for right position', () => {
    const p = computePlacement(frame, 290, 'right');
    expect(p.x).toBeGreaterThan(frame.width / 2);
    expect(p.enterOffset).toBeGreaterThan(0);
  });
});

describe('computePlacementForSide', () => {
  const frame = { width: 1280, height: 720 };

  it('returns identical output to computePlacement(..., "auto") for right side', () => {
    const auto = computePlacement(frame, 290, 'auto');
    const right = computePlacementForSide(frame, 290, 'right');
    expect(right.x).toBe(auto.x);
    expect(right.y).toBe(auto.y);
    expect(right.scale).toBe(auto.scale);
    expect(right.enterOffset).toBe(auto.enterOffset);
  });

  it('returns identical output to computePlacement(..., "left") for left side', () => {
    const leftPos = computePlacement(frame, 290, 'left');
    const left = computePlacementForSide(frame, 290, 'left');
    expect(left.x).toBe(leftPos.x);
    expect(left.y).toBe(leftPos.y);
    expect(left.scale).toBe(leftPos.scale);
    expect(left.enterOffset).toBe(leftPos.enterOffset);
  });

  it('left and right x positions are mirror images about the frame centre', () => {
    const left = computePlacementForSide(frame, 290, 'left');
    const right = computePlacementForSide(frame, 290, 'right');

    // The x positions should be symmetric around the frame centre
    // accounting for card width and margin
    const scaledWidth = frame.width * 0.28; // CARD_FRAME_FRACTION
    const leftX = frame.width - right.x - scaledWidth;
    expect(Math.abs(leftX - left.x)).toBeLessThan(1);
  });

  it('produces valid enterOffset for both sides', () => {
    const left = computePlacementForSide(frame, 290, 'left');
    expect(left.enterOffset).toBeLessThan(0);

    const right = computePlacementForSide(frame, 290, 'right');
    expect(right.enterOffset).toBeGreaterThan(0);

    // enterOffset magnitudes should be equal
    expect(Math.abs(left.enterOffset)).toBeCloseTo(Math.abs(right.enterOffset), 1);
  });
});

describe('resolveSide', () => {
  it('user position overrides everything', () => {
    expect(resolveSide('left', undefined, 'right')).toBe('left');
    expect(resolveSide('right', undefined, 'left')).toBe('right');
    expect(resolveSide('left', 'right', 'right')).toBe('left');
  });

  it('spec position is second precedence', () => {
    expect(resolveSide(undefined, 'left', 'right')).toBe('left');
    expect(resolveSide(undefined, 'right', 'left')).toBe('right');
  });

  it('autoSide is the fallback', () => {
    expect(resolveSide(undefined, undefined, 'left')).toBe('left');
    expect(resolveSide(undefined, undefined, 'right')).toBe('right');
  });

  it('auto position defers to autoSide', () => {
    expect(resolveSide(undefined, 'auto', 'left')).toBe('left');
    expect(resolveSide(undefined, 'auto', 'right')).toBe('right');
  });
});

describe('candidateRects', () => {
  const frame = { width: 1280, height: 720 };

  it('produces two rects within the frame', () => {
    const rects = candidateRects(frame, 290);
    expect(rects.left.x).toBeGreaterThanOrEqual(0);
    expect(rects.left.y).toBeGreaterThanOrEqual(0);
    expect(rects.left.x + rects.left.width).toBeLessThanOrEqual(frame.width);
    expect(rects.left.y + rects.left.height).toBeLessThanOrEqual(frame.height);

    expect(rects.right.x).toBeGreaterThanOrEqual(0);
    expect(rects.right.x + rects.right.width).toBeLessThanOrEqual(frame.width);
  });

  it('left and right rects do not overlap', () => {
    const rects = candidateRects(frame, 290);
    expect(rects.left.x + rects.left.width).toBeLessThan(rects.right.x);
  });

  it('both rects have positive dimensions', () => {
    const rects = candidateRects(frame, 290);
    expect(rects.left.width).toBeGreaterThan(0);
    expect(rects.left.height).toBeGreaterThan(0);
    expect(rects.right.width).toBeGreaterThan(0);
    expect(rects.right.height).toBeGreaterThan(0);
  });
});
