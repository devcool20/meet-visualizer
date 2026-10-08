/**
 * Device-side caption broadcast.
 *
 * The recogniser is fully faked here — the Web Speech API is not available in
 * jsdom, and stubbing its lifecycle is exactly the point. What is being pinned
 * is the hook's *behaviour around* it, which is where the real bugs live:
 *
 *  - finals are forwarded once, interims are not double-counted
 *  - the recogniser restarts itself, because the real one always ends after a
 *    pause and a room whose captions stopped ten minutes ago is a broken room
 *  - an error backs off instead of becoming a hot restart loop
 *  - a clean teardown does not leave a timer that resurrects the recogniser
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import {
  captionsSupported,
  useCaptionBroadcast,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from './useCaptionBroadcast';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * Every constructed recogniser, reset per test. The list is static so the hook's
 * `new ctor()` lands in a place a test can reach; resetting it in `beforeEach`
 * is what makes `current()` mean "the one this test started".
 */
class FakeInstance implements SpeechRecognitionLike {
  static instances: FakeInstance[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  /** True between `start()` and the recogniser ending itself. */
  active = false;

  constructor() {
    FakeInstance.instances.push(this);
  }
  start(): void {
    this.started++;
    this.active = true;
  }
  stop(): void {
    this.stopped++;
    this.active = false;
  }
  abort(): void {
    this.aborted++;
    this.active = false;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }

  emit(...results: { text: string; final: boolean }[]): void {
    this.onresult?.({
      results: results.map((r) => ({ isFinal: r.final, 0: { transcript: r.text, confidence: 1 } })),
      length: results.length,
    } as unknown as SpeechRecognitionResultEventLike);
  }

  fail(error: string): void {
    this.onerror?.({ error });
  }

  ended(): void {
    // The real API flips itself off before firing this, and the hook must not
    // treat an already-dead recogniser as still holding the microphone.
    this.active = false;
    this.onend?.();
  }
}

const current = (): FakeInstance => {
  const last = FakeInstance.instances[FakeInstance.instances.length - 1];
  if (!last) throw new Error('no recogniser was constructed');
  return last;
};

beforeEach(() => {
  FakeInstance.instances = [];
  // React 18's `act()` warns unless the environment marks itself explicitly.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

function render(enabled: boolean, onCaption: (t: string, f: boolean) => void, onError?: (m: string) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const Probe = () => {
    useCaptionBroadcast({ enabled, onCaption, onError, RecognitionCtor: FakeInstance as never });
    return null;
  };
  act(() => root!.render(createElement(Probe)));
}

describe('captionsSupported', () => {
  it('reports false when there is no recogniser at all', () => {
    const original = (globalThis as Record<string, unknown>).SpeechRecognition;
    delete (globalThis as Record<string, unknown>).SpeechRecognition;
    delete (globalThis as Record<string, unknown>).webkitSpeechRecognition;
    expect(captionsSupported()).toBe(false);
    if (original) (globalThis as Record<string, unknown>).SpeechRecognition = original;
  });

  it('reports true when one is injectable', () => {
    expect(captionsSupported(FakeInstance as never)).toBe(true);
  });
});

describe('useCaptionBroadcast', () => {
  it('starts nothing while disabled', () => {
    const onCaption = vi.fn();
    render(false, onCaption);
    expect(FakeInstance.instances).toHaveLength(0);
  });

  it('configures a continuous recogniser with interim results', () => {
    render(true, vi.fn());
    expect(FakeInstance.instances).toHaveLength(1);
    const rec = current();
    // A push-to-talk configuration would capture one phrase and stop, which is
    // not what a caption track is.
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.started).toBe(1);
  });

  it('forwards finals and interims with the right flag', () => {
    const onCaption = vi.fn();
    render(true, onCaption);
    const rec = current();

    act(() => rec.emit({ text: 'our revenue', final: false }));
    expect(onCaption).toHaveBeenCalledWith('our revenue', false);

    act(() => rec.emit({ text: 'our revenue is up', final: true }));
    expect(onCaption).toHaveBeenCalledWith('our revenue is up', true);
  });

  it('ignores lines too short to be speech', () => {
    const onCaption = vi.fn();
    render(true, onCaption);
    const rec = current();
    // Breaths and single characters would otherwise flood the transcript.
    act(() => rec.emit({ text: ' ', final: true }));
    act(() => rec.emit({ text: 'a', final: true }));
    expect(onCaption).not.toHaveBeenCalled();
  });

  it('treats no-speech and aborted as ordinary ends, not failures', () => {
    const onError = vi.fn();
    render(true, vi.fn(), onError);
    const rec = current();
    act(() => rec.fail('no-speech'));
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a hard permission failure once and stops', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    render(true, vi.fn(), onError);
    const rec = current();
    act(() => rec.fail('not-allowed'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/permission/i);

    // And it must not resurrect itself afterwards.
    act(() => rec.ended());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(FakeInstance.instances).toHaveLength(1);
  });

  it('restarts after the recogniser ends on its own', () => {
    vi.useFakeTimers();
    const onCaption = vi.fn();
    render(true, onCaption);
    expect(FakeInstance.instances).toHaveLength(1);

    // The real API always ends eventually. Without a restart the room is left
    // with a transcript that stopped minutes ago.
    act(() => current().ended());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(FakeInstance.instances.length).toBeGreaterThan(1);

    const second = current();
    act(() => second.emit({ text: 'still listening', final: true }));
    expect(onCaption).toHaveBeenCalledWith('still listening', true);
  });

  it('backs off before restarting after an error, rather than hot-looping', () => {
    vi.useFakeTimers();
    render(true, vi.fn());
    const rec = current();

    act(() => rec.fail('network'));
    // Immediately after the failure there must be no new instance.
    expect(FakeInstance.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    // After the backoff it tries again.
    expect(FakeInstance.instances.length).toBeGreaterThan(1);
  });

  it('does not start a second recogniser while one is already running', () => {
    vi.useFakeTimers();
    render(true, vi.fn());
    const rec = current();
    // An `onend` firing twice, or a race between a manual start and the
    // scheduled restart, must not leave two recognisers competing for one mic.
    act(() => rec.ended());
    act(() => rec.ended());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Exactly one recogniser may hold the microphone at a time.
    expect(FakeInstance.instances.filter((r) => r.active)).toHaveLength(1);
  });

  it('tears down cleanly and leaves nothing that can restart it', () => {
    vi.useFakeTimers();
    render(true, vi.fn());
    const rec = current();

    act(() => root!.unmount());
    root = null;
    expect(rec.aborted + rec.stopped).toBe(1);

    const before = FakeInstance.instances.length;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // A stray timer here would transcribe into a room this client has left.
    expect(FakeInstance.instances).toHaveLength(before);
  });
});