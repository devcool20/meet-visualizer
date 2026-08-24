import type { Store, CardRecord } from '../db/types.js';
import type { UserSettings } from '@stash/card-spec';
import { buildPhraseIndex, matchTier1, type PhraseIndexEntry } from './tier1.js';
import { Tier2Matcher } from './tier2.js';
import { pickCandidates, type Tier3Confirmer } from './tier3.js';
import { CooldownManager } from './cooldown.js';
import { RateLimiter } from '../util/rate-limiter.js';
import { SENSITIVITY_THRESHOLDS } from '../config.js';

export type MatchOutcomeKind = 'fired' | 'near_miss' | 'suppressed_cooldown' | 'none';

export interface MatchOutcome {
  kind: MatchOutcomeKind;
  cardId: string | null;
  card: CardRecord | null;
  matchedPhrase: string | null;
  score: number | null;
  tier: 1 | 2 | 3 | null;
}

/**
 * The three-tier trigger pipeline (plan §2.4), scoped to one WS session.
 *
 * One instance per connection: it owns the cooldown/single-active-card
 * state (which is per-connection per plan §2.5) and is handed the user's
 * cards + settings by the WS layer, which is also responsible for reacting
 * to `{t:'invalidate'}` by calling `reloadCards`.
 */
export class MatchPipeline {
  private phraseIndex: PhraseIndexEntry[] = [];
  private cardsById = new Map<string, CardRecord>();
  private cooldown = new CooldownManager();
  private tier3Limiter: RateLimiter;

  constructor(
    private store: Store,
    private userId: string,
    private tier2: Tier2Matcher,
    private tier3: Tier3Confirmer,
    cards: CardRecord[],
    private settings: UserSettings,
    tier3RateLimit = 6,
  ) {
    this.tier3Limiter = new RateLimiter(tier3RateLimit, 60_000);
    this.reloadCards(cards);
  }

  reloadCards(cards: CardRecord[]): void {
    this.cardsById = new Map(cards.filter((c) => c.enabled && c.status === 'approved').map((c) => [c.id, c]));
    this.phraseIndex = buildPhraseIndex([...this.cardsById.values()]);
  }

  updateSettings(settings: UserSettings): void {
    this.settings = settings;
  }

  dismiss(cardId?: string): void {
    this.cooldown.markDismissed(cardId);
  }

  /** Mark an externally-generated card as shown, applying cooldown so a fixture match doesn't overwrite it. */
  noteExternalCardShown(cardId: string, cooldownMs: number): void {
    this.cooldown.markFired(cardId);
  }

  private thresholds() {
    return SENSITIVITY_THRESHOLDS[this.settings.sensitivity as keyof typeof SENSITIVITY_THRESHOLDS] || SENSITIVITY_THRESHOLDS.balanced;
  }

  private buildOutcome(kind: MatchOutcomeKind, cardId: string | null, matchedPhrase: string | null, score: number | null, tier: 1 | 2 | 3 | null): MatchOutcome {
    return { kind, cardId, card: cardId ? this.cardsById.get(cardId) ?? null : null, matchedPhrase, score, tier };
  }

  /**
   * Tier-1-only, side-effect-free check used to drive prewarm from interim
   * transcripts (plan §2.4: "interim... used only for prewarm"). Unlike
   * `match()`, this NEVER mutates cooldown/active-card state and never
   * escalates to Tier 2/3 — prewarm exists to warm the client's render
   * cache, not to consume a real fire. The final transcript's subsequent
   * `match()` call is what actually applies cooldown.
   */
  peekTier1(window: string): MatchOutcome {
    const hits = matchTier1(window, this.phraseIndex);
    if (hits.length === 0) return this.buildOutcome('none', null, null, null, null);
    const hit = hits[0];
    return this.buildOutcome('fired', hit.cardId, hit.phrase, 1, 1);
  }

  /**
   * Runs the transcript window through Tier 1 -> Tier 2 -> Tier 3 and
   * returns the outcome. Never throws — Tier 2/3 failures degrade to "no
   * match" per plan §2.4 ("never block the pipeline").
   */
  async match(window: string): Promise<MatchOutcome> {
    // TIER 1
    const tier1Hits = matchTier1(window, this.phraseIndex);
    if (tier1Hits.length > 0) {
      const hit = tier1Hits[0];
      const card = this.cardsById.get(hit.cardId);
      if (card && this.cooldown.hasDifferentActiveCard(hit.cardId)) {
        return this.buildOutcome('suppressed_cooldown', hit.cardId, hit.phrase, 1, 1);
      }
      if (card && this.cooldown.canFire(hit.cardId, card.cooldownMs)) {
        this.cooldown.markFired(hit.cardId);
        return this.buildOutcome('fired', hit.cardId, hit.phrase, 1, 1);
      }
      return this.buildOutcome('suppressed_cooldown', hit.cardId, hit.phrase, 1, 1);
    }

    // TIER 2
    const { tFire, tDrop } = this.thresholds();
    const tier2 = await this.tier2.match(this.store, this.userId, window, 3);
    if (tier2.results === null) {
      return this.buildOutcome('none', null, null, null, null); // timeout/failure -> drop
    }
    const top = tier2.results[0];
    if (!top) return this.buildOutcome('none', null, null, null, null);

    if (top.score >= tFire) {
      if (this.cooldown.hasDifferentActiveCard(top.card.id)) {
        return this.buildOutcome('suppressed_cooldown', top.card.id, null, top.score, 2);
      }
      if (this.cooldown.canFire(top.card.id, top.card.cooldownMs)) {
        this.cooldown.markFired(top.card.id);
        return this.buildOutcome('fired', top.card.id, null, top.score, 2);
      }
      return this.buildOutcome('suppressed_cooldown', top.card.id, null, top.score, 2);
    }

    if (top.score < tDrop) {
      return this.buildOutcome('none', null, null, top.score, 2);
    }

    // Ambiguous band [tDrop, tFire) -> escalate to Tier 3.
    if (!this.tier3Limiter.tryConsume(this.userId)) {
      // Rate limited: treat as a near-miss rather than blocking or erroring.
      return this.buildOutcome('near_miss', top.card.id, null, top.score, 2);
    }
    const candidates = pickCandidates(tier2.results, 3);
    const decision = await this.tier3.confirm(window, candidates);
    if (decision.cardId) {
      const card = this.cardsById.get(decision.cardId);
      if (card) {
        if (this.cooldown.hasDifferentActiveCard(card.id)) {
          return this.buildOutcome('suppressed_cooldown', card.id, null, decision.confidence, 3);
        }
        if (this.cooldown.canFire(card.id, card.cooldownMs)) {
          this.cooldown.markFired(card.id);
          return this.buildOutcome('fired', card.id, null, decision.confidence, 3);
        }
        return this.buildOutcome('suppressed_cooldown', card.id, null, decision.confidence, 3);
      }
    }
    return this.buildOutcome('near_miss', top.card.id, null, top.score, 3);
  }
}
