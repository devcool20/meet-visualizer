/**
 * Cooldown + single-active-card policy (plan §2.4: "Cooldown 120s default
 * per card, single active card").
 *
 * Per-connection state only (plan §2.5: "Per-connection state in memory
 * only") — this class is instantiated once per WS session, not shared
 * globally, so it never leaks across users or across meetings.
 */
export class CooldownManager {
  private lastFiredAt = new Map<string, number>();
  private activeCardId: string | null = null;

  /** True if this card may fire right now (not on cooldown). */
  canFire(cardId: string, cooldownMs: number, now: number = Date.now()): boolean {
    const last = this.lastFiredAt.get(cardId);
    if (last === undefined) return true;
    return now - last >= cooldownMs;
  }

  /** True if some OTHER card is currently the active (on-screen) card. */
  hasDifferentActiveCard(cardId: string): boolean {
    return this.activeCardId !== null && this.activeCardId !== cardId;
  }

  markFired(cardId: string, now: number = Date.now()): void {
    this.lastFiredAt.set(cardId, now);
    this.activeCardId = cardId;
  }

  markDismissed(cardId?: string): void {
    if (!cardId || this.activeCardId === cardId) this.activeCardId = null;
  }

  getActiveCardId(): string | null {
    return this.activeCardId;
  }

  reset(): void {
    this.lastFiredAt.clear();
    this.activeCardId = null;
  }
}
