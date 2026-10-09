/**
 * The outbound compositor — the reason this meeting platform exists.
 *
 * ## What it does
 *
 * A presenter's card has to reach every other participant. The extension
 * achieves that on Google Meet by monkeypatching `getUserMedia` and handing
 * Meet a doctored stream. Here we own the peer connections, so there is
 * nothing to patch: we build the outbound stream ourselves.
 *
 * Per frame:
 *   1. the local camera frame is drawn into a canvas (or a brand-coloured fill
 *      if the camera is off),
 *   2. `CardCompositor` from `@stash/card-canvas` draws the glass card on top
 *      using the exact same placement, spring and degradation ladder that run
 *      inside the extension,
 *   3. `canvas.captureStream()` produces the video track every peer receives.
 *
 * Every remote participant therefore sees the card burned into the video, not
 * as an overlay this client can drop. That is the whole difference between a
 * card that is "in the meeting" and a card that is "in your browser".
 *
 * ## Deliberate non-mirroring
 *
 * The camera frame is drawn as captured — never mirrored. Mirroring would put
 * the card on the opposite shoulder from the one the compositor's busyness
 * sampler measured, and would make self-view disagree with what everyone else
 * sees. Google Meet's outgoing video is un-mirrored for the same reason.
 *
 * ## Audio is never touched
 *
 * The audio track is forwarded untouched from the microphone. Nothing in this
 * file reads, buffers, mixes or stores audio.
 *
 * ## Failure policy
 *
 * Any throw inside a frame falls back to a bare passthrough draw, and a
 * failure to build at all falls back to sending the raw camera track. The
 * presenter losing their video because a card failed to rasterise is not an
 * acceptable failure mode, so every step degrades instead of propagating.
 */
import { CardCompositor, loadImageCorsSafe, resolveTtlMs } from '@stash/card-canvas';
import type { CardCompositor as CardCompositorType } from '@stash/card-canvas';
import type { CardPosition, CardSpec, UserSettings } from '@stash/card-spec';

/** Milliseconds between frames while the tab is backgrounded. */
const HIDDEN_FRAME_MS = 120;

/** Frames per second requested from `captureStream`. */
const CAPTURE_FPS = 30;

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/**
 * What fills the frame when there is no camera.
 *
 * Deliberately NOT the brand's `COLORS.canvas` (#FBF9F6). That colour is a
 * document background; used as a video base it turns any failure to draw the
 * camera into a blank white tile that reads as a broken page rather than as a
 * missing camera. Black is what an empty stage should look like.
 */
const NO_CAMERA_FILL = '#000000';

/**
 * How long to wait for webfonts before showing a card anyway.
 *
 * `document.fonts.ready` does not settle while any font request is in flight,
 * and the product loads Cormorant, Inter and JetBrains Mono from Google. If
 * that request is slow, blocked by an extension, or offline, an unbounded wait
 * means the card silently never appears — the presenter holds to talk, sees
 * "Building…", and no card ever arrives. Canvas text falls back to a system
 * font gracefully, so a short wait is strictly better than no card.
 */
const FONT_WAIT_MS = 600;

/** Races `document.fonts.ready` against a timeout. */
function fontsReadyWithin(ms: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, ms);
    document.fonts.ready.then(done, done);
  });
}

export type PlaceholderKind = 'generating' | 'error';

export interface OutboundCompositorOptions {
  reducedMotion?: boolean;
  position?: CardPosition;
  /** Canvas size before the first camera frame reports its own. */
  width?: number;
  height?: number;
}

/**
 * One compositor per participant. Owns the canvas, the render loop and the
 * `CardCompositor`; knows nothing about React, WebRTC or the DOM's layout.
 */
export class OutboundCompositor {
  readonly canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D;
  private compositor: CardCompositorType;
  private images = new Map<string, CanvasImageSource>();

  /** The track every peer receives. Created once, never replaced. */
  private readonly outboundTrack: MediaStreamTrack;
  private readonly outboundStream: MediaStream;

  private videoEl: HTMLVideoElement | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private cameraEndedListener: (() => void) | null = null;

  private spec: CardSpec | null = null;
  private showingPlaceholder = false;
  private destroyed = false;

  private width: number;
  private height: number;

  private rafId: number | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastFrameAt = 0;
  private lastErrorMessage: string | null = null;
  /** Frame counter, for diagnostics. */
  private frameCount = 0;

  /** Resolves once the document's card fonts are usable by canvas text. */
  private fontsReady: Promise<void>;

  constructor(opts: OutboundCompositorOptions = {}) {
    this.width = opts.width ?? DEFAULT_WIDTH;
    this.height = opts.height ?? DEFAULT_HEIGHT;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    // The canvas must be a real rendered layer, not a detached one. This is the
    // same constraint the camera <video> below is mounted to satisfy: a canvas
    // that contributes no visible pixels can be skipped by the compositor, and
    // `captureStream()` then yields a track that never produces a frame. The
    // symptom is a healthy-looking connection whose tile is pure black, with no
    // error anywhere -- which is exactly what a remote peer sees.
    //
    // 2x2 and near-transparent, behind everything and unclickable. Do not
    // "tidy" this by hiding it harder; that reintroduces the black tile.
    this.canvas.style.position = 'fixed';
    this.canvas.style.bottom = '0';
    this.canvas.style.right = '0';
    this.canvas.style.width = '2px';
    this.canvas.style.height = '2px';
    this.canvas.style.opacity = '0.01';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '-1';
    (document.body || document.documentElement).appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.compositor = new CardCompositor({
      images: this.images,
      reducedMotion: opts.reducedMotion ?? false,
      autoPlacement: true,
    });
    this.compositor.setUserPosition(opts.position ?? 'auto');

    this.outboundStream = this.canvas.captureStream(CAPTURE_FPS);
    const [track] = this.outboundStream.getVideoTracks();
    if (!track) throw new Error('captureStream produced no video track');
    this.outboundTrack = track;

    this.fontsReady = fontsReadyWithin(FONT_WAIT_MS);

    this.running = true;
    this.scheduleFrame();
  }

  /* ---------------------------------------------------------------- */
  /* Public surface                                                    */
  /* ---------------------------------------------------------------- */

  /** The composited video track. Null once destroyed. */
  get videoTrack(): MediaStreamTrack | null {
    return this.destroyed ? null : this.outboundTrack;
  }

  /**
   * The stream to render in the presenter's own preview tile.
   *
   * It is the *composited* stream, not the raw camera, so the presenter's
   * self-view is byte-for-byte what the room sees. Previewing the raw camera
   * would hide exactly the class of bug this integration exists to rule out.
   */
  get previewStream(): MediaStream | null {
    return this.destroyed ? null : this.outboundStream;
  }

  /** True while a real card or a placeholder occupies the frame. */
  get hasOverlay(): boolean {
    return this.spec !== null || this.showingPlaceholder;
  }

  /** The card currently on air, if any. */
  get currentCard(): CardSpec | null {
    return this.spec;
  }

  /**
   * The last error swallowed by the per-frame catch, if any.
   *
   * A throwing draw silently degrades to "the camera does not appear", which
   * looks like a permissions problem and is impossible to diagnose without this.
   * The meeting UI surfaces it as a warning.
   */
  get lastError(): string | null {
    return this.lastErrorMessage;
  }

  /**
   * Binds (or unbinds) the camera. Passing null switches to "data presenter"
   * mode: a branded fill instead of a camera frame, so cards stay legible.
   */
  setCameraTrack(track: MediaStreamTrack | null): void {
    this.detachCamera();
    this.cameraTrack = track;
    if (!track) return;
    this.bindCameraElement(track);
  }

  /**
   * Swaps the camera track without tearing down the canvas, the loop, or a card
   * that is currently on air. Used when the presenter picks a different camera
   * mid-call.
   */
  replaceCameraTrack(track: MediaStreamTrack | null): void {
    if (track === this.cameraTrack) return;
    this.setCameraTrack(track);
  }

  /**
   * Puts a validated card on air.
   *
   * Images are fetched before the first frame so the card never pops in with
   * an empty image slot, and the placeholder is only dropped once the real
   * card is ready to draw.
   */
  async show(spec: CardSpec, settings?: Pick<UserSettings, 'autoDismissMs'>): Promise<void> {
    await this.fontsReady;
    if (this.destroyed) return;
    await this.preloadImages(spec);
    if (this.destroyed) return;

    this.spec = spec;
    this.showingPlaceholder = false;
    this.compositor.clearTtl();
    this.compositor.show();
    const ttl = resolveTtlMs(spec.ttlMs, settings?.autoDismissMs);
    this.compositor.startTtl(ttl.durationMs);
  }

  /** Shows the generating / error placeholder in the card's slot. */
  showPlaceholder(kind: PlaceholderKind, title: string, detail?: string): void {
    if (this.destroyed) return;
    this.spec = null;
    this.showingPlaceholder = true;
    this.compositor.showPlaceholder(kind, title, detail);
  }

  /** Takes the card off air. The camera frame resumes immediately. */
  clear(): void {
    if (this.destroyed) return;
    this.spec = null;
    this.showingPlaceholder = false;
    this.compositor.clearTtl();
    this.compositor.hide();
  }

  /** Pushes new presentation settings without restarting anything. */
  applySettings(settings: Pick<UserSettings, 'reducedMotion' | 'position'>): void {
    this.compositor.setReducedMotion(settings.reducedMotion);
    this.compositor.setUserPosition(settings.position);
  }

  /** Releases the canvas loop, the video element and the outbound track. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.hiddenTimer !== null) clearTimeout(this.hiddenTimer);
    this.rafId = null;
    this.hiddenTimer = null;
    this.detachCamera();
    this.outboundTrack.stop();
    this.canvas.width = 1;
    this.canvas.height = 1;
    // The canvas is mounted so `captureStream` keeps producing frames, so it has
    // to come back off the page or every peer leaks a node for the call's life.
    this.canvas.remove();
    this.images.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private async preloadImages(spec: CardSpec): Promise<void> {
    const wanted = spec.blocks.filter((b) => b.kind === 'image').map((b) => (b as { url: string }).url);
    await Promise.all(
      wanted.map(async (url) => {
        if (this.images.has(url)) return;
        const img = await loadImageCorsSafe(url);
        if (img) this.images.set(url, img);
      }),
    );
  }

  /**
   * Creates the off-screen <video> that decodes the camera for the canvas.
   * Kept in the document (positioned off-screen) because a fully detached
   * <video> does not decode frames reliably in every browser, and this must
   * never be visible.
   */
  private bindCameraElement(track: MediaStreamTrack): void {
    const settings = track.getSettings?.() ?? {};
    const w = settings.width ?? this.width ?? DEFAULT_WIDTH;
    const h = settings.height ?? this.height ?? DEFAULT_HEIGHT;
    if (w !== this.width || h !== this.height) this.resize(w, h);

    const el = document.createElement('video');
el.muted = true;
    el.defaultMuted = true;
    el.autoplay = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('muted', '');
    el.setAttribute('autoplay', '');
    // Positioned in the extreme corner, microscopic, and near-transparent — but
    // deliberately NOT fully hidden. A <video> that contributes no visible
    // pixels (opacity 0, display none, or fully offscreen) is skipped by the
    // compositor as an optimisation: readyState still advances and rVFC still
    // fires, but drawImage captures a blank frame. That failure looks exactly
    // like a dead camera, so the element must stay a real rendered layer.
    //
    // At 2x2 and 1% opacity, tucked behind everything, it is invisible in
    // practice and untouchable (pointer-events off). Do not "improve" this by
    // hiding it harder.
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.right = '0';
    el.style.width = '2px';
    el.style.height = '2px';
    el.style.opacity = '0.01';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '-1';
    (document.body || document.documentElement).appendChild(el);
    el.srcObject = new MediaStream([track]);

    const tryPlay = () => {
      void el.play().catch(() => {
        /* muted playback is autoplay-allowed; this is belt and braces */
      });
    };
    tryPlay();
    el.onloadedmetadata = () => {
      tryPlay();
      if (el.videoWidth && el.videoHeight && el.videoWidth !== this.width) {
        this.resize(el.videoWidth, el.videoHeight);
      }
    };
    this.videoEl = el;

    // A camera that is unplugged or switched mid-call must not freeze the frame
    // everyone is watching. Drop to the branded fill, which still carries cards.
    const onEnded = () => this.handleCameraLoss();
    this.cameraEndedListener = onEnded;
    track.addEventListener('ended', onEnded);
  }

  private handleCameraLoss(): void {
    // The track the browser gave us is dead. Everything else about the call can
    // continue: cards render on the branded fill and audio is untouched.
    this.detachCamera();
    this.cameraTrack = null;
  }

  private detachCamera(): void {
    if (this.cameraEndedListener && this.cameraTrack) {
      this.cameraTrack.removeEventListener('ended', this.cameraEndedListener);
    }
    this.cameraEndedListener = null;
    const el = this.videoEl;
    this.videoEl = null;
    if (el) {
      el.srcObject = null;
      el.remove();
    }
    this.cameraTrack = null;
  }

  private resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private scheduleFrame(): void {
    if (!this.running || this.destroyed) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // rAF does not fire for a backgrounded tab. Without this the canvas
      // would hold one stale frame and every peer would see the presenter
      // frozen for as long as they stayed on another tab.
      this.hiddenTimer = setTimeout(() => {
        this.hiddenTimer = null;
        this.render();
        this.scheduleFrame();
      }, HIDDEN_FRAME_MS);
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
      this.scheduleFrame();
    });
  }

  private render(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const dtMs = this.lastFrameAt === 0 ? 16 : Math.min(100, now - this.lastFrameAt);
    this.lastFrameAt = now;
    this.frameCount++;

    const frame = { width: this.width, height: this.height };

    try {
      this.drawBaseFrame();
      if (this.showingPlaceholder && !this.compositor.isFinished) {
        this.compositor.compositePlaceholder(this.ctx, frame, dtMs);
      } else if (this.spec && !this.compositor.isFinished) {
        // Sample busyness from the raw camera element when there is one, so
        // the previous card's pixels never influence where this one lands.
        this.compositor.composite(this.ctx, this.spec, frame, dtMs, this.spec.position, this.videoEl ?? undefined);
      }
    } catch (err) {
      // Anything at all going wrong degrades to a plain camera frame rather
      // than a black canvas. Never the other way round.
      this.lastErrorMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      try {
        this.drawBaseFrame();
      } catch {
        /* leave the previous frame on the canvas */
      }
    }
  }

  /** Frames rendered since construction. Diagnostics only. */
  get frames(): number {
    return this.frameCount;
  }

  private drawBaseFrame(): void {
    const ctx = this.ctx;
    // Black, not the brand alabaster. This is a video frame: when the camera
    // is absent (data-presenter mode) the audience should see an obviously
    // empty stage, and a failure to draw the camera should look like "no
    // camera" rather than like a broken white page.
    ctx.fillStyle = NO_CAMERA_FILL;
    ctx.fillRect(0, 0, this.width, this.height);

    const el = this.videoEl;
    if (!el || el.readyState < 2 || el.videoWidth === 0) {
      this.cameraOk = false;
      return;
    }
    ctx.drawImage(el, 0, 0, this.width, this.height);
    this.cameraOk = true;
  }

  private cameraOk = false;

  /**
   * True when the camera is being drawn into the frame.
   *
   * Watched by the caller, which drops back to sending the raw camera track if
   * the composited output ever stops containing the presenter. A broken card is
   * a cosmetic failure; sending the room a blank frame is not.
   */
  get healthy(): boolean {
    return this.cameraOk || this.cameraTrack === null;
  }
}