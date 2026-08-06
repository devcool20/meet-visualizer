import type { Store } from '../db/types.js';
import type { NotionSyncService } from './sync.js';

/**
 * Hourly reconciliation sweep (plan §2.6: "webhook-driven sync plus an
 * hourly reconciliation sweep — NOT blanket 15-minute polling").
 *
 * Webhooks (see `webhooks.ts`) drive near-real-time updates; this sweep is
 * the correctness backstop for missed/failed webhook deliveries. It walks
 * every stored Connection (not scoped to one user — this is a maintenance
 * job, not a per-request tenant operation) and resyncs each selected data
 * source.
 */
export class ReconciliationSweep {
  private timer: NodeJS.Timeout | null = null;

  constructor(private store: Store, private syncService: NotionSyncService, private intervalMs = 60 * 60_000) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error('[Notion Reconciliation] sweep failed:', err));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    const connections = await this.store.listConnectionsForReconciliation();
    for (const connection of connections) {
      const sourceIds = connection.selectedSources ?? [];
      for (const sourceId of sourceIds) {
        try {
          await this.syncService.syncDataSource(connection.userId, sourceId);
          await this.store.upsertConnection(connection.userId, {
            ...connection,
            lastSyncedAt: new Date(),
            syncError: null,
          });
        } catch (err) {
          await this.store.upsertConnection(connection.userId, {
            ...connection,
            syncError: (err as Error).message,
          });
        }
      }
    }
  }
}
