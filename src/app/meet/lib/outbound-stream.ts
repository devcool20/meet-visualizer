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

/**
 * Resolves the stream the presenter transmits.
 *
 * ## The rule: this is never a composite
 *
 * The card travels as data and is drawn by each *receiver*. The presenter
 * sends their camera exactly as the camera produced it, always. That is the
 * whole architectural point, and it is what makes a card incapable of taking
 * the presenter's camera away from them or from everyone watching.
 *
 * An earlier version of the platform composited on the sender — inherited from
 * the extension, where injecting into a browser we do not control was the only
 * option. In our own room that constraint is gone, and keeping it was strictly
 * worse: it corrupted the presenter's video whenever the compositor misbehaved,
 * it cost bandwidth (a composited canvas full of glass edges and small text
 * compresses far worse than a clean camera frame), and it capped card quality
 * at the sender's resolution instead of each receiver's.
 *
 * Audio is forwarded untouched. Nothing here reads, mixes or buffers it.
 */
export interface OutboundInputs {
  /** The composited video track. Accepted only so an unhealthy case is visible. */
  compositedTrack: MediaStreamTrack | null;
  /** Whether a card is on air. Deliberately ignored — see the note above. */
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

/**
 * What leaves the presenter's browser: their camera and microphone, or just the
 * microphone with the camera off so peers can still hear them and draw a
 * camera-off tile instead of silence.
 */
export function resolveOutboundStream(inputs: OutboundInputs): MediaStream | null {
  void inputs.compositedTrack;
  void inputs.hasOverlay;
  const tracks = [live(inputs.micTrack), live(inputs.cameraTrack)].filter((t): t is MediaStreamTrack => !!t);
  return tracks.length > 0 ? new MediaStream(tracks) : null;
}