import { describe, it, expect } from 'vitest';
import { SideSelector } from '@stash/card-core';

describe('SideSelector', () => {
  it('starts at right (fallback)', () => {
    const sel = new SideSelector();
    expect(sel.side).toBe('right');
    expect(sel.isConclusive).toBe(false);
  });

  it('a single strongly-left-quiet sample does NOT switch (needs 3 consecutive)', () => {
    const sel = new SideSelector();
    // Left score low (quiet), right score high (busy) — but only 1 sample
    const d = sel.sample(0.01, 0.40, 0);
    expect(d.side).toBe('right');
    expect(d.switched).toBe(false);
    expect(d.conclusive).toBe(true);
  });

  it('3 consecutive left-quiet samples switch to left (cooldown elapsed)', () => {
    const sel = new SideSelector();
    // lastSwitchAtMs starts at 0, so timestamps must exceed COOLDOWN_MS (4000)
    // for the cooldown check to pass on the first switch.
    const t0 = 5000;
    // left=0.01 (quiet), right=0.40 (busy) — right side is busier, so switch to left
    sel.sample(0.01, 0.40, t0);
    sel.sample(0.01, 0.40, t0 + 200);
    const d = sel.sample(0.01, 0.40, t0 + 400);
    expect(d.switched).toBe(true);
    expect(d.side).toBe('left');
  });

  it('a 4th sample within 4s does not switch (cooldown)', () => {
    const sel = new SideSelector();
    // Start with right quiet (0.01) and left busy (0.40) to switch to right-first
    // Actually: start from fallback='right' and switch TO left when left is quieter
    // Wait no — fallback is 'right'. To switch, scores must favor a different side.
    // Left busy (0.40), right quiet (0.01) -> other(left) would be 0.40, current(right) 0.01
    // That's NOT a switch because left is NOT quieter than right.
    // For switch: the OTHER side needs to be quieter.
    // If current is 'right', other is 'left'. Switch happens when score(left) + margin <= score(right)
    // So: left quiet (0.01), right busy (0.40) -> switch to left
    const t0 = 5000;
    sel.sample(0.01, 0.40, t0);
    sel.sample(0.01, 0.40, t0 + 200);
    sel.sample(0.01, 0.40, t0 + 400);
    expect(sel.side).toBe('left');

    // Now try to switch back within cooldown: right quiet (0.01), left busy (0.40)
    const d = sel.sample(0.40, 0.01, t0 + 500);
    expect(d.switched).toBe(false);
    expect(d.side).toBe('left');
  });

  it('after 4s cooldown, the next switch succeeds', () => {
    const sel = new SideSelector();
    const t0 = 5000;
    // Switch to left (left quiet, right busy)
    sel.sample(0.01, 0.40, t0);
    sel.sample(0.01, 0.40, t0 + 200);
    const dSwitch = sel.sample(0.01, 0.40, t0 + 400);
    expect(dSwitch.switched).toBe(true);
    expect(sel.side).toBe('left');
    // lastSwitchAtMs = t0 + 400 = 5400

    // After cooldown (4000ms from 5400 = 9400):
    // Start fresh at t0+5000=10000 (cooldown elapsed)
    // current='left', other='right'. right(0.01)+0.06 <= left(0.40)? YES
    // EMAs are at (0.01, 0.40) from the first 3 samples.
    // First post-cooldown sample uses (0.40, 0.01): emas shift to (0.127, 0.283)
    // other(right,0.283)+0.06 = 0.343 <= current(left,0.127)? NO — streak resets.

    // We need the EMAs to converge so right < left. That takes multiple samples.
    // After 8 samples of (0.40, 0.01), emas should converge to (0.40, 0.01)
    // and the last 3 should produce a streak of 3.
    let switched = false;
    for (let i = 1; i <= 10; i++) {
      const d = sel.sample(0.40, 0.01, t0 + 5000 + i * 200);
      if (d.switched) {
        switched = true;
        expect(d.side).toBe('right');
        break;
      }
    }
    expect(switched).toBe(true);
  });

  it('minSignal inconclusive keeps the side and never switches', () => {
    const sel = new SideSelector();
    // Both scores below minSignal (0.02)
    const d1 = sel.sample(0.005, 0.005, 5000);
    expect(d1.conclusive).toBe(false);
    expect(d1.switched).toBe(false);
    expect(sel.side).toBe('right');

    const d2 = sel.sample(0.005, 0.005, 5200);
    expect(d2.conclusive).toBe(false);
    expect(d2.switched).toBe(false);
    expect(sel.side).toBe('right');
  });

  it('alternating samples never switch', () => {
    const sel = new SideSelector();
    for (let i = 0; i < 20; i++) {
      // Alternate which side is busier
      const left = i % 2 === 0 ? 0.40 : 0.01;
      const right = i % 2 === 0 ? 0.01 : 0.40;
      const d = sel.sample(left, right, 5000 + i * 200);
      // Never get 3 consecutive favoring the same side
      expect(d.switched).toBe(false);
    }
    expect(sel.side).toBe('right'); // never switched
  });

  it('a sequence from left-busy to right-busy switches exactly once', () => {
    const sel = new SideSelector();
    // Start: current='right', other='left'. With left busy (0.40) and right quiet (0.01),
    // other(left,0.40)+0.06 > current(right,0.01), so no switch — stays right.
    let switchCount = 0;
    let t = 5000;

    // Phase 1: left busy, right quiet — stay right (left not quieter than right)
    sel.sample(0.40, 0.01, t); t += 500;
    sel.sample(0.40, 0.01, t); t += 500;
    sel.sample(0.40, 0.01, t); t += 500;
    expect(sel.side).toBe('right');

    // Phase 2: cross over — right is now busier, left quiet.
    // EMAs need to converge from (0.40, 0.01) toward (0.01, 0.40).
    // With alpha=0.30, it takes ~5-6 samples for EMA to flip enough.
    // After ~3 samples: emaLeft≈0.14, emaRight≈0.27.
    // other(left,0.14)+0.06=0.20 <= current(right,0.27)? YES → streak starts.
    // Need 3 consecutive: samples at ~t+6500, 7000, 7500.
    // But the EMA on sample 4 is still (0.283, 0.127) — NOT flipped yet.
    // So it takes more samples. Let's use 8 samples of (0.01, 0.40).
    for (let i = 0; i < 8; i++) {
      const d = sel.sample(0.01, 0.40, t);
      if (d.switched) switchCount++;
      t += 500;
    }
    expect(switchCount).toBe(1);
    expect(sel.side).toBe('left');

    // Phase 3: stay on left (left quiet, right busy — no pressure to switch back)
    for (let i = 0; i < 3; i++) {
      const d = sel.sample(0.01, 0.40, t);
      expect(d.switched).toBe(false);
      t += 500;
    }
    expect(sel.side).toBe('left');
  });

  it('reset() restores right and clears state', () => {
    const sel = new SideSelector();
    // Switch to left (left quiet, right busy)
    sel.sample(0.01, 0.40, 5000);
    sel.sample(0.01, 0.40, 5200);
    sel.sample(0.01, 0.40, 5400);
    expect(sel.side).toBe('left');

    sel.reset();
    expect(sel.side).toBe('right');
    expect(sel.isConclusive).toBe(false);

    // After reset, need fresh samples to switch
    const d = sel.sample(0.01, 0.40, 5500);
    expect(d.switched).toBe(false);
  });

  it('uses custom options when provided', () => {
    const sel = new SideSelector({ fallbackSide: 'left', consecutiveSamples: 1, cooldownMs: 0 });
    expect(sel.side).toBe('left');

    // fallback is 'left', current is 'left', other is 'right'.
    // right(0.40) + 0.06 > left(0.01), so no switch.
    // To switch, the other side needs to be quieter: score(other) + margin <= score(current)
    // other=right, current=left. right(0.01)+0.06 <= left(0.40)? YES
    const d = sel.sample(0.40, 0.01, 0);
    expect(d.switched).toBe(true);
    expect(d.side).toBe('right');
  });
});
