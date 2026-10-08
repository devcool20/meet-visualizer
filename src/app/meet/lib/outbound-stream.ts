/**
 * Outbound stream arbitration.
 *
 * This is the single most consequential decision in the meeting platform: what
 * track other participants actually receive. Getting it wrong means a
 * presenter either loses their video or sends black frames, so the policy is a
 * pure function rather than logic buried inside a hook — it can then be tested
 * exhaustively, which matters more here than anywhere else in the client.
 *
 * The rules, in order:
 *
 *  1. **Compositor unavailable** → the raw camera. A broken canvas must never
 *     cost the presenter their video; the card simply is not shown.
 *  2. **A card (or its placeholder) is on air** → the composited track,
 *     because the card has to be *in* the video.
 *  3. **Camera off** → no video track at all, so peers render a camera-off
 *     tile instead of a black rectangle. A card still counts as "on air" and
 *     still gets sent: a presenter can turn the camera off and present the data
 *     on the branded fill.
 *  4. **Camera on, nothing composited** → the raw camera, so the encoder is not
 *     paying for a canvas it does not need.
 *
 * Audio is forwarded untouched in every branch. Nothing here reads, buffers or
 * stores it; the track is handed straight to WebRTC.
 */

export interface OutboundInputs {
  /** The composited video track, or null when there is no compositor. */
  compositedTrack: MediaStreamTrack | null;
  /** Whether a real card or a placeholder occupies the card slot. */
  hasOverlay: boolean;
  /** The live camera track, or null when the camera is off or absent. */
  cameraTrack: MediaStreamTrack | null;
  /** The microphone track. Forwarded untouched. */
  micTrack: MediaStreamTrack | null;
}

function live(track: MediaStreamTrack | null): MediaStreamTrack | null {
  if (!track) return null;
  return track.readyState === 'ended' ? null : track;
}

function build(tracks: (MediaStreamTrack | null)[]): MediaStream | null {
  const present = tracks.filter((t): t is MediaStreamTrack => !!t);
  return present.length > 0 ? new MediaStream(present) : null;
}

/** Resolves the stream every peer should receive, or null to send nothing. */
export function resolveOutboundStream(inputs: OutboundInputs): MediaStream | null {
  const audio = live(inputs.micTrack);
  const camera = live(inputs.cameraTrack);
  const composited = live(inputs.compositedTrack);

  // 1. No compositor: passthrough. The card is dropped, the presenter is not.
  if (!inputs.compositedTrack) return build([audio, camera]);

  // 2. Something is on air, so the composited track is what the room sees.
  if (inputs.hasOverlay && composited) return build([audio, composited]);

  // 3. Camera off with nothing to show.
  if (!camera) return build([audio]);

  // 4. Camera on, nothing composited.
  return build([audio, camera]);
}