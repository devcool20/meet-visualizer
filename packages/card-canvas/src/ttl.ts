/**
 * Card TTL auto-dismiss timer (plan §"Card TTL / auto-dismiss", D10).
 *
 * Implements the precedence rule:
 * 1. `spec.ttlMs` — the card's own TTL always wins.
 * 2. otherwise `UserSettings.autoDismissMs` — user's global preference.
 * 3. otherwise `DEFAULT_USER_SETTINGS.autoDismissMs` (12000).
 *
 * The timer lives in the MAIN-world compositor (rAF-driven countdown), not the
 * background worker, because an MV3 service worker can be evicted between
 * events — a `setTimeout` there is not reliable. The countdown also naturally
 * pauses when the tab is backgrounded and rAF stops.
 */
export const TTL_MIN_MS = 1000;
export const DEFAULT_AUTO_DISMISS_MS = 12000;

export interface TtlResolution {
  durationMs: number;
  source: 'spec' | 'settings' | 'default';
}

/**
 * Resolve the effective TTL duration per the precedence rule.
 * Clamps to at least TTL_MIN_MS.
 */
export function resolveTtlMs(
  specTtlMs: number | undefined,
  autoDismissMs: number | undefined,
): TtlResolution {
  if (specTtlMs !== undefined) {
    return { durationMs: Math.max(TTL_MIN_MS, specTtlMs), source: 'spec' };
  }
  if (autoDismissMs !== undefined) {
    return { durationMs: Math.max(TTL_MIN_MS, autoDismissMs), source: 'settings' };
  }
  return { durationMs: DEFAULT_AUTO_DISMISS_MS, source: 'default' };
}

export class CardTtlTimer {
  private _remainingMs = 0;
  private _running = false;
  private _fired = false;

  get isRunning(): boolean {
    return this._running;
  }

  get remainingMs(): number {
    return this._remainingMs;
  }

  /**
   * Start or replace the countdown with a new duration.
   * Discards any existing countdown outright (replace-not-stack semantics).
   */
  start(durationMs: number): void {
    this._remainingMs = Math.max(TTL_MIN_MS, durationMs);
    this._running = true;
    this._fired = false;
  }

  /** Clear the timer. After clearing, `tick` will never return true. */
  clear(): void {
    this._running = false;
    this._remainingMs = 0;
  }

  /**
   * Advance the countdown by a frame delta.
   * Returns `true` exactly once — on the frame the timer expires.
   * Returns `false` on all subsequent calls (even if called with positive dt),
   * and when the timer is not running or was cleared.
   */
  tick(dtMs: number): boolean {
    if (!this._running) return false;
    if (this._fired) return false;

    this._remainingMs -= dtMs;
    if (this._remainingMs <= 0) {
      this._remainingMs = 0;
      this._running = false;
      this._fired = true;
      return true;
    }

    return false;
  }
}
