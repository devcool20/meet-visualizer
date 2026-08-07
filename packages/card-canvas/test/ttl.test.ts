import { describe, it, expect } from 'vitest';
import { CardTtlTimer, resolveTtlMs, TTL_MIN_MS, DEFAULT_AUTO_DISMISS_MS } from '../src/ttl.js';

describe('resolveTtlMs', () => {
  it('spec.ttlMs takes precedence over settings', () => {
    const r = resolveTtlMs(8000, 12000);
    expect(r.durationMs).toBe(8000);
    expect(r.source).toBe('spec');
  });

  it('falls back to settings when spec has no ttlMs', () => {
    const r = resolveTtlMs(undefined, 20000);
    expect(r.durationMs).toBe(20000);
    expect(r.source).toBe('settings');
  });

  it('falls back to default when neither spec nor settings provide a value', () => {
    const r = resolveTtlMs(undefined, undefined);
    expect(r.durationMs).toBe(DEFAULT_AUTO_DISMISS_MS);
    expect(r.source).toBe('default');
  });

  it('clamps values below TTL_MIN_MS up to the minimum', () => {
    const r = resolveTtlMs(500, undefined);
    expect(r.durationMs).toBe(TTL_MIN_MS);
    expect(r.source).toBe('spec');
  });
});

describe('CardTtlTimer', () => {
  it('is not running initially', () => {
    const timer = new CardTtlTimer();
    expect(timer.isRunning).toBe(false);
    expect(timer.remainingMs).toBe(0);
  });

  it('tick returns true exactly once at expiry', () => {
    const timer = new CardTtlTimer();
    timer.start(1000);

    expect(timer.isRunning).toBe(true);
    expect(timer.remainingMs).toBe(1000);

    // Advance 500ms — not expired yet
    expect(timer.tick(500)).toBe(false);
    expect(timer.remainingMs).toBe(500);

    // Advance 500ms — exactly at expiry
    expect(timer.tick(500)).toBe(true);
    expect(timer.isRunning).toBe(false);

    // Subsequent ticks return false
    expect(timer.tick(100)).toBe(false);
    expect(timer.tick(0)).toBe(false);
  });

  it('start replaces an existing countdown (not stack)', () => {
    const timer = new CardTtlTimer();
    timer.start(5000);
    timer.tick(2000); // 3000 remaining

    timer.start(2000); // replace with shorter
    expect(timer.remainingMs).toBe(2000);

    timer.tick(2000); // expires now
    expect(timer.tick(100)).toBe(false); // already fired
  });

  it('clear prevents tick from ever returning true', () => {
    const timer = new CardTtlTimer();
    timer.start(1000);
    timer.tick(500);
    timer.clear();

    expect(timer.isRunning).toBe(false);
    expect(timer.remainingMs).toBe(0);

    // Even if we keep calling tick past the original expiry
    expect(timer.tick(600)).toBe(false);
    expect(timer.tick(1000)).toBe(false);
  });

  it('fires at exactly the right time with simple values', () => {
    const timer = new CardTtlTimer();
    timer.start(2000);

    expect(timer.tick(1000)).toBe(false);
    expect(timer.tick(1000)).toBe(true);  // exactly at expiry
    expect(timer.tick(1)).toBe(false);    // already fired
  });

  it('over-ticking (dt > remaining) still fires exactly once', () => {
    const timer = new CardTtlTimer();
    timer.start(2000);
    expect(timer.tick(3000)).toBe(true);  // over-tick, but fires
    expect(timer.tick(0)).toBe(false);    // second call returns false
  });
});
