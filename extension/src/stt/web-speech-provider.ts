/**
 * Web Speech STTProvider — runs in the content script on meet.google.com.
 *
 * Preferred host per plan §3.5: the Meet page origin already has microphone
 * permission granted for the call, so `SpeechRecognition` here needs no
 * second prompt. See `offscreen/` for the fallback host.
 */
import type { STTError, STTErrorCode, STTProvider } from './provider.js';
import { RestartMachine, type RestartMachineOptions } from './restart-machine.js';
import { INTERIM_DEBOUNCE_MS } from '../shared/constants.js';

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Debounces rapid interim results; finals always call through immediately. */
export class InterimDebouncer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly delayMs: number,
    private readonly emit: (text: string) => void,
  ) {}

  push(text: string): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = setTimeout(() => {
      this.handle = null;
      this.emit(text);
    }, this.delayMs);
  }

  cancel(): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}

export class WebSpeechProvider implements STTProvider {
  readonly id = 'web-speech' as const;
  readonly needsAudioStream = false;

  private recognition: SpeechRecognition | null = null;
  private machine: RestartMachine | null = null;
  private debouncer: InterimDebouncer;
  private partialCb: ((text: string) => void) | null = null;
  private finalCb: ((text: string, confidence: number) => void) | null = null;
  private errorCb: ((err: STTError) => void) | null = null;
  private lang = 'en-US';
  private running = false;

  constructor(private readonly restartOptions: Partial<RestartMachineOptions> = {}) {
    this.debouncer = new InterimDebouncer(INTERIM_DEBOUNCE_MS, (text) => {
      this.partialCb?.(text);
    });
  }

  onPartial(cb: (text: string) => void): void {
    this.partialCb = cb;
  }
  onFinal(cb: (text: string, confidence: number) => void): void {
    this.finalCb = cb;
  }
  onError(cb: (err: STTError) => void): void {
    this.errorCb = cb;
  }

  async start(opts: { lang: string }): Promise<void> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const err: STTError = {
        code: 'unknown',
        message: 'SpeechRecognition is not available in this context',
        fatal: true,
      };
      this.errorCb?.(err);
      throw new Error(err.message);
    }
    this.lang = opts.lang;
    this.running = true;
    this.machine = new RestartMachine(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      {
        onRestart: () => this.spawnRecognition(),
        onWatchdogTimeout: () => {
          this.errorCb?.({ code: 'watchdog-timeout', message: 'no STT events for 10s', fatal: false });
        },
        onFatal: (err) => {
          this.running = false;
          this.errorCb?.(err);
        },
      },
      this.restartOptions,
    );
    this.spawnRecognition();
    this.machine.begin();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.machine?.stop();
    this.debouncer.cancel();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore — recognition may already be stopped
      }
      this.recognition = null;
    }
  }

  private spawnRecognition(): void {
    if (!this.running) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => this.machine?.noteActivity();
    recognition.onsoundstart = () => this.machine?.noteActivity();
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.machine?.noteActivity();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          this.debouncer.cancel();
          this.finalCb?.(alt.transcript.trim(), alt.confidence ?? 0);
        } else {
          this.debouncer.push(alt.transcript.trim());
        }
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = normalizeErrorCode(event.error);
      this.machine?.handleError(code);
    };
    recognition.onend = () => {
      if (!this.running) return;
      this.machine?.handleEnd();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if called while already started; treat as a no-op
      // restart attempt — the watchdog will recover if this stalls.
    }
  }
}

function normalizeErrorCode(raw: string): STTErrorCode {
  switch (raw) {
    case 'no-speech':
    case 'aborted':
    case 'audio-capture':
    case 'not-allowed':
    case 'network':
      return raw;
    default:
      return 'unknown';
  }
}
