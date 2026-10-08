/**
 * Local microphone and camera, with the same three-tier permission fallback
 * the rehearsal page uses.
 *
 * Order matters here. A presenter on a locked-down corporate machine may have
 * a working camera but no microphone, a microphone but no camera, or neither.
 * Failing the whole call because one device is missing would be the single most
 * common way this platform breaks, so each constraint is attempted on its own
 * and the result is reported precisely enough for the UI to explain what is
 * missing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type MediaStatus = 'idle' | 'requesting' | 'ready' | 'partial' | 'denied' | 'unavailable';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface UseLocalMediaResult {
  stream: MediaStream | null;
  cameraTrack: MediaStreamTrack | null;
  micTrack: MediaStreamTrack | null;
  status: MediaStatus;
  /** Human-readable reason when `status` is `denied` / `partial` / `unavailable`. */
  message: string | null;
  micOn: boolean;
  camOn: boolean;
  cameras: MediaDeviceOption[];
  mics: MediaDeviceOption[];
  activeCameraId: string | null;
  activeMicId: string | null;
  setMicOn: (on: boolean) => void;
  setCamOn: (on: boolean) => void;
  selectCamera: (deviceId: string) => void;
  selectMic: (deviceId: string) => void;
  retry: () => void;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
};

function available(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Camera-only or mic-only are both acceptable outcomes; both together is best. */
async function openStream(cameraId?: string | null, micId?: string | null): Promise<MediaStream> {
  if (!available()) throw new MediaUnavailableError();

  const attempts: MediaStreamConstraints[] = [
    { video: cameraId ? { deviceId: { exact: cameraId } } : VIDEO_CONSTRAINTS, audio: micId ? { deviceId: { exact: micId } } : true },
    { video: cameraId ? { deviceId: { exact: cameraId } } : VIDEO_CONSTRAINTS, audio: false },
    { audio: micId ? { deviceId: { exact: micId } } : true, video: false },
  ];

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new MediaUnavailableError();
}

class MediaUnavailableError extends Error {
  constructor() {
    super('This browser cannot access your camera or microphone.');
    this.name = 'MediaUnavailableError';
  }
}

function describeError(err: unknown): string {
  if (err instanceof MediaUnavailableError) return err.message;
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Your browser blocked camera and microphone access. Allow it in the address bar, then rejoin.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera or microphone was found on this device.';
      case 'NotReadableError':
        return 'Another app is using your camera. Close it and rejoin.';
      default:
        return `Could not open your devices (${err.name}).`;
    }
  }
  return 'Could not open your camera or microphone.';
}

/** Best-effort label; browsers withhold labels until permission is granted. */
function friendlyLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) return device.label.replace(/\s*\(.*?\)\s*$/, '').trim() || `Camera ${index + 1}`;
  return `${device.kind === 'videoinput' ? 'Camera' : 'Microphone'} ${index + 1}`;
}

export function useLocalMedia(options: { enabled?: boolean } = {}): UseLocalMediaResult {
  const enabled = options.enabled ?? true;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [micOn, setMicOnState] = useState(true);
  const [camOn, setCamOnState] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [activeMicId, setActiveMicId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Refs so switching devices does not need the whole hook to re-render first.
  const currentStreamRef = useRef<MediaStream | null>(null);
  const pendingRef = useRef<{ cameraId: string | null; micId: string | null }>({ cameraId: null, micId: null });

  const stopStream = useCallback((s: MediaStream | null) => {
    if (!s) return;
    for (const track of s.getTracks()) track.stop();
  }, []);

  const adopt = useCallback(
    (next: MediaStream) => {
      const previous = currentStreamRef.current;
      currentStreamRef.current = next;
      setStream(next);

      const cam = next.getVideoTracks()[0] ?? null;
      const mic = next.getAudioTracks()[0] ?? null;
      setActiveCameraId(cam?.getSettings?.().deviceId ?? null);
      setActiveMicId(mic?.getSettings?.().deviceId ?? null);

      // The new stream supersedes the old one. Stopping the previous camera
      // releases the hardware indicator light, which is what people check to
      // confirm they are actually off-camera.
      if (previous && previous !== next) stopStream(previous);

      setStatus(cam && mic ? 'ready' : 'partial');
      if (!cam || !mic) {
        setMessage(
          !cam && !mic
            ? 'No camera or microphone available — you can still join and listen.'
            : cam
              ? 'No microphone found — you can join and be seen, but not heard.'
              : 'No camera found — you can join and be heard, but not seen.',
        );
      } else {
        setMessage(null);
      }
    },
    [stopStream],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (!available()) {
      setStatus('unavailable');
      setMessage(describeError(new MediaUnavailableError()));
      return;
    }

    setStatus((s) => (s === 'idle' || s === 'denied' ? 'requesting' : s));

    openStream(pendingRef.current.cameraId, pendingRef.current.micId)
      .then((next) => {
        if (cancelled) {
          stopStream(next);
          return;
        }
        adopt(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('denied');
        setMessage(describeError(err));
      });

    return () => {
      cancelled = true;
    };
    // `attempt` is the retry trigger; pendingRef holds the selected devices.
  }, [enabled, attempt, adopt, stopStream]);

  // Device enumeration is only populated once permission has been granted, so
  // this deliberately runs after the stream opens rather than on mount.
  useEffect(() => {
    if (!enabled || !available()) return;
    let cancelled = false;

    async function enumerate() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const video = devices.filter((d) => d.kind === 'videoinput');
        const audio = devices.filter((d) => d.kind === 'audioinput');
        setCameras(video.map((d, i) => ({ deviceId: d.deviceId, label: friendlyLabel(d, i), kind: d.kind })));
        setMics(audio.map((d, i) => ({ deviceId: d.deviceId, label: friendlyLabel(d, i), kind: d.kind })));
      } catch {
        /* enumeration is a nicety; the call works without it */
      }
    }

    if (currentStreamRef.current) void enumerate();
    const onChange = () => void enumerate();
    navigator.mediaDevices.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', onChange);
    };
  }, [enabled, stream]);

  // Track-level toggles. `enabled = false` keeps the track live but sends
  // black/silent frames, which is what a conferencing app must do — removing
  // the track entirely would force every peer's sender to renegotiate.
  useEffect(() => {
    for (const track of stream?.getAudioTracks() ?? []) track.enabled = micOn;
  }, [stream, micOn]);

  useEffect(() => {
    for (const track of stream?.getVideoTracks() ?? []) track.enabled = camOn;
  }, [stream, camOn]);

  useEffect(() => {
    return () => stopStream(currentStreamRef.current);
  }, [stopStream]);

  const selectCamera = useCallback(
    (deviceId: string) => {
      pendingRef.current = { ...pendingRef.current, cameraId: deviceId };
      setAttempt((n) => n + 1);
    },
    [],
  );

  const selectMic = useCallback(
    (deviceId: string) => {
      pendingRef.current = { ...pendingRef.current, micId: deviceId };
      setAttempt((n) => n + 1);
    },
    [],
  );

  return {
    stream,
    cameraTrack: stream?.getVideoTracks()[0] ?? null,
    micTrack: stream?.getAudioTracks()[0] ?? null,
    status,
    message,
    micOn,
    camOn,
    cameras,
    mics,
    activeCameraId,
    activeMicId,
    setMicOn: setMicOnState,
    setCamOn: setCamOnState,
    selectCamera,
    selectMic,
    retry: () => setAttempt((n) => n + 1),
  };
}