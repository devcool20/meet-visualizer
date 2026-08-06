import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from '../ws/backoff.js';

describe('computeBackoffMs', () => {
  it('starts near the base delay for attempt 0', () => {
    const ms = computeBackoffMs(0, 1000, 30_000);
    expect(ms).toBeGreaterThanOrEqual(500);
    expect(ms).toBeLessThanOrEqual(1000);
  });

  it('grows exponentially with attempt number, capped at maxMs', () => {
    const ms = computeBackoffMs(10, 1000, 30_000);
    expect(ms).toBeLessThanOrEqual(30_000);
    expect(ms).toBeGreaterThanOrEqual(15_000); // 50%-100% jitter of the cap
  });

  it('never exceeds maxMs even for very large attempt numbers', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const ms = computeBackoffMs(attempt, 1000, 30_000);
      expect(ms).toBeLessThanOrEqual(30_000);
      expect(ms).toBeGreaterThan(0);
    }
  });
});
