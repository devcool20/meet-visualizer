/**
 * Jittered exponential backoff for the extension's reconnect logic (plan
 * §2.5: "Jittered backoff 1s->30s"). This lives server-side purely so it's
 * unit-testable and documented in one place; the actual reconnect loop runs
 * in the extension's service worker and should mirror this exact
 * computation so both sides agree on behaviour during manual testing.
 */
export function computeBackoffMs(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = exp * (0.5 + Math.random() * 0.5); // 50%-100% of the exponential value
  return Math.min(maxMs, Math.round(jitter));
}
