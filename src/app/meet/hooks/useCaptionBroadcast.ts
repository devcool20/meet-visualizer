/**
 * Device-side captions for a meeting.
 *
 * The Web Speech API has no way to transcribe an arbitrary `MediaStream` — it
 * only ever listens to the default input, i.e. the speaker's own microphone.
 * That is exactly what we want here, and it produces the right privacy story:
 * **each participant transcribes their own voice locally and relays the text as
 * data over the signalling socket.** No audio is sent to an ASR provider, and
 * the room's audio stream is never read.
 *
 * The trade-off is real and stated in the UI: captions only exist for people
 * whose browser implements the recogniser, and quality varies by engine.
 *
 * Two details that matter in a live call:
 *  - the recogniser ends itself after a pause, so it is restarted while the
 *    feature is on. Without that it captures one sentence and goes quiet for
 *    the rest of the meeting.
 *  - `continuous` plus a restart-on-error backoff, because the API throws
 *    `InvalidStateError` when started while already running, which is easy to
 *    hit when an `onend` races a manual start.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface UseCaptionBroadcastOptions {
  /** Runs a continuous recogniser while true. */
  enabled: boolean;
  /** Interim and final lines for the room. */
  onCaption: (text: string, final: boolean) => void;
  /** Called on a recogniser error that is not a normal end-of-speech. */
  onError?: (message: string) => void;
  /** Injectable for tests. */
  RecognitionCtor?: SpeechRecognitionCtor;
  lang?: string;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The slice of the Web Speech API this hook uses, declared locally. */
export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionResultEventLike extends Event {
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } };
  };
}

/** Cooldown after an error, so a hard failure does not become a busy loop. */
const ERROR_BACKOFF_MS = 2500;

/** Lines shorter than this are breaths, not speech. */
const MIN_LINE_CHARS = 2;

function defaultRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : undefined;
}

/** Reports whether this browser can transcribe locally at all. */
export function captionsSupported(ctor?: SpeechRecognitionCtor): boolean {
  return !!(ctor ?? defaultRecognition());
}

export function useCaptionBroadcast(opts: UseCaptionBroadcastOptions): void {
  const ctor = opts.RecognitionCtor ?? defaultRecognition();
  const onCaptionRef = useRef(opts.onCaption);
  const onErrorRef = useRef(opts.onError);
  onCaptionRef.current = opts.onCaption;
  onErrorRef.current = opts.onError;

  const runningRef = useRef(false);
  const stoppedRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const clearRestart = useCallback(() => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!opts.enabled || !ctor) return;
    stoppedRef.current = false;
    const lang = opts.lang ?? 'en-US';

    const start = () => {
      if (stoppedRef.current || runningRef.current) return;
      let rec: SpeechRecognitionLike;
      try {
        rec = new ctor();
      } catch (err) {
        onErrorRef.current?.(err instanceof Error ? err.message : 'Speech recognition failed to start');
        return;
      }
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;

      rec.onresult = (event) => {
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text.length >= MIN_LINE_CHARS) onCaptionRef.current(text, true);
          } else {
            interim += result[0].transcript;
          }
        }
        const partial = interim.trim();
        if (partial.length >= MIN_LINE_CHARS) onCaptionRef.current(partial, false);
      };

      rec.onerror = (event) => {
        // `no-speech` and `aborted` are ordinary outcomes of a continuous
        // session pausing; only real failures are surfaced.
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          onErrorRef.current?.('Microphone permission was denied for captions.');
          stoppedRef.current = true;
          return;
        }
        // Back off rather than restarting into the same error immediately.
        runningRef.current = false;
        clearRestart();
        restartTimerRef.current = setTimeout(start, ERROR_BACKOFF_MS);
      };

      rec.onend = () => {
        runningRef.current = false;
        recognitionRef.current = null;
        if (stoppedRef.current) return;
        // The recogniser always ends itself eventually. Restart so the room is
        // not left with a transcript that stopped ten minutes ago.
        clearRestart();
        restartTimerRef.current = setTimeout(start, 250);
      };

      try {
        rec.start();
        runningRef.current = true;
        recognitionRef.current = rec;
      } catch {
        // `InvalidStateError` here means a start raced the previous one's end.
        runningRef.current = false;
        clearRestart();
        restartTimerRef.current = setTimeout(start, 250);
      }
    };

    start();

    return () => {
      stoppedRef.current = true;
      clearRestart();
      runningRef.current = false;
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (!rec) return;
      // Detach first: `onend` fires on abort and would otherwise schedule a
      // restart against a recogniser we are deliberately shutting down.
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try {
        // NOT `rec.abort?.() ?? rec.stop()`: `abort()` returns undefined, so `??`
        // would call `stop()` as well and stop the recogniser twice.
        if (rec.abort) rec.abort();
        else rec.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [opts.enabled, ctor, opts.lang, clearRestart]);
}