import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualCamEngine } from '../virtualcam/engine.js';
import { FrameCompositor } from '../virtualcam/compositor.js';
import { VirtualCameraBroadcaster } from '../virtualcam/broadcaster.js';
import { CardGenerator } from '../generation/card-generator.js';
import { AiKeyResolver } from '../generation/ai-credentials.js';
import { MockGenerationProvider } from '../generation/mock-provider.js';
import { DriveDocsAggregator } from '../drive/aggregator.js';
import { DriveGroundingProvider } from '../drive/grounding.js';
import { MockImageFetcher, createImageByteCache, ProxyImageResolver } from '../images/image-fetcher.js';
import { createCache } from '../services/cache.js';
import { MemoryStore } from '../db/memory-store.js';
import { AesGcmEncryptor } from '../util/encryption.js';

describe('VirtualCamEngine & Compositor', () => {
  let aggregator: DriveDocsAggregator;
  let grounding: DriveGroundingProvider;
  let generator: CardGenerator;
  let engine: VirtualCamEngine;
  let compositor: FrameCompositor;
  let broadcaster: VirtualCameraBroadcaster;

  beforeEach(async () => {
    aggregator = new DriveDocsAggregator();
    aggregator.seedDefaultDocs('test-user');
    grounding = new DriveGroundingProvider(aggregator);

    const store = new MemoryStore();
    const encryptor = new AesGcmEncryptor(Buffer.alloc(32, 1).toString('base64'));
    const keyResolver = new AiKeyResolver(store, encryptor);
    // Per-user credential so key resolution exercises the real "user key" path.
    await store.upsertAiCredential('test-user', {
      provider: 'mock',
      apiKey: encryptor.encrypt('test-key-0123456789'),
      model: 'mock-model/v0',
    });
    const imageFetcher = new MockImageFetcher();
    const imageCache = createImageByteCache();
    const imageResolver = new ProxyImageResolver(imageFetcher, imageCache, 'http://localhost:5000');
    const cache = createCache();

    generator = new CardGenerator({
      keyResolver,
      grounding,
      images: imageResolver,
      cache,
      providerFactory: () => new MockGenerationProvider(),
    });

    compositor = new FrameCompositor({ width: 1280, height: 720 });
    broadcaster = new VirtualCameraBroadcaster();

    engine = new VirtualCamEngine({
      cardGenerator: generator,
      compositor,
      broadcaster,
      config: {
        width: 1280,
        height: 720,
        targetFps: 60,
        cardTtlMs: 1000,
      },
    });
  });

  it('initializes in idle state with 60fps 720p resolution', () => {
    const state = engine.getState();
    expect(state.active).toBe(true);
    expect(state.hudState).toBe('idle');
    expect(state.activeCard).toBeNull();
    expect(state.cardVisible).toBe(false);
    expect(state.fps).toBe(60);
    expect(state.resolution).toEqual({ width: 1280, height: 720 });
  });

  it('transitions HUD states and broadcasts events', () => {
    const events: string[] = [];
    engine.subscribe((e) => events.push(e.type));

    engine.setHudState('listening', 'our ARR metrics');
    expect(engine.getState().hudState).toBe('listening');
    expect(engine.getState().interimTranscript).toBe('our ARR metrics');

    engine.setHudState('generating');
    expect(engine.getState().hudState).toBe('generating');

    engine.setHudState('error', 'Audio clipping');
    expect(engine.getState().hudState).toBe('error');

    engine.setHudState('idle');
    expect(engine.getState().hudState).toBe('idle');

    expect(events.filter((t) => t === 'hud_state').length).toBe(4);
  });

  it('updates real-time audio meter and 3-band EQ bars', () => {
    engine.setAudioLevel(0.65, 0.85);
    const state = engine.getState();
    expect(state.audioLevel.current).toBe(0.65);
    expect(state.audioLevel.peak).toBe(0.85);
    expect(state.audioLevel.bars.length).toBe(3);
  });

  it('triggers speech utterance, queries Google Drive grounding, and generates card', async () => {
    const card = await engine.triggerUtterance({
      utterance: 'what is our current ARR and gross margins',
      userId: 'test-user',
    });

    expect(card).toBeDefined();
    expect(card?.title).toBeTruthy();
    expect(card?.blocks.length).toBeGreaterThan(0);

    const state = engine.getState();
    expect(state.activeCard).toBe(card);
    expect(state.cardVisible).toBe(true);
    expect(state.cardProgress).toBe(1);
    expect(state.hudState).toBe('idle');
    expect(state.activeCardSource).toContain('Google Drive');
  });

  it('calculates exact over-the-shoulder frame bounds with spring progression', () => {
    const sampleCard = {
      v: 1 as const,
      id: 'test-card',
      revision: 1,
      title: 'Metrics',
      theme: {},
      blocks: [
        {
          kind: 'metric_row' as const,
          items: [{ label: 'ARR', value: '$148K', emphasis: true }],
        },
      ],
    };

    const startBounds = compositor.computeCardBounds(sampleCard, 0);
    const endBounds = compositor.computeCardBounds(sampleCard, 1);

    expect(endBounds.width).toBe(358);
    expect(endBounds.x).toBe(1280 - 358 - 32); // 890
    expect(startBounds.x).toBeGreaterThan(endBounds.x); // slid in from right
  });

  it('handles manual card push and dismiss', () => {
    const sampleCard = {
      v: 1 as const,
      id: 'manual-1',
      revision: 1,
      title: 'Manual Slide',
      theme: {},
      blocks: [
        {
          kind: 'text' as const,
          paragraphs: ['Direct Virtual Camera Push'],
        },
      ],
    };

    engine.pushCard(sampleCard, 'Presenter Console');
    expect(engine.getState().activeCard).toBe(sampleCard);
    expect(engine.getState().activeCardSource).toBe('Presenter Console');

    engine.dismissCard();
    expect(engine.getState().activeCard).toBeNull();
    expect(engine.getState().cardVisible).toBe(false);
  });

  it('formats HUD display state for idle, listening, generating, and error states', () => {
    const idleHud = compositor.formatHudDisplay('idle');
    expect(idleHud.state).toBe('idle');
    expect(idleHud.label).toContain('Space');

    const listeningHud = compositor.formatHudDisplay('listening', 'revenue growth', { current: 0.8, peak: 0.9, bars: [0.8, 0.7, 0.9] });
    expect(listeningHud.state).toBe('listening');
    expect(listeningHud.transcript).toBe('revenue growth');
    expect(listeningHud.bars).toEqual([0.8, 0.7, 0.9]);

    const genHud = compositor.formatHudDisplay('generating', 'revenue growth');
    expect(genHud.state).toBe('generating');
    expect(genHud.spinner).toBe(true);

    const errHud = compositor.formatHudDisplay('error');
    expect(errHud.state).toBe('error');
  });
});
