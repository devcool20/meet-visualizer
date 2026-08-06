/**
 * STT restart state machine tests (plan §3.5 failure table, §5.2).
 *
 * Uses a fake clock/timer so every row of the failure table is deterministic:
 *   - auto-stop after ~5s silence -> onend -> restart
 *   - watchdog: no event for 10s -> forced restart
 *   - restart storm: >5 restarts in 30s -> stop, fatal
 *   - no-speech / aborted -> normal, silent restart
 *   - not-allowed / audio-capture -> fatal, no restart
 */
import { describe, expect, it, vi } from 'vitest';
import { RestartMachine, type RestartMachineDeps } from '../src/stt/restart-machine';

function makeFakeDeps() {
  let now = 0;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;

  const deps: RestartMachineDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, at: now + ms, handle });
      return handle;
    },
    clearTimer: (handle) => {
      const idx = timers.findIndex((t) => t.handle === handle);
      if (idx >= 0) timers.splice(idx, 1);
    },
  };

  function advance(ms: number): void {
    const target = now + ms;
    // Fire timers in chronological order, allowing new timers scheduled
    // during firing to also run if they land within the advanced window.
    while (true) {
      const due = timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      const idx = timers.indexOf(due);
      if (idx >= 0) timers.splice(idx, 1);
      due.fn();
    }
    now = target;
  }

  return { deps, advance, pendingTimerCount: () => timers.length };
}

describe('RestartMachine', () => {
  it('restarts silently on end (auto-stop after ~5s silence)', () => {
    const { deps } = makeFakeDeps();
    const onRestart = vi.fn();
    const onFatal = vi.fn();
    const machine = new RestartMachine(deps, { onRestart, onWatchdogTimeout: vi.fn(), onFatal });
    machine.begin();

    const restarted = machine.handleEnd();

    expect(restarted).toBe(true);
    expect(onRestart).toHaveBeenCalledWith('end');
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('forces a restart via the watchdog after 10s with no activity', () => {
    const { deps, advance } = makeFakeDeps();
    const onWatchdogTimeout = vi.fn();
    const onRestart = vi.fn();
    const machine = new RestartMachine(deps, { onRestart, onWatchdogTimeout, onFatal: vi.fn() });
    machine.begin();

    advance(10_000);

    expect(onWatchdogTimeout).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledWith('watchdog-timeout');
  });

  it('noteActivity re-arms the watchdog so it does not fire while events are flowing', () => {
    const { deps, advance } = makeFakeDeps();
    const onWatchdogTimeout = vi.fn();
    const machine = new RestartMachine(deps, { onRestart: vi.fn(), onWatchdogTimeout, onFatal: vi.fn() });
    machine.begin();

    advance(6_000);
    machine.noteActivity(); // e.g. a 'result' event arrived
    advance(6_000); // total 12s elapsed, but only 6s since the last activity

    expect(onWatchdogTimeout).not.toHaveBeenCalled();
  });

  it('treats no-speech and aborted as normal — silent restart, no fatal', () => {
    const { deps } = makeFakeDeps();
    const onRestart = vi.fn();
    const onFatal = vi.fn();
    const machine = new RestartMachine(deps, { onRestart, onWatchdogTimeout: vi.fn(), onFatal });
    machine.begin();

    expect(machine.handleError('no-speech')).toBe(true);
    expect(machine.handleError('aborted')).toBe(true);
    expect(onFatal).not.toHaveBeenCalled();
    expect(onRestart).toHaveBeenCalledTimes(2);
  });

  it('stops immediately and fatally on not-allowed', () => {
    const { deps } = makeFakeDeps();
    const onFatal = vi.fn();
    const machine = new RestartMachine(deps, { onRestart: vi.fn(), onWatchdogTimeout: vi.fn(), onFatal });
    machine.begin();

    const restarted = machine.handleError('not-allowed');

    expect(restarted).toBe(false);
    expect(machine.isStopped).toBe(true);
    expect(onFatal).toHaveBeenCalledWith(expect.objectContaining({ code: 'not-allowed', fatal: true }));
  });

  it('stops immediately and fatally on audio-capture', () => {
    const { deps } = makeFakeDeps();
    const onFatal = vi.fn();
    const machine = new RestartMachine(deps, { onRestart: vi.fn(), onWatchdogTimeout: vi.fn(), onFatal });
    machine.begin();

    machine.handleError('audio-capture');

    expect(machine.isStopped).toBe(true);
    expect(onFatal).toHaveBeenCalledWith(expect.objectContaining({ code: 'audio-capture', fatal: true }));
  });

  it('declares a restart storm after more than 5 restarts within 30s, then stops', () => {
    const { deps, advance } = makeFakeDeps();
    const onFatal = vi.fn();
    const onRestart = vi.fn();
    const machine = new RestartMachine(deps, { onRestart, onWatchdogTimeout: vi.fn(), onFatal });
    machine.begin();

    for (let i = 0; i < 5; i++) {
      expect(machine.handleEnd()).toBe(true);
      advance(1000);
    }
    // The 6th restart within the 30s window should trip the storm guard.
    const sixthOk = machine.handleEnd();

    expect(sixthOk).toBe(false);
    expect(machine.isStopped).toBe(true);
    expect(onFatal).toHaveBeenCalledWith(expect.objectContaining({ code: 'restart-storm', fatal: true }));
    expect(onRestart).toHaveBeenCalledTimes(5);
  });

  it('does not count restarts outside the rolling 30s window toward the storm', () => {
    const { deps, advance } = makeFakeDeps();
    const onFatal = vi.fn();
    // A very large watchdogMs isolates this test to ONLY the restarts we
    // trigger explicitly via handleEnd — otherwise the watchdog itself would
    // fire during the 31s advance and add an unplanned 6th restart.
    const machine = new RestartMachine(
      deps,
      { onRestart: vi.fn(), onWatchdogTimeout: vi.fn(), onFatal },
      { windowMs: 30_000, maxRestarts: 5, watchdogMs: 1_000_000 },
    );
    machine.begin();

    for (let i = 0; i < 5; i++) {
      machine.handleEnd();
      advance(1000);
    }
    // Let the whole window elapse so all 5 timestamps age out.
    advance(31_000);

    const ok = machine.handleEnd();

    expect(ok).toBe(true);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('stop() disarms the watchdog and prevents further restarts', () => {
    const { deps, advance } = makeFakeDeps();
    const onWatchdogTimeout = vi.fn();
    const onRestart = vi.fn();
    const machine = new RestartMachine(deps, { onRestart, onWatchdogTimeout, onFatal: vi.fn() });
    machine.begin();

    machine.stop();
    advance(20_000);

    expect(onWatchdogTimeout).not.toHaveBeenCalled();
    expect(machine.handleEnd()).toBe(false);
    expect(onRestart).not.toHaveBeenCalled();
  });
});
