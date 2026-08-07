/**
 * Hysteresis + dwell/cooldown state machine for adaptive card side placement
 * (plan §"Side selector").
 *
 * Prevents flickering under camera noise and auto-exposure hunting through
 * three independent brakes — EMA smoothing, a switch margin, and a
 * consecutive-sample requirement — plus a hard cooldown timer.
 *
 * Falls back to `'right'` when inconclusive, matching today's fixed placement.
 */
export type CardSide = 'left' | 'right';

export interface SideSelectorOptions {
  emaAlpha: number;
  switchMargin: number;
  minSignal: number;
  consecutiveSamples: number;
  cooldownMs: number;
  fallbackSide: CardSide;
}

export const SIDE_SELECTOR_DEFAULTS: SideSelectorOptions = {
  emaAlpha: 0.30,
  switchMargin: 0.06,
  minSignal: 0.02,
  consecutiveSamples: 3,
  cooldownMs: 4000,
  fallbackSide: 'right',
};

export interface SideDecision {
  side: CardSide;
  switched: boolean;
  conclusive: boolean;
  leftScore: number;
  rightScore: number;
}

export class SideSelector {
  private emaLeft: number | null = null;
  private emaRight: number | null = null;
  private currentSide: CardSide;
  private consecutiveStreak = 0;
  private lastSwitchAtMs = 0;
  private opts: SideSelectorOptions;

  constructor(opts?: Partial<SideSelectorOptions>) {
    this.opts = { ...SIDE_SELECTOR_DEFAULTS, ...opts };
    this.currentSide = this.opts.fallbackSide;
  }

  get side(): CardSide {
    return this.currentSide;
  }

  get isConclusive(): boolean {
    return this.emaLeft !== null && this.emaRight !== null &&
      Math.max(this.emaLeft, this.emaRight) >= this.opts.minSignal;
  }

  /**
   * Reset the selector back to its initial state.
   * Optionally set a starting side (defaults to fallbackSide).
   */
  reset(side?: CardSide): void {
    this.emaLeft = null;
    this.emaRight = null;
    this.currentSide = side ?? this.opts.fallbackSide;
    this.consecutiveStreak = 0;
    this.lastSwitchAtMs = 0;
  }

  /**
   * Process a new sample pair. Returns the decision for this sample.
   *
   * Algorithm per spec:
   * 1. Update EMAs.
   * 2. If both sides below minSignal -> inconclusive (reset counter, keep side).
   * 3. Compute if the other side is quieter by margin.
   * 4. Switch only when consecutive samples agree AND cooldown has elapsed.
   */
  sample(left: number, right: number, nowMs: number): SideDecision {
    const alpha = this.opts.emaAlpha;

    // Step 1: update EMAs
    this.emaLeft = this.emaLeft === null ? left : this.emaLeft + alpha * (left - this.emaLeft);
    this.emaRight = this.emaRight === null ? right : this.emaRight + alpha * (right - this.emaRight);

    // Step 2: check min signal
    if (Math.max(this.emaLeft, this.emaRight) < this.opts.minSignal) {
      this.consecutiveStreak = 0;
      return {
        side: this.currentSide,
        switched: false,
        conclusive: false,
        leftScore: this.emaLeft,
        rightScore: this.emaRight,
      };
    }

    // Step 3: check if the other side is quieter by the margin
    const other = this.currentSide === 'right' ? 'left' : 'right';
    const otherScore = other === 'left' ? this.emaLeft : this.emaRight;
    const currentScore = other === 'left' ? this.emaRight : this.emaLeft;

    if (otherScore + this.opts.switchMargin <= currentScore) {
      this.consecutiveStreak++;
    } else {
      this.consecutiveStreak = 0;
    }

    // Step 4: switch when threshold met AND cooldown elapsed
    let switched = false;
    if (
      this.consecutiveStreak >= this.opts.consecutiveSamples &&
      nowMs - this.lastSwitchAtMs >= this.opts.cooldownMs
    ) {
      this.currentSide = other;
      this.lastSwitchAtMs = nowMs;
      this.consecutiveStreak = 0;
      switched = true;
    }

    return {
      side: this.currentSide,
      switched,
      conclusive: true,
      leftScore: this.emaLeft,
      rightScore: this.emaRight,
    };
  }
}
