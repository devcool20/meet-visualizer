import type { CardSpec, CardTheme } from '@stash/card-spec';
import { resolveTheme, layoutCard, approximateMeasurer, type CardLayout } from '@stash/card-core';
import type { AudioMeterLevel, HudState, Resolution } from './types.js';

export interface CompositorFrameOptions {
  resolution: Resolution;
  hudState: HudState;
  interimTranscript?: string;
  audioLevel?: AudioMeterLevel;
  activeCard?: CardSpec | null;
  cardProgress?: number; // 0 to 1
  timeMs?: number;
}

export interface CardRenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * High-performance frame compositor for the Virtual Camera engine.
 * Computes exact overlay coordinates, layouts, spring interpolation, and HUD overlays.
 */
export class FrameCompositor {
  private width: number;
  private height: number;

  constructor(resolution: Resolution = { width: 1280, height: 720 }) {
    this.width = resolution.width;
    this.height = resolution.height;
  }

  setResolution(resolution: Resolution): void {
    this.width = resolution.width;
    this.height = resolution.height;
  }

  /**
   * Computes the bounding box for the over-the-shoulder glass card overlay.
   */
  computeCardBounds(card: CardSpec, progress: number = 1): CardRenderBounds {
    const cardWidth = 358;
    const paddingRight = 32;
    const paddingTop = 32;

    const layout = this.getCardLayout(card);
    const cardHeight = layout.height;

    // Slide in from right (+35% offset when progress = 0)
    const targetX = this.width - cardWidth - paddingRight;
    const startX = targetX + cardWidth * 0.35;
    const currentX = startX + (targetX - startX) * progress;

    return {
      x: Math.round(currentX),
      y: paddingTop,
      width: cardWidth,
      height: cardHeight,
    };
  }

  /**
   * Computes layout dimensions for a given card specification.
   */
  getCardLayout(card: CardSpec): CardLayout {
    return layoutCard(card, approximateMeasurer);
  }

  /**
   * Formats the HUD pill display data for renderers and WebSocket clients.
   */
  formatHudDisplay(hudState: HudState, interimTranscript?: string, audioLevel?: AudioMeterLevel) {
    const defaultMeter: AudioMeterLevel = { current: 0, peak: 0, bars: [0.1, 0.1, 0.1] };
    const meter = audioLevel || defaultMeter;

    switch (hudState) {
      case 'listening':
        return {
          state: 'listening' as const,
          label: 'Listening…',
          transcript: interimTranscript || 'Hold to speak',
          accent: '#fb8500',
          pulsing: true,
          bars: meter.bars,
        };
      case 'generating':
        return {
          state: 'generating' as const,
          label: 'Generating card…',
          transcript: interimTranscript || '',
          accent: '#fb8500',
          pulsing: false,
          spinner: true,
        };
      case 'error':
        return {
          state: 'error' as const,
          label: 'Speech not recognized',
          transcript: 'Try again',
          accent: '#d4183d',
          pulsing: false,
        };
      case 'idle':
      default:
        return {
          state: 'idle' as const,
          label: '⌥ ⇧ Space',
          transcript: 'Hold to speak',
          accent: 'rgba(255, 255, 255, 0.4)',
          pulsing: false,
        };
    }
  }

  /**
   * Resolves card color tokens given the card specification.
   */
  resolveCardTheme(card: CardSpec): CardTheme {
    return resolveTheme(card.theme);
  }
}
