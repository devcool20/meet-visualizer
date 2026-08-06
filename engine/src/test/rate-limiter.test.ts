import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../util/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to `limit` calls within the window', () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.tryConsume('k', 0)).toBe(true);
    expect(rl.tryConsume('k', 10)).toBe(true);
    expect(rl.tryConsume('k', 20)).toBe(true);
    expect(rl.tryConsume('k', 30)).toBe(false); // 4th call within the window
  });

  it('tracks separate keys independently', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.tryConsume('a', 0)).toBe(true);
    expect(rl.tryConsume('b', 0)).toBe(true); // different key, own budget
    expect(rl.tryConsume('a', 10)).toBe(false);
  });

  it('slides the window: old timestamps age out and free up budget', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.tryConsume('k', 0)).toBe(true);
    expect(rl.tryConsume('k', 100)).toBe(true);
    expect(rl.tryConsume('k', 200)).toBe(false); // window full
    expect(rl.tryConsume('k', 1001)).toBe(true); // first hit (t=0) has aged out
  });

  it('reset(key) clears that key’s budget', () => {
    const rl = new RateLimiter(1, 1000);
    rl.tryConsume('k', 0);
    expect(rl.tryConsume('k', 10)).toBe(false);
    rl.reset('k');
    expect(rl.tryConsume('k', 20)).toBe(true);
  });

  it('clear() resets every key', () => {
    const rl = new RateLimiter(1, 1000);
    rl.tryConsume('a', 0);
    rl.tryConsume('b', 0);
    rl.clear();
    expect(rl.tryConsume('a', 10)).toBe(true);
    expect(rl.tryConsume('b', 10)).toBe(true);
  });
});
