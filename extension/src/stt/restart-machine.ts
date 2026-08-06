/**
 * Restart state machine for streaming STT providers (plan §3.5 failure table).
 *
 * Pure logic, no browser API — driven entirely through injected timer/clock
 * functions so it is unit-testable without `SpeechRecognition` or a browser.
 *
 * Failure table this implements:
 *   - auto-stop after ~5s silence -> `onend` fires -> restart
 *   - watchdog: no recognition event of ANY kind for 10s -> forced restart
 *   - restart storm: >5 restarts within a rolling 30s window -> stop, fatal
 *   - `no-speech` / `aborted` errors are normal -> silent restart
 *   - `not-allowed` / `audio-capture` are fatal -> stop, no restart
 */
import type { STTError, STTErrorCode } from './provider.js';

export interface RestartMachineDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface RestartMachineCallbacks {
  /** Perform the actual `recognition.start()` call. */
  onRestart: (reason: string) => void;
  /** Fired the instant the watchdog fires, before the forced restart. */
  onWatchdogTimeout: () => void;
  /** Storm threshold exceeded or a fatal error — stop retrying entirely. */
  onFatal: (err: STTError) => void;
}

export interface RestartMachineOptions {
  windowMs: number;
  maxRestarts: number;
  watchdogMs: number;
}

export const DEFAULT_RESTART_OPTIONS: RestartMachineOptions = {
  windowMs: 30_000,
  maxRestarts: 5,
  watchdogMs: 10_000,
};

export class RestartMachine {
  private restartTimestamps: number[] = [];
  private watchdogHandle: unknown = null;
  private stopped = false;
  private readonly opts: RestartMachineOptions;

  constructor(
    private readonly deps: RestartMachineDeps,
    private readonly cb: RestartMachineCallbacks,
    opts: Partial<RestartMachineOptions> = {},
  ) {
    this.opts = { ...DEFAULT_RESTART_OPTIONS, ...opts };
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  get recentRestartCount(): number {
    return this.restartTimestamps.length;
  }

  /** Call on recognition 'start', 'result', 'soundstart', etc. Resets the watchdog. */
  noteActivity(): void {
    this.armWatchdog();
  }

  /** Call once after the provider begins listening, to arm the first watchdog. */
  begin(): void {
    this.stopped = false;
    this.armWatchdog();
  }

  /** Call on the recognition 'end' event — normal after ~5s of silence. */
  handleEnd(): boolean {
    return this.requestRestart('end');
  }

  /** Call on the recognition 'error' event. Returns true if a restart was scheduled. */
  handleError(code: STTErrorCode): boolean {
    if (code === 'not-allowed' || code === 'audio-capture') {
      this.stop();
      this.cb.onFatal({ code, message: `fatal STT error: ${code}`, fatal: true });
      return false;
    }
    // no-speech / aborted are documented-normal; network/unknown still retried
    // but count toward the storm budget same as any other restart.
    return this.requestRestart(code);
  }

  private requestRestart(reason: string): boolean {
    if (this.stopped) return false;
    const t = this.deps.now();
    this.restartTimestamps = this.restartTimestamps.filter((ts) => t - ts < this.opts.windowMs);
    if (this.restartTimestamps.length >= this.opts.maxRestarts) {
      this.stop();
      this.cb.onFatal({
        code: 'restart-storm',
        message: `>${this.opts.maxRestarts} restarts within ${this.opts.windowMs}ms`,
        fatal: true,
      });
      return false;
    }
    this.restartTimestamps.push(t);
    this.cb.onRestart(reason);
    this.armWatchdog();
    return true;
  }

  private armWatchdog(): void {
    this.disarmWatchdog();
    if (this.stopped) return;
    this.watchdogHandle = this.deps.setTimer(() => {
      this.cb.onWatchdogTimeout();
      this.requestRestart('watchdog-timeout');
    }, this.opts.watchdogMs);
  }

  private disarmWatchdog(): void {
    if (this.watchdogHandle !== null) {
      this.deps.clearTimer(this.watchdogHandle);
      this.watchdogHandle = null;
    }
  }

  stop(): void {
    this.stopped = true;
    this.disarmWatchdog();
  }
}
