/**
 * React binding for `OutboundCompositor`.
 *
 * The interesting decision this hook makes — and the reason it exists at all —
 * is *which* video track leaves this browser:
 *
 *  - No card on air and the camera is on → the raw camera track. Zero canvas
 *    cost, full encoder quality, and a backgrounded tab cannot freeze the
 *    frame everyone is watching.
 *  - A card is on air (with or without the camera) → the composited canvas
 *    track, because the card has to be *in* the video.
 *  - Camera off and no card → nothing. The peers render a camera-off tile
 *    instead of a black rectangle.
 *
 * Switching between the first two is a `replaceTrack` on each sender, not a
 * renegotiation, so a card appearing costs nothing beyond the canvas loop.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardPosition, CardSpec, UserSettings } from '@stash/card-spec';
import { OutboundCompositor } from '../lib/outbound-compositor';
import { resolveOutboundStream } from '../lib/outbound-stream';

export interface UseOutboundCompositorOptions {
  /** The live camera track, or null when the camera is off or unavailable. */
  cameraTrack: MediaStreamTrack | null;
  /** The microphone track. Forwarded untouched; never read or buffered. */
  micTrack: MediaStreamTrack | null;
  /** The card to composite over the camera, if any. */
  card: CardSpec | null;
  /** `generating` / `error` placeholder for the card slot. */
  placeholder: { kind: 'generating' | 'error'; title: string; detail?: string } | null;
  settings: Pick<UserSettings, 'reducedMotion' | 'position' | 'autoDismissMs'>;
}

export interface UseOutboundCompositorResult {
  /** The stream every peer receives. Null sends no video at all. */
  outbound: MediaStream | null;
  /** What the presenter's own tile renders — the same composited stream. */
  preview: MediaStream | null;
  /** True while the canvas loop is carrying an overlay. */
  compositing: boolean;
  /** Set when the canvas could not be built; video passes through untouched. */
  error: string | null;
}

export function useOutboundCompositor(opts: UseOutboundCompositorOptions): UseOutboundCompositorResult {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // One compositor for the lifetime of the room. Rebuilding it would drop the
  // outgoing track mid-call, which peers can only recover from by
  // renegotiating.
  const compositorRef = useRef<OutboundCompositor | null>(null);
  if (compositorRef.current === null && typeof document !== 'undefined') {
    try {
      compositorRef.current = new OutboundCompositor({
        reducedMotion: opts.settings.reducedMotion,
        position: opts.settings.position,
      });
    } catch (err) {
      compositorRef.current = null;
      setError(err instanceof Error ? err.message : 'Could not start the card compositor');
    }
  }

  // `error` is written during render above only on first construction, which
  // React tolerates because it happens before any commit. Mirror it into state
  // so consumers still re-render.
  useEffect(() => {
    if (compositorRef.current) setReady(true);
  }, []);

  useEffect(() => {
    const compositor = compositorRef.current;
    return () => {
      compositor?.destroy();
      compositorRef.current = null;
    };
  }, []);

  // Camera binding.
  useEffect(() => {
    compositorRef.current?.setCameraTrack(opts.cameraTrack);
  }, [opts.cameraTrack]);

  // Settings.
  useEffect(() => {
    compositorRef.current?.applySettings(opts.settings);
  }, [opts.settings.reducedMotion, opts.settings.position, opts.settings]);

  // Overlay: card beats placeholder, placeholder beats nothing.
  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor) return;
    if (opts.card) {
      void compositor.show(opts.card, opts.settings);
      return;
    }
    if (opts.placeholder) {
      compositor.showPlaceholder(opts.placeholder.kind, opts.placeholder.title, opts.placeholder.detail);
      return;
    }
    compositor.clear();
  }, [opts.card, opts.placeholder, opts.settings]);

/**
   * The arbitration policy lives in `resolveOutboundStream`, so it can be tested
   * exhaustively; this hook supplies its inputs and adds one override.
   *
   * The override is the health gate. A compositor that is running but is not
   * producing a usable frame must never be the thing the room sees, so an
   * unhealthy compositor falls through to the raw camera rather than
   * transmitting whatever happens to be on the canvas.
   */
  const outbound = useMemo<MediaStream | null>(() => {
    const unhealthy = ready && !!compositorRef.current && !compositorRef.current.healthy;
    return resolveOutboundStream({
      compositedTrack: unhealthy ? null : (compositorRef.current?.videoTrack ?? null),
      hasOverlay: !unhealthy && !!compositorRef.current?.hasOverlay,
      cameraTrack: opts.cameraTrack,
      micTrack: opts.micTrack,
    });
  }, [ready, opts.card, opts.placeholder, opts.cameraTrack, opts.micTrack]);

  return {
    outbound,
    // The composited stream, exposed for callers that explicitly want the
    // composite. `MeetingProvider` deliberately does NOT use it for the self
    // tile: the presenter's own view must not depend on the compositor.
    preview: outbound,
    compositing: ready && (!!opts.card || !!opts.placeholder),
    error,
  };
}

export type { CardPosition };