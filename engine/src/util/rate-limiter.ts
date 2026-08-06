/**
 * Simple fixed-window-free token style rate limiter (sliding window via
 * timestamp array). Used for Tier 3 (6/min/user, plan §2.4) and the WS
 * message rate limit (20/s, plan §2.5). Deliberately in-memory: rate limits
 * are per-connection or per-process and don't need to survive a restart.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the call is allowed (and records it), false if rate limited. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }
    const cutoff = now - this.windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
    if (timestamps.length >= this.limit) return false;
    timestamps.push(now);
    return true;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  clear(): void {
    this.hits.clear();
  }
}
