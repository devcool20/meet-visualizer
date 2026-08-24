import type { CardSpec } from '@stash/card-spec';
import { CardGenerator } from '../generation/card-generator.js';
import { FrameCompositor } from './compositor.js';
import { VirtualCameraBroadcaster } from './broadcaster.js';
import type {
  AudioMeterLevel,
  HudState,
  Resolution,
  TriggerUtteranceRequest,
  VirtualCamConfig,
  VirtualCamListener,
  VirtualCamState,
} from './types.js';

export interface VirtualCamEngineOptions {
  cardGenerator: CardGenerator;
  config?: Partial<VirtualCamConfig>;
  compositor?: FrameCompositor;
  broadcaster?: VirtualCameraBroadcaster;
}

const DEFAULT_CONFIG: VirtualCamConfig = {
  width: 1280,
  height: 720,
  targetFps: 60,
  hotkeyChord: 'Alt+Shift+Space',
  cardTtlMs: 120_000,
  enableDriveGrounding: true,
  userId: 'local-dev-user',
};

/**
 * Main coordinator for the Stash Live Virtual Camera Engine.
 */
export class VirtualCamEngine {
  private config: VirtualCamConfig;
  private cardGenerator: CardGenerator;
  private compositor: FrameCompositor;
  private broadcaster: VirtualCameraBroadcaster;

  private state: VirtualCamState;
  private cardTtlTimer: ReturnType<typeof setTimeout> | null = null;
  private errorResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: VirtualCamEngineOptions) {
    this.cardGenerator = options.cardGenerator;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.compositor = options.compositor ?? new FrameCompositor({ width: this.config.width, height: this.config.height });
    this.broadcaster = options.broadcaster ?? new VirtualCameraBroadcaster();

    this.state = {
      active: true,
      hudState: 'idle',
      transcript: '',
      interimTranscript: '',
      activeCard: null,
      activeCardSource: null,
      cardVisible: false,
      cardProgress: 0,
      audioLevel: { current: 0, peak: 0, bars: [0.1, 0.1, 0.1] },
      fps: this.config.targetFps,
      resolution: { width: this.config.width, height: this.config.height },
      lastTriggerTime: null,
      lastGenerationMs: null,
      error: null,
    };
  }

  /**
   * Returns a snapshot of the current Virtual Camera engine state.
   */
  getState(): VirtualCamState {
    return { ...this.state };
  }

  /**
   * Subscribes to engine state changes and broadcast events.
   */
  subscribe(listener: VirtualCamListener): () => void {
    return this.broadcaster.subscribe(listener);
  }

  /**
   * Updates the presenter HUD state (idle, listening, generating, error).
   */
  setHudState(hudState: HudState, interimTranscript?: string): void {
    this.state.hudState = hudState;
    if (interimTranscript !== undefined) {
      this.state.interimTranscript = interimTranscript;
    }
    if (hudState === 'listening' && interimTranscript) {
      this.state.transcript = interimTranscript;
    }

    this.broadcaster.broadcast({
      type: 'hud_state',
      state: hudState,
      interim: interimTranscript,
    });
  }

  /**
   * Ingests real-time audio volume and 3-band equalizer levels.
   */
  setAudioLevel(current: number, peak: number, bars?: [number, number, number]): void {
    const computedBars: [number, number, number] = bars ?? [
      Math.min(1, current * 1.2),
      Math.min(1, current * 0.9),
      Math.min(1, peak * 0.8),
    ];

    const level: AudioMeterLevel = {
      current: Math.max(0, Math.min(1, current)),
      peak: Math.max(0, Math.min(1, peak)),
      bars: computedBars,
    };

    this.state.audioLevel = level;
    this.broadcaster.broadcast({ type: 'audio_level', level });
  }

  /**
   * Processes a speech utterance, searches Google Drive grounding context,
   * generates a structured card spec via the AI pipeline, and slides it into the live camera stream.
   */
  async triggerUtterance(request: TriggerUtteranceRequest): Promise<CardSpec | null> {
    const startTime = Date.now();
    const userId = request.userId || this.config.userId;
    const utterance = request.utterance.trim();

    if (!utterance) {
      this.setHudState('error', 'Empty utterance');
      return null;
    }

    this.state.lastTriggerTime = startTime;
    this.state.transcript = utterance;
    this.state.error = null;
    this.setHudState('generating', utterance);

    try {
      const outcome = await this.cardGenerator.generate(userId, utterance, {
        autoDismissMs: this.config.cardTtlMs,
      });

      if (outcome.kind !== 'card') {
        throw new Error(outcome.message || 'No card could be synthesized for utterance.');
      }

      const generationMs = Date.now() - startTime;
      this.state.lastGenerationMs = generationMs;

      // Extract source attribution
      const source = outcome.grounded
        ? 'Google Drive'
        : 'AI Knowledge';

      this.displayCard(outcome.card, source, generationMs);
      return outcome.card;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Card generation failed';
      console.error('[VirtualCamEngine] trigger error:', errorMsg);

      this.state.error = errorMsg;
      this.setHudState('error', errorMsg);
      this.broadcaster.broadcast({ type: 'error', message: errorMsg });

      if (this.errorResetTimer) clearTimeout(this.errorResetTimer);
      this.errorResetTimer = setTimeout(() => {
        if (this.state.hudState === 'error') {
          this.setHudState('idle');
        }
      }, 3000);

      return null;
    }
  }

  /**
   * Manually pushes a card into the live video stream.
   */
  pushCard(card: CardSpec, source: string = 'Manual'): void {
    this.displayCard(card, source, 0);
  }

  /**
   * Internal helper to display a card and start spring animation + TTL timer.
   */
  private displayCard(card: CardSpec, source: string, generationMs: number): void {
    if (this.cardTtlTimer) {
      clearTimeout(this.cardTtlTimer);
      this.cardTtlTimer = null;
    }

    this.state.activeCard = card;
    this.state.activeCardSource = source;
    this.state.cardVisible = true;
    this.state.cardProgress = 1; // Slide in to full position
    this.setHudState('idle');

    this.broadcaster.broadcast({
      type: 'card_spawned',
      card,
      source,
      generationMs,
    });

    // Auto-dismiss when TTL expires
    if (this.config.cardTtlMs > 0) {
      this.cardTtlTimer = setTimeout(() => {
        this.dismissCard();
      }, this.config.cardTtlMs);
    }
  }

  /**
   * Dismisses the active card from the camera frame.
   */
  dismissCard(): void {
    if (this.cardTtlTimer) {
      clearTimeout(this.cardTtlTimer);
      this.cardTtlTimer = null;
    }

    this.state.activeCard = null;
    this.state.activeCardSource = null;
    this.state.cardVisible = false;
    this.state.cardProgress = 0;

    this.broadcaster.broadcast({ type: 'card_dismissed' });
  }

  /**
   * Updates resolution settings (e.g. 720p or 1080p).
   */
  setResolution(resolution: Resolution): void {
    this.config.width = resolution.width;
    this.config.height = resolution.height;
    this.state.resolution = resolution;
    this.compositor.setResolution(resolution);
    this.broadcaster.broadcastState(this.getState());
  }

  getBroadcaster(): VirtualCameraBroadcaster {
    return this.broadcaster;
  }

  getCompositor(): FrameCompositor {
    return this.compositor;
  }
}
