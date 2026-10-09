/**
 * Receiving-side compositing.
 *
 * The presenter sends their **raw camera** over WebRTC and their **card** as
 * data. Compositing happens here, on the receiver.
 *
 * This is the opposite of the extension's approach, and it is the right one
 * when you own the call rather than borrowing somebody else's:
 *
 *  - **The sender's camera cannot be corrupted by a card.** The two never
 *    touch. A compositor fault costs one bad tile on one screen, not a white
 *    feed for the presenter and everyone watching them.
 *  - **Bandwidth drops.** A clean camera frame compresses well. A composited
 *    canvas full of glass edges and small text does not — you were paying full
 *    resolution for typography.
 *  - **Quality rises.** The card is rasterised at each receiver's own
 *    resolution instead of being baked at 1280x720 and re-encoded.
 *
 * The card itself already arrives over the signalling socket
 * (`{ t: 'card', id, name, card, topic }`, validated with `parseCardSpec`
 * before fan-out), so no new wire format is needed.
 *
 * Cost, honestly: every receiver composites every sender, so a mesh room
 * spends CPU proportional to (senders x cards on air). With no card showing
 * there is no canvas work at all, and the compositor returns the raw stream
 * untouched.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCardSpec, type CardSpec, type UserSettings } from '@stash/card-spec';
import { OutboundCompositor } from '../lib/outbound-compositor';
import type { PeerMap } from '../hooks/useWebRtcMesh';

export interface RemoteComposite {
  /** The stream to render for this peer: raw when idle, composited with a card. */
  stream: MediaStream | null;
  /** The card currently drawn over this peer's video. */
  card: CardSpec | null;
}

/** How long a card stays drawn after its `card-cleared` frame. */
const CLEAR_GRACE_MS = 400;

export interface UseRemoteCompositorsOptions {
  peers: PeerMap;
  /** Broadcasts, newest last. Filtered per sender inside. */
  cards: { key: string; id: string; card: unknown }[];
  /** Clears, by sender. */
  cleared: Set<string>;
  settings: Pick<UserSettings, 'reducedMotion' | 'position' | 'autoDismissMs'>;
  /** Disables compositing entirely (used when settings say so). */
  enabled?: boolean;
}

/**
 * One `OutboundCompositor` per remote peer that has video.
 *
 * The compositor is reused verbatim: it already knows how to take a
 * `MediaStreamTrack`, decode it through an off-screen element, draw a card over
 * it, and expose a `MediaStream`. A remote video track is interchangeable with
 * a camera track for those purposes, which is what makes this reuse safe.
 */
export function useRemoteCompositors(
  opts: UseRemoteCompositorsOptions,
): Record<string, RemoteComposite> {
  const [out, setOut] = useState<Record<string, RemoteComposite>>({});
  const compsRef = useRef(new Map<string, OutboundCompositor>());
  const latestCardRef = useRef<Map<string, CardSpec>>(new Map());

  const enabled = opts.enabled ?? true;

  // Which peer has which card right now, computed from the broadcast log.
  const cardsByPeer = useMemo(() => {
    const map = new Map<string, CardSpec>();
    for (const entry of opts.cards) {
      if (opts.cleared.has(entry.id)) continue;
      const parsed = parseCardSpec(entry.card);
      if (parsed.ok) map.set(entry.id, parsed.value);
    }
    return map;
  }, [opts.cards, opts.cleared]);

  // Refs so the media effect never tears a compositor down because a card
  // changed identity.
  const cardsRef = useRef(cardsByPeer);
  cardsRef.current = cardsByPeer;
  const clearedRef = useRef(opts.cleared);
  clearedRef.current = opts.cleared;
  const settingsRef = useRef(opts.settings);
  settingsRef.current = opts.settings;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Create and destroy compositors to match the peers that actually have video.
  useEffect(() => {
    const wanted = new Set<string>();
    for (const [id, peer] of Object.entries(opts.peers)) {
      const track = peer?.stream?.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') continue;
      wanted.add(id);

      let comp = compsRef.current.get(id);
      if (!comp) {
        try {
          comp = new OutboundCompositor({
            reducedMotion: settingsRef.current.reducedMotion,
            position: settingsRef.current.position,
          });
        } catch {
          // No canvas on this client: fall back to the raw stream for this peer.
          continue;
        }
        compsRef.current.set(id, comp);
      }
      comp.setCameraTrack(track);
    }

    for (const [id, comp] of compsRef.current) {
      if (wanted.has(id)) continue;
      comp.destroy();
      compsRef.current.delete(id);
      latestCardRef.current.delete(id);
    }
  }, [opts.peers]);

  // Push card changes into each compositor.
  useEffect(() => {
    for (const [id, comp] of compsRef.current) {
      if (!enabledRef.current) {
        comp.clear();
        continue;
      }
      const card = cardsRef.current.get(id) ?? null;
      const shown = comp.currentCard;
      if (!card) {
        if (shown) comp.clear();
        continue;
      }
      if (shown && shown.id === card.id && shown.revision === card.revision) continue;
      void comp.show(card, settingsRef.current);
    }
  }, [cardsByPeer, enabled]);

  // Settings.
  useEffect(() => {
    for (const comp of compsRef.current.values()) {
      comp.applySettings({ reducedMotion: opts.settings.reducedMotion, position: opts.settings.position });
    }
  }, [opts.settings.reducedMotion, opts.settings.position, opts.settings]);

  // Publish the stream each peer should render, and tear everything down.
  useEffect(() => {
    const next: Record<string, RemoteComposite> = {};
    for (const [id, peer] of Object.entries(opts.peers)) {
      const raw = peer?.stream ?? null;
      const comp = enabled ? compsRef.current.get(id) : undefined;
      const card = comp?.currentCard ?? null;
      // Never hand out a composited stream that has lost the camera: the raw
      // stream is strictly better than a card over nobody's face.
      next[id] = comp && comp.healthy && comp.hasOverlay ? { stream: comp.previewStream, card } : { stream: raw, card: null };
    }
    setOut(next);
    // `peers` identity changes on every state update, which is exactly when a
    // consumer needs the current streams.
  }, [opts.peers, cardsByPeer, enabled]);

  useEffect(() => {
    return () => {
      for (const comp of compsRef.current.values()) comp.destroy();
      compsRef.current.clear();
    };
  }, []);

  return out;
}

/** Exposed for the reaper above; keeps the grace window honest. */
export { CLEAR_GRACE_MS };