import type { CardSpec } from '@stash/card-spec';

export type HudState = 'idle' | 'listening' | 'generating' | 'error';

export interface AudioMeterLevel {
  current: number; // 0 to 1
  peak: number;    // 0 to 1
  bars: [number, number, number]; // 3-band speech equalizer (low, mid, high)
}

export interface Resolution {
  width: number;
  height: number;
}

export interface VirtualCamConfig {
  width: number;
  height: number;
  targetFps: number;
  hotkeyChord: string;
  cardTtlMs: number;
  enableDriveGrounding: boolean;
  userId: string;
}

export interface VirtualCamState {
  active: boolean;
  hudState: HudState;
  transcript: string;
  interimTranscript: string;
  activeCard: CardSpec | null;
  activeCardSource: string | null;
  cardVisible: boolean;
  cardProgress: number; // 0 to 1 for spring transitions
  audioLevel: AudioMeterLevel;
  fps: number;
  resolution: Resolution;
  lastTriggerTime: number | null;
  lastGenerationMs: number | null;
  error: string | null;
}

export interface TriggerUtteranceRequest {
  utterance: string;
  userId?: string;
  forceRecipe?: string;
}

export interface PushCardRequest {
  card: CardSpec;
  source?: string;
}

export type VirtualCamEvent =
  | { type: 'state_sync'; state: VirtualCamState }
  | { type: 'hud_state'; state: HudState; interim?: string }
  | { type: 'audio_level'; level: AudioMeterLevel }
  | { type: 'card_spawned'; card: CardSpec; source: string; generationMs: number }
  | { type: 'card_dismissed' }
  | { type: 'error'; message: string };

export type VirtualCamListener = (event: VirtualCamEvent) => void;
