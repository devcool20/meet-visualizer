/**
 * Microphone level, for the pre-join meter and the speaking indicator.
 *
 * This is the one place where remote audio is *analysed*: `measureLevels` taps
 * each remote stream through an `AnalyserNode` and reports a scalar. Nothing is
 * recorded, buffered, or sent — the numbers never leave the browser, and they
 * exist only to decide who is talking and whether the mic works.
 *
 * Local metering is separate on purpose. The self meter is what tells a
 * presenter their mic is dead *before* they join; the remote meters are what
 * drive active-speaker layout.
 */
import { useEffect, useRef, useState } from 'react';

export interface UseAudioLevelResult {
  /** 0–1, normalised against a rolling noise floor. */
  level: number;
  /** True while above the speaking threshold. */
  speaking: boolean;
}

/** Smoothed level above this counts as speaking. */
const SPEAKING_THRESHOLD = 0.14;

/** Frames per second the analyser is polled. Cheap enough for a rAF budget. */
const POLL_MS = 100;

/**
 * RMS level of one stream's audio, 0–1.
 *
 * A running noise floor is subtracted so a laptop fan in a quiet room does not
 * pin the meter at "speaking" forever. Without this, every participant is
 * permanently the active speaker and the grid never settles.
 */
export function createLevelProbe(stream: MediaStream): { read: () => number; dispose: () => void } | null {
  if (typeof AudioContext === 'undefined') return null;
  if (stream.getAudioTracks().length === 0) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.7;
  let source: MediaStreamAudioSourceNode;
  try {
    source = ctx.createMediaStreamSource(stream);
  } catch {
    void ctx.close();
    return null;
  }
  source.connect(analyser);
  // Deliberately not connected to `ctx.destination`: analysing must not create
  // an audio path back into the speakers.

  const buffer = new Uint8Array(analyser.frequencyBinCount);
  let floor = 0.01;

  return {
    read(): number {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const centred = (buffer[i] - 128) / 128;
        sum += centred * centred;
      }
      const rms = Math.sqrt(sum / buffer.length);
      // Track the floor fast when it drops, slowly when it rises.
      floor = rms < floor ? rms : floor + (rms - floor) * 0.05;
      const normalised = Math.max(0, Math.min(1, (rms - floor) * 6));
      return normalised;
    },
    dispose() {
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        /* already disconnected */
      }
      void ctx.close().catch(() => undefined);
    },
  };
}

/** Polls a stream's level on an interval and reports a smoothed value. */
export function useAudioLevel(stream: MediaStream | null, options: { enabled?: boolean } = {}): UseAudioLevelResult {
  const enabled = options.enabled ?? true;
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);

  useEffect(() => {
    if (!enabled || !stream) {
      setLevel(0);
      return;
    }
    const probe = createLevelProbe(stream);
    if (!probe) {
      setLevel(0);
      return;
    }
    const timer = setInterval(() => {
      levelRef.current = probe.read();
      setLevel(levelRef.current);
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      probe.dispose();
      setLevel(0);
    };
  }, [stream, enabled]);

  return { level, speaking: level > SPEAKING_THRESHOLD };
}

/** Metered level for a whole map of peers. */
export function useRemoteLevels(streams: Record<string, MediaStream | null | undefined>): Record<string, UseAudioLevelResult> {
  const [levels, setLevels] = useState<Record<string, UseAudioLevelResult>>({});

  useEffect(() => {
    const live = new Map<string, NonNullable<ReturnType<typeof createLevelProbe>>>();
    for (const [id, stream] of Object.entries(streams)) {
      if (!stream) continue;
      const probe = createLevelProbe(stream);
      if (probe) live.set(id, probe);
    }

    if (live.size === 0) {
      setLevels({});
      return;
    }

    const smoothed: Record<string, number> = {};
    const timer = setInterval(() => {
      const next: Record<string, UseAudioLevelResult> = {};
      for (const [id, probe] of live) {
        const raw = probe.read();
        // Rise fast, fall slow: a speaking indicator that flickers is worse
        // than one that lingers half a second.
        smoothed[id] = smoothed[id] === undefined ? raw : smoothed[id] * 0.7 + raw * 0.3;
        next[id] = { level: smoothed[id], speaking: smoothed[id] > SPEAKING_THRESHOLD };
      }
      setLevels(next);
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      for (const probe of live.values()) probe.dispose();
    };
  }, [streams]);

  return levels;
}