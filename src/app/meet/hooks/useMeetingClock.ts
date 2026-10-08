/**
 * Elapsed meeting time.
 *
 * Ticks once a second, but only while the tab is visible: a backgrounded tab
 * would otherwise keep a `setInterval` alive on every participant's machine
 * for the whole call, for a number nobody is looking at. On return the clock
 * catches up from `Date.now()` rather than from an accumulated count, so a
 * slept laptop reports the real elapsed time instead of the time it was awake.
 */
import { useEffect, useState } from 'react';

export function useMeetingClock(startedAt: number): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;

    const tick = () => setElapsed(Date.now() - startedAt);

    if (typeof document !== 'undefined' && document.hidden) {
      tick();
      return;
    }

    const timer = setInterval(tick, 1000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [startedAt]);

  return elapsed;
}

/** `1:04:22` / `4:22`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const base = `${mm}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${base}` : base;
}