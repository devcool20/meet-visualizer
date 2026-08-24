import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MeetAddonManager,
  encodeSharedState,
  decodeSharedState,
  type SharedCardBroadcastState,
} from './meet-addon-sdk';
import type { CardSpec } from '@stash/card-spec';

const MOCK_CARD: CardSpec = {
  v: 1,
  id: 'card-test-1',
  revision: 1,
  title: 'Ranbir Kapoor',
  subtitle: 'Actor · Film Producer',
  theme: {
    accent: '#6D28D9',
  },
  blocks: [
    {
      kind: 'text',
      paragraphs: ['Leading Indian cinema actor recipient of 6 Filmfare Awards.'],
    },
  ],
};

describe('Google Meet Add-on SDK Adapter', () => {
  let manager: MeetAddonManager;

  beforeEach(() => {
    manager = new MeetAddonManager();
  });

  describe('Shared State Binary Encoding / Decoding', () => {
    it('encodes and decodes shared card state losslessly', () => {
      const state: SharedCardBroadcastState = {
        activeCard: MOCK_CARD,
        presenterName: 'Test Presenter',
        timestamp: 1718000000000,
        captureId: 'cap_12345',
      };

      const encoded = encodeSharedState(state);
      expect(ArrayBuffer.isView(encoded.bytes)).toBe(true);
      expect(encoded.bytes.byteLength).toBeGreaterThan(0);

      const decoded = decodeSharedState(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.presenterName).toBe('Test Presenter');
      expect(decoded?.captureId).toBe('cap_12345');
      expect(decoded?.activeCard?.title).toBe('Ranbir Kapoor');
    });

    it('handles null activeCard gracefully', () => {
      const state: SharedCardBroadcastState = {
        activeCard: null,
        presenterName: 'Host',
        timestamp: Date.now(),
      };

      const encoded = encodeSharedState(state);
      const decoded = decodeSharedState(encoded);
      expect(decoded?.activeCard).toBeNull();
      expect(decoded?.presenterName).toBe('Host');
    });

    it('returns null on corrupted binary bytes', () => {
      const corrupted = { bytes: new Uint8Array([0, 150, 255, 30]) };
      const decoded = decodeSharedState(corrupted);
      expect(decoded).toBeNull();
    });
  });

  describe('Context Detection & Standalone Fallback', () => {
    it('initializes in standalone mode when not inside Meet iframe', async () => {
      const session = await manager.initialize();
      expect(session.isMeetContext).toBe(false);
      expect(session.frameType).toBe('STANDALONE');
      expect(session.meetingCode).toBeDefined();
    });

    it('returns effective frame type correctly', async () => {
      await manager.initialize();
      expect(manager.getEffectiveFrameType()).toBe('STANDALONE');
    });
  });

  describe('Remote Card Updates', () => {
    it('registers and unsubscribes remote card listener', () => {
      const callback = vi.fn();
      const unsubscribe = manager.onRemoteCardUpdate(callback);

      manager.broadcastCard(MOCK_CARD, 'Presenter');
      unsubscribe();
    });
  });
});
