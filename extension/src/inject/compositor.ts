/**
 * MAIN-world injected script (plan §3.1, §3.2, §3.7).
 *
 * Runs in the actual page context of meet.google.com (and, for rehearsal
 * mode, the product origin) — NOT the extension's isolated content-script
 * world, because `navigator.mediaDevices.getUserMedia` must be monkeypatched
 * on the same `navigator` object Meet's own code calls.
 *
 * Owns: the getUserMedia interception, the offscreen video element, the
 * compositor canvas, the rAF render loop, and `canvas.captureStream()`.
 * Never talks to `chrome.*` directly — only `window.postMessage`, validated
 * against the shared bridge envelope.
 *
 * Rendering itself (rasterization, the spring animator, the glass backdrop,
 * and the fps24/quarterBlur/flatFill degradation ladder) is owned by
 * `@stash/card-canvas`'s `CardCompositor` — this file only owns the camera
 * capture/canvas/rAF plumbing around it and feeds it validated `CardSpec`s.
 */
import type { CardSpec, UserSettings } from '@stash/card-spec';
import { parseCardSpec } from '@stash/card-spec';
import { CardCompositor, loadImageCorsSafe } from '@stash/card-canvas';
import { ensureCardFontsLoaded } from './fonts.js';
import { isBridgeEnvelope, isPageToInjectMsg, wrapBridgeMessage } from '../shared/messages.js';
import type { PageToInjectMsg } from '../shared/messages.js';

void ensureCardFontsLoaded();

const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

/* ------------------------------------------------------------------ */
/* Shared state across all active interception instances in this tab.  */
/* ------------------------------------------------------------------ */

let currentSpec: CardSpec | null = null;
let currentSettings: UserSettings | null = null;
const preloadedImages = new Map<string, CanvasImageSource>();

function postToPage(msg: { type: 'inject:ready' } | { type: 'compositor:active'; active: boolean } | { type: 'compositor:error'; message: string }): void {
  window.postMessage(wrapBridgeMessage(msg), window.location.origin);
}

function handleBridgeMessage(msg: PageToInjectMsg): void {
  switch (msg.type) {
    case 'card:show': {
      const result = parseCardSpec(msg.card);
      if (!result.ok) {
        // A malformed spec must never reach the render loop (frozen contract
        // note). Drop it and keep whatever was showing before.
        postToPage({ type: 'compositor:error', message: `invalid CardSpec: ${result.error}` });
        return;
      }
      void preloadImagesForSpec(result.value);
      currentSpec = result.value;
      for (const instance of activeInstances) instance.showCard();
      break;
    }
    case 'card:prewarm': {
      const result = parseCardSpec(msg.card);
      if (result.ok) void preloadImagesForSpec(result.value);
      break;
    }
    case 'card:hide':
      for (const instance of activeInstances) instance.hideCard();
      break;
    case 'card:invalidate':
      if (currentSpec && msg.cardIds.includes(currentSpec.id)) {
        for (const instance of activeInstances) instance.hideCard();
      }
      break;
    case 'settings:update':
      currentSettings = msg.settings;
      break;
    case 'token:expired':
      // Degradation (plan §3.7): let any visible card finish its dismiss
      // animation cleanly rather than yanking it — so just leave state as is;
      // the HUD (content script) surfaces the amber warning to the presenter.
      break;
  }
}

async function preloadImagesForSpec(spec: CardSpec): Promise<void> {
  for (const block of spec.blocks) {
    if (block.kind !== 'image') continue;
    if (preloadedImages.has(block.url)) continue;
    const img = await loadImageCorsSafe(block.url);
    if (img) preloadedImages.set(block.url, img);
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (!isBridgeEnvelope(event.data)) return;
  const payload = event.data.payload;
  if (!isPageToInjectMsg(payload)) return;
  handleBridgeMessage(payload);
});

/* ------------------------------------------------------------------ */
/* getUserMedia monkeypatch                                             */
/* ------------------------------------------------------------------ */

interface InterceptionInstance {
  showCard: () => void;
  hideCard: () => void;
  stop: () => void;
}

const activeInstances = new Set<InterceptionInstance>();

function installMonkeypatch(): void {
  if (!navigator.mediaDevices || !originalGetUserMedia) {
    postToPage({ type: 'compositor:error', message: 'getUserMedia unavailable on this page' });
    return;
  }

  navigator.mediaDevices.getUserMedia = async function patchedGetUserMedia(
    constraints?: MediaStreamConstraints,
  ): Promise<MediaStream> {
    if (!constraints?.video) {
      return originalGetUserMedia!(constraints);
    }

    let rawStream: MediaStream;
    try {
      rawStream = await originalGetUserMedia!(constraints);
    } catch (err) {
      throw err; // camera denial/failure is the caller's problem, not ours
    }

    const videoTracks = rawStream.getVideoTracks();
    if (videoTracks.length === 0) return rawStream;

    try {
      return await buildCompositedStream(rawStream, videoTracks[0], constraints);
    } catch (err) {
      // Degradation ladder floor (plan §3.7): compositor setup failed for any
      // reason -> pass the camera through UNMODIFIED. Never break the call.
      postToPage({ type: 'compositor:error', message: `compositor setup failed, passing through: ${String(err)}` });
      return rawStream;
    }
  };

  postToPage({ type: 'inject:ready' });
}

async function buildCompositedStream(
  rawStream: MediaStream,
  initialTrack: MediaStreamTrack,
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  const videoEl = document.createElement('video');
  videoEl.srcObject = rawStream;
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true;

  await new Promise<void>((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play().then(resolve).catch(() => resolve());
    };
  });

  let currentRawStream = rawStream;
  let currentTrack = initialTrack;

  const width = videoEl.videoWidth || 1280;
  const height = videoEl.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) throw new Error('2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = rawCtx;

  const compositor = new CardCompositor({
    images: preloadedImages,
    reducedMotion: currentSettings?.reducedMotion ?? false,
  });
  let isLoopActive = true;
  let lastTime = performance.now();
  let shownSpec: CardSpec | null = null;

  function renderLoop(): void {
    if (!isLoopActive) return;
    const now = performance.now();
    const dtMs = now - lastTime;
    lastTime = now;

    // Wrapped per plan §3.7: ANY exception anywhere in a frame must fall
    // back to a plain passthrough draw, never a black or frozen canvas.
    try {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(videoEl, 0, 0, width, height);

      // A card only keeps compositing while it is either the current spec or
      // still finishing its leave animation (`isFinished` flips once the
      // spring/fade settles at opacity 0) — mirrors plan §3.3's "never
      // re-render during animation, but do keep animating the transform".
      if (shownSpec && !compositor.isFinished) {
        compositor.composite(ctx, shownSpec, { width, height }, dtMs, shownSpec.position);
      }
    } catch {
      try {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(videoEl, 0, 0, width, height);
      } catch {
        // Even the bare passthrough draw failed (e.g. video not ready yet) —
        // leave the canvas's previous frame rather than throwing into rAF.
      }
    }

    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  const compositeStream = canvas.captureStream(30);
  rawStream.getAudioTracks().forEach((track) => compositeStream.addTrack(track));

  const instance: InterceptionInstance = {
    showCard: () => {
      if (!currentSpec) return;
      shownSpec = currentSpec;
      compositor.show();
    },
    hideCard: () => {
      compositor.hide();
    },
    stop: () => {
      isLoopActive = false;
      activeInstances.delete(instance);
    },
  };
  activeInstances.add(instance);
  // A card may already have been shown (e.g. `card:show` arrived before this
  // particular `getUserMedia()` caller's stream finished setting up).
  if (currentSpec) instance.showCard();

  // Camera switched mid-call -> devicechange rebuild (plan §3.7). We cannot
  // hand Meet a brand new MediaStream object (it already holds a reference
  // to `compositeStream`), but when the current video track ends — the
  // signal a device was unplugged or swapped — we re-request a fresh raw
  // stream with the SAME constraints and rebind `videoEl` to it. The render
  // loop keeps drawing into the same canvas, so `compositeStream` (and
  // therefore what Meet sends to remote participants) is uninterrupted. Only
  // if the re-request itself fails do we give up and tear the loop down.
  function rebuildFromNewTrack(): void {
    if (!isLoopActive) return;
    originalGetUserMedia!(constraints)
      .then((freshStream) => {
        if (!isLoopActive) {
          freshStream.getTracks().forEach((t) => t.stop());
          return;
        }
        currentRawStream.getVideoTracks().forEach((t) => t.stop());
        currentRawStream = freshStream;
        videoEl.srcObject = freshStream;
        const freshTrack = freshStream.getVideoTracks()[0];
        if (freshTrack) {
          currentTrack = freshTrack;
          currentTrack.addEventListener('ended', rebuildFromNewTrack);
        } else {
          // No video track in the replacement stream either — nothing left
          // to composite from; stop cleanly rather than freeze.
          instance.stop();
        }
      })
      .catch(() => {
        // Device truly gone and no replacement available (e.g. camera
        // unplugged with nothing else to fall back to) -> stop cleanly.
        instance.stop();
        currentRawStream.getTracks().forEach((t) => t.stop());
      });
  }

  currentTrack.addEventListener('ended', rebuildFromNewTrack);

  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (!isLoopActive) return;
    // If the currently bound track already ended, `rebuildFromNewTrack` will
    // have run via the 'ended' listener above; this handler only matters for
    // browsers/devices where a device swap doesn't reliably fire 'ended' on
    // the outgoing track. `readyState` lets us detect that case defensively.
    if (currentTrack.readyState === 'ended') rebuildFromNewTrack();
  });

  postToPage({ type: 'compositor:active', active: true });
  return compositeStream;
}

installMonkeypatch();
