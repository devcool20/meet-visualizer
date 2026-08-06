import { describe, it, expect } from 'vitest';
import { Spring, CardAnimator, DEFAULT_SPRING } from '@stash/card-core';

describe('Spring', () => {
  it('converges to its target after enough time', () => {
    const spring = new Spring(0);
    spring.setTarget(100);
    let value = 0;
    // 5 seconds of frame-sized steps is far beyond settling time for
    // stiffness 120 / damping 20.
    for (let i = 0; i < 300; i++) {
      value = spring.step(16);
    }
    expect(spring.atRest).toBe(true);
    expect(value).toBeCloseTo(100, 1);
  });

  it('a huge dt does not make it explode — step() clamps to 64ms per call', () => {
    const spring = new Spring(0, DEFAULT_SPRING);
    spring.setTarget(50);
    // Simulate a dropped/stalled frame: a multi-second dt in one call.
    const value = spring.step(10_000);
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value)).toBeLessThan(1000);
  });

  it('snapTo jumps instantly, clears velocity, and re-targets (reduced motion)', () => {
    const spring = new Spring(0);
    spring.setTarget(10);
    spring.step(16);
    spring.snapTo(42);
    // snapTo sets value AND target together, so the spring is immediately at
    // rest at the new value — no residual velocity to fling it elsewhere.
    expect(spring.current).toBe(42);
    expect(spring.atRest).toBe(true);
    spring.setTarget(50);
    expect(spring.atRest).toBe(false);
  });

  it('repeated huge dts over many steps stay bounded and eventually settle', () => {
    const spring = new Spring(0);
    spring.setTarget(1);
    for (let i = 0; i < 50; i++) {
      spring.step(5000);
      expect(Number.isFinite(spring.current)).toBe(true);
      expect(Math.abs(spring.current)).toBeLessThan(100);
    }
    expect(spring.current).toBeCloseTo(1, 1);
  });
});

describe('CardAnimator', () => {
  it('enters, reaches visible, then leaves and reaches gone', () => {
    const animator = new CardAnimator();
    animator.enter();
    expect(animator.currentPhase).toBe('entering');

    let transform = { x: 0, y: 0, scale: 0.94, opacity: 0 };
    for (let i = 0; i < 200 && animator.currentPhase === 'entering'; i++) {
      transform = animator.step(16, 40);
    }
    expect(animator.currentPhase).toBe('visible');
    expect(transform.opacity).toBeCloseTo(1, 1);
    expect(transform.scale).toBeCloseTo(1, 1);

    animator.leave();
    expect(animator.currentPhase).toBe('leaving');
    for (let i = 0; i < 200 && animator.currentPhase === 'leaving'; i++) {
      transform = animator.step(16, 40);
    }
    expect(animator.currentPhase).toBe('gone');
    expect(animator.isFinished).toBe(true);
    expect(transform.opacity).toBeCloseTo(0, 1);
  });

  it('reduced motion does a 150ms opacity fade with no travel or scale change', () => {
    const animator = new CardAnimator({ reducedMotion: true });
    animator.enter();
    const mid = animator.step(75, 40);
    expect(mid.x).toBe(0);
    expect(mid.y).toBe(0);
    expect(mid.scale).toBe(1);
    expect(mid.opacity).toBeCloseTo(0.5, 1);

    const end = animator.step(75, 40);
    expect(end.opacity).toBeCloseTo(1, 2);
    expect(animator.currentPhase).toBe('visible');
  });

  it('never produces non-finite transforms under a huge dt', () => {
    const animator = new CardAnimator();
    animator.enter();
    const transform = animator.step(50_000, 40);
    expect(Number.isFinite(transform.x)).toBe(true);
    expect(Number.isFinite(transform.y)).toBe(true);
    expect(Number.isFinite(transform.scale)).toBe(true);
    expect(Number.isFinite(transform.opacity)).toBe(true);
  });
});
