import { describe, it, expect } from 'vitest';
import { TranscriptWindow } from '../matching/transcript-window.js';

describe('TranscriptWindow', () => {
  it('appendFinal accumulates and trims text', () => {
    const win = new TranscriptWindow(600);
    win.appendFinal('hello');
    const result = win.appendFinal('world');
    expect(result).toBe('hello world');
    expect(win.current()).toBe('hello world');
  });

  it('trims the buffer to maxChars, keeping the tail (most recent text)', () => {
    const win = new TranscriptWindow(10);
    win.appendFinal('0123456789ABCDEF');
    expect(win.current().length).toBe(10);
    expect(win.current()).toBe('6789ABCDEF');
  });

  it('peekWithInterim does not mutate the underlying buffer', () => {
    const win = new TranscriptWindow(600);
    win.appendFinal('hello');
    const peeked = win.peekWithInterim('world in progress');
    expect(peeked).toBe('hello world in progress');
    expect(win.current()).toBe('hello'); // unchanged
  });

  it('peekWithInterim also respects maxChars without mutating state', () => {
    const win = new TranscriptWindow(10);
    win.appendFinal('0123456789');
    const peeked = win.peekWithInterim('ABC');
    expect(peeked.length).toBe(10);
    expect(win.current()).toBe('0123456789');
  });

  it('clear() empties the buffer', () => {
    const win = new TranscriptWindow(600);
    win.appendFinal('hello');
    win.clear();
    expect(win.current()).toBe('');
  });
});
