/**
 * The STT provider contract (plan §3.5). Corrected interface: no MediaStream
 * parameter for web-speech (it opens its own capture and a MediaStream can't
 * cross extension messaging anyway); `audio` is present only for providers
 * that declare `needsAudioStream: true`.
 */

export type STTErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'not-allowed'
  | 'network'
  | 'watchdog-timeout'
  | 'restart-storm'
  | 'unknown';

export interface STTError {
  code: STTErrorCode;
  message: string;
  /** True if the caller should treat this as fatal and stop retrying. */
  fatal: boolean;
}

export interface STTProvider {
  readonly id: 'web-speech' | 'deepgram' | 'gemini-live';
  /** web-speech: false — it captures its own audio internally. */
  readonly needsAudioStream: boolean;
  start(opts: { lang: string; audio?: MediaStream }): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string, confidence: number) => void): void;
  onError(cb: (err: STTError) => void): void;
}
