import type { VirtualCamEvent, VirtualCamListener, VirtualCamState } from './types.js';

export interface BroadcasterStats {
  connectedClients: number;
  totalEventsEmitted: number;
  lastBroadcastTime: number | null;
}

/**
 * Manages event broadcasting and client synchronization for the Virtual Camera engine.
 */
export class VirtualCameraBroadcaster {
  private listeners: Set<VirtualCamListener> = new Set();
  private totalEvents: number = 0;
  private lastBroadcast: number | null = null;

  subscribe(listener: VirtualCamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: VirtualCamEvent): void {
    this.totalEvents++;
    this.lastBroadcast = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[VirtualCamBroadcaster] listener error:', err);
      }
    }
  }

  broadcastState(state: VirtualCamState): void {
    this.broadcast({ type: 'state_sync', state });
  }

  getStats(): BroadcasterStats {
    return {
      connectedClients: this.listeners.size,
      totalEventsEmitted: this.totalEvents,
      lastBroadcastTime: this.lastBroadcast,
    };
  }
}
