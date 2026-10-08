/**
 * Screen share.
 *
 * Shares the display surface as a dedicated track rather than replacing the
 * camera, so a presenter can share a deck and keep their face — and any Stash
 * Live card over it — on camera at the same time. That combination is the whole
 * reason this platform is worth building rather than using a generic one.
 *
 * Two details that are easy to get wrong and very visible when they are:
 *  - `getDisplayMedia` must be called from a user gesture, so `start()` is only
 *    ever wired to a click.
 *  - The user can stop sharing from the browser's own bar at any time. The
 *    track's `ended` event is treated as authoritative, not an optimisation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ShareStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'ended';

export interface UseScreenShareResult {
  status: ShareStatus;
  /** The shared track, or null. */
  track: MediaStreamTrack | null;
  /** True when a share is live. */
  sharing: boolean;
  start: () => Promise<void>;
  stop: () => void;
  message: string | null;
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

export function useScreenShare(): UseScreenShareResult {
  const [status, setStatus] = useState<ShareStatus>('idle');
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const stop = useCallback(() => {
    const current = trackRef.current;
    trackRef.current = null;
    setTrack(null);
    if (current) {
      current.onended = null;
      try {
        current.stop();
      } catch {
        /* already stopped */
      }
    }
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (!supported()) {
      setStatus('unsupported');
      setMessage('This browser cannot share a screen.');
      return;
    }
    if (trackRef.current) return;
    setStatus('starting');
    setMessage(null);
    try {
      // A video-only request is deliberate: sharing system audio through a
      // mesh doubles the number of streams for a feature people rarely use,
      // and a half-supported audio path is worse than none.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const [shared] = stream.getVideoTracks();
      if (!shared) {
        setStatus('ended');
        setMessage('No screen was selected.');
        return;
      }
      trackRef.current = shared;
      setTrack(shared);
      setStatus('live');
      shared.onended = () => {
        trackRef.current = null;
        setTrack(null);
        setStatus('ended');
      };
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      // A cancelled picker is a normal outcome, not an error worth shouting about.
      if (name === 'NotAllowedError' || name === 'AbortError') {
        setStatus('denied');
        setMessage('Screen sharing was cancelled.');
        return;
      }
      setStatus('denied');
      setMessage(err instanceof Error ? err.message : 'Could not start sharing.');
    }
  }, []);

  useEffect(() => {
    return () => {
      const current = trackRef.current;
      trackRef.current = null;
      if (current) {
        current.onended = null;
        try {
          current.stop();
        } catch {
          /* already stopped */
        }
      }
    };
  }, []);

  return { status, track, sharing: !!track, start, stop, message };
}