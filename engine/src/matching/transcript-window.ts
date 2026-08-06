/**
 * Rolling transcript window (plan §2.4).
 *
 * "Finals flushed IMMEDIATELY, interims debounced 400ms and used only for
 * prewarm." This class owns the buffer; the WS layer owns the debounce
 * timer (it needs to schedule/cancel timers per-connection, which belongs
 * with connection lifecycle, not with pure text state).
 */
export class TranscriptWindow {
  private buffer = '';

  constructor(private maxChars: number) {}

  /** Appends a FINAL utterance immediately and trims to maxChars. */
  appendFinal(text: string): string {
    this.buffer = `${this.buffer} ${text}`.trim();
    if (this.buffer.length > this.maxChars) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxChars);
    }
    return this.buffer;
  }

  /**
   * Returns what the window WOULD be if this interim text were appended,
   * without mutating state — interim text drives prewarm only and must
   * never be committed to the window (it may be revised or dropped by the
   * browser's speech recognizer).
   */
  peekWithInterim(text: string): string {
    const combined = `${this.buffer} ${text}`.trim();
    return combined.length > this.maxChars ? combined.slice(combined.length - this.maxChars) : combined;
  }

  current(): string {
    return this.buffer;
  }

  clear(): void {
    this.buffer = '';
  }
}
