import { describe, it, expect } from 'vitest';
import { CooldownManager } from '../matching/cooldown.js';

describe('CooldownManager', () => {
  it('allows a card to fire when it has never fired before', () => {
    const cd = new CooldownManager();
    expect(cd.canFire('card-1', 120_000, 1_000)).toBe(true);
  });

  it('blocks refiring the same card within the cooldown window', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    expect(cd.canFire('card-1', 120_000, 1_000 + 60_000)).toBe(false);
  });

  it('allows refiring once the cooldown window has elapsed', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    expect(cd.canFire('card-1', 120_000, 1_000 + 120_000)).toBe(true);
  });

  it('tracks cooldown independently per card', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    expect(cd.canFire('card-2', 120_000, 1_000)).toBe(true);
  });

  it('enforces a single active card: a different card is suppressed until dismissed', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    expect(cd.getActiveCardId()).toBe('card-1');
    expect(cd.hasDifferentActiveCard('card-2')).toBe(true);
    expect(cd.hasDifferentActiveCard('card-1')).toBe(false);
  });

  it('markDismissed clears the active card only if it matches (or no id given)', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    cd.markDismissed('card-2'); // dismissing a different card id is a no-op
    expect(cd.getActiveCardId()).toBe('card-1');

    cd.markDismissed('card-1');
    expect(cd.getActiveCardId()).toBeNull();
    expect(cd.hasDifferentActiveCard('card-2')).toBe(false);
  });

  it('markDismissed() with no cardId clears whatever is active', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    cd.markDismissed();
    expect(cd.getActiveCardId()).toBeNull();
  });

  it('reset() clears both cooldown timestamps and active card state', () => {
    const cd = new CooldownManager();
    cd.markFired('card-1', 1_000);
    cd.reset();
    expect(cd.getActiveCardId()).toBeNull();
    expect(cd.canFire('card-1', 120_000, 1_000)).toBe(true);
  });
});
