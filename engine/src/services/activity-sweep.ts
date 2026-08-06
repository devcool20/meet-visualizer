import type { Store } from '../db/types.js';

/**
 * TTL sweep for opt-in near-miss snippets (plan §2.7: "24h TTL... TTL sweep
 * job"). Only clears the `snippet` text; the outcome row itself (kind,
 * score, cardId, timestamps) is retained as ordinary activity history,
 * since only the raw text is privacy-sensitive.
 */
export class ActivitySnippetSweep {
  private timer: NodeJS.Timeout | null = null;

  constructor(private store: Store, private intervalMs = 60 * 60_000) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error('[Activity Sweep] failed:', err));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now: Date = new Date()): Promise<number> {
    return this.store.deleteExpiredActivitySnippets(now);
  }
}
