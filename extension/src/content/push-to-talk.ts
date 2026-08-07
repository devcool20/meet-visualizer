/**
 * Hold-to-talk (push-to-talk) hotkey controller (plan §"Hold-to-talk state
 * machine", §"Chord matching", §"Edge cases").
 *
 * Monitors Alt+Shift+Space chord and manages the Web Speech provider for
 * one utterance per hold. On release, emits the captured text via `onSubmit`
 * which the caller translates into a `capture:generate` frame.
 *
 * Designed to be testable without DOM: all external dependencies (clock,
 * timers, id generation) are injected.
 */

export type CaptureState = 'idle' | 'listening' | 'generating' | 'error';
export type StopReason = 'keyup' | 'blur' | 'hidden' | 'timeout' | 'cancel';

export interface KeyEventLike {
  code: string;
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export interface PushToTalkDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  newCaptureId: () => string;
}

export interface PushToTalkCallbacks {
  onStartCapture(captureId: string): void;
  onStopCapture(captureId: string, reason: StopReason): void;
  /** Emits the `generate` client frame. NEVER the `transcript` frame. */
  onSubmit(captureId: string, text: string, ts: number): void;
  onCancelGeneration(captureId: string): void;
  onStateChange(state: CaptureState, detail: { captureId: string | null; text: string | null; message: string | null }): void;
}

const MAX_HOLD_MS = 30_000;
const FINAL_GRACE_MS = 700;

export class PushToTalkController {
  private deps: PushToTalkDeps;
  private cb: PushToTalkCallbacks;
  private _state: CaptureState = 'idle';
  private held = false;
  private _activeCaptureId: string | null = null;
  private accumulatedText = '';
  private holdTimer: unknown = null;
  private graceTimer: unknown = null;

  // Window event handlers (kept for dispose)
  private boundKeyDown: ((e: Event) => void) | null = null;
  private boundKeyUp: ((e: Event) => void) | null = null;
  private boundBlur: (() => void) | null = null;
  private boundVisibility: (() => void) | null = null;

  constructor(deps: PushToTalkDeps, cb: PushToTalkCallbacks) {
    this.deps = deps;
    this.cb = cb;
  }

  get state(): CaptureState {
    return this._state;
  }

  get activeCaptureId(): string | null {
    return this._activeCaptureId;
  }

  /**
   * Install window-level listeners for the hotkey.
   * Must be called once on mount when in hold-to-talk mode.
   */
  install(): void {
    this.boundKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (this.handleKeyDown({
        code: ke.code, key: ke.key, altKey: ke.altKey, shiftKey: ke.shiftKey,
        ctrlKey: ke.ctrlKey, metaKey: ke.metaKey, repeat: ke.repeat,
      })) {
        ke.preventDefault();
        ke.stopPropagation();
      }
    };
    this.boundKeyUp = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (this.handleKeyUp({
        code: ke.code, key: ke.key, altKey: ke.altKey, shiftKey: ke.shiftKey,
        ctrlKey: ke.ctrlKey, metaKey: ke.metaKey, repeat: ke.repeat,
      })) {
        ke.preventDefault();
        ke.stopPropagation();
      }
    };
    this.boundBlur = () => this.handleBlur();
    this.boundVisibility = () => {
      if (document.visibilityState === 'hidden') this.handleVisibilityHidden();
    };

    // Capture phase so we run before Meet's own listeners
    window.addEventListener('keydown', this.boundKeyDown, { capture: true });
    window.addEventListener('keyup', this.boundKeyUp, { capture: true });
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
  }

  /**
   * Remove all listeners and clear timers. Must be called when switching away
   * from hold-to-talk mode.
   */
  dispose(): void {
    this.cancel();
    if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown, { capture: true });
    if (this.boundKeyUp) window.removeEventListener('keyup', this.boundKeyUp, { capture: true });
    if (this.boundBlur) window.removeEventListener('blur', this.boundBlur);
    if (this.boundVisibility) document.removeEventListener('visibilitychange', this.boundVisibility);
    this.boundKeyDown = null;
    this.boundKeyUp = null;
    this.boundBlur = null;
    this.boundVisibility = null;
    this.clearTimers();
  }

  handleKeyDown(e: KeyEventLike): boolean {
    if (this._state !== 'idle' && this._state !== 'generating') return false;
    if (e.repeat) return false;

    // Match Alt+Shift+Space (no Ctrl, no Meta)
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;
    if (e.code !== 'Space') return false;

    // If we're in a generating state, cancel the in-flight generation
    if (this._state === 'generating' && this._activeCaptureId) {
      this.cb.onCancelGeneration(this._activeCaptureId);
    }

    const captureId = this.deps.newCaptureId();
    this._activeCaptureId = captureId;
    this.held = true;
    this.accumulatedText = '';
    this.setState('listening', 'Mic open');

    // Safety timeout
    this.holdTimer = this.deps.setTimer(() => {
      if (this.held) this.endCapture('timeout');
    }, MAX_HOLD_MS);

    this.cb.onStartCapture(captureId);
    return true;
  }

  handleKeyUp(e: KeyEventLike): boolean {
    if (!this.held) return false;

    // Match: Space keyup, or Alt/Shift keyup (modifier released before Space)
    const isChordKey = e.code === 'Space' || e.key === 'Alt' || e.key === 'Shift';
    if (!isChordKey) return false;

    this.endCapture('keyup');
    return true;
  }

  handleBlur(): void {
    if (this.held) this.endCapture('blur');
  }

  handleVisibilityHidden(): void {
    if (this.held) this.endCapture('hidden');
  }

  /**
   * Feed interim or final transcript from the STT provider.
   */
  noteTranscript(text: string, _isFinal: boolean): void {
    this.accumulatedText = text;
    if (this._state === 'listening') {
      this.cb.onStateChange('listening', {
        captureId: this._activeCaptureId,
        text,
        message: null,
      });
    }
  }

  noteSttError(_err: { code: string; message: string; fatal: boolean }): void {
    if (this._state === 'listening') {
      this.setState('error', 'Speech recognition error');
      this.endCapture('cancel');
    }
  }

  noteGenerating(captureId: string): void {
    if (captureId !== this._activeCaptureId) return; // stale
    this.setState('generating', 'Generating card…');
  }

  noteCardShown(captureId: string | null): void {
    if (captureId && captureId !== this._activeCaptureId) return;
    this.setState('idle', null);
  }

  noteGenerationError(captureId: string, _message: string): void {
    if (captureId !== this._activeCaptureId) return; // stale
    this.setState('error', 'Generation failed');
  }

  /**
   * Cancel a hold in progress (Alt+Shift+D while listening).
   */
  cancel(): void {
    if (this.held) {
      this.endCapture('cancel');
    }
  }

  private endCapture(reason: StopReason): void {
    this.held = false;
    this.clearTimers();

    if (this._activeCaptureId && reason !== 'cancel') {
      // Start grace timer for trailing final result
      this.graceTimer = this.deps.setTimer(() => {
        const text = this.accumulatedText.trim();
        if (text) {
          this.cb.onSubmit(this._activeCaptureId!, text, this.deps.now());
          this.cb.onStopCapture(this._activeCaptureId!, reason);
          this.setState('generating', 'Generating card…');
        } else {
          // Nothing heard
          this.cb.onStopCapture(this._activeCaptureId!, reason);
          this._activeCaptureId = null;
          this.setState('idle', 'Nothing heard');
          // Reset to plain idle after a moment
          this.deps.setTimer(() => {
            if (this._state === 'idle') this.setState('idle', null);
          }, 1500);
        }
      }, FINAL_GRACE_MS);
    } else {
      if (this._activeCaptureId) {
        this.cb.onStopCapture(this._activeCaptureId, reason);
      }
      this._activeCaptureId = null;
      this.setState('idle', null);
    }
  }

  private setState(state: CaptureState, message: string | null): void {
    this._state = state;
    this.cb.onStateChange(state, {
      captureId: this._activeCaptureId,
      text: this.accumulatedText || null,
      message,
    });
  }

  private clearTimers(): void {
    if (this.holdTimer !== null) {
      this.deps.clearTimer(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.graceTimer !== null) {
      this.deps.clearTimer(this.graceTimer);
      this.graceTimer = null;
    }
  }
}
