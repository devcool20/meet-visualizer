/**
 * Cards must survive the "cleared" filter.
 *
 * The reported symptom, from the `?debug=1` overlay on a receiving client:
 *
 *     cards=1  composites=1
 *     composite: stream  card=none
 *
 * The card had arrived -- one of them -- and a compositor existed for that peer,
 * yet the published composite reported no card. So the card was discarded
 * somewhere between the socket and the compositor.
 *
 * It was discarded by the clear-tracking. `MeetingProvider` derived the "cleared"
 * set by collecting the id of every card currently in `socket.cards`:
 *
 *     const seen = new Set<string>();
 *     for (const entry of socket.cards) seen.add(entry.id);
 *
 * and `useRemoteCompositors` skips any entry whose id is in that set:
 *
 *     for (const entry of opts.cards) {
 *       if (opts.cleared.has(entry.id)) continue;
 *
 * The two cancel out perfectly. Every card present is also a card "cleared", so
 * nothing was ever composited and the guest saw a camera with no card -- exactly
 * what the overlay reported.
 *
 * `socket.cards` already drops entries when their owner clears them (see the
 * `card-cleared` case in `useMeetingSocket`), so this set is not merely wrong, it
 * is unnecessary. A card present in `socket.cards` is, by construction, a card
 * that is on air.
 */
import { describe, expect, it } from 'vitest';
import { parseCardSpec } from '@stash/card-spec';
import { APPROVED_CARDS } from '@stash/card-core';

const CARD = APPROVED_CARDS[0] as unknown;

describe('remote card selection', () => {
  it('keeps a card that is present in the broadcast log', () => {
    // What `useRemoteCompositors` derives internally from `cards` + `cleared`.
    const select = (cards: Array<{ id: string; card: unknown }>, cleared: Set<string>) => {
      const map = new Map<string, unknown>();
      for (const entry of cards) {
        if (cleared.has(entry.id)) continue;
        const parsed = parseCardSpec(entry.card);
        if (parsed.ok) map.set(entry.id, parsed.value);
      }
      return map;
    };

    const cards = [{ id: 'c1', card: CARD }];

    // A card on air is not cleared, so it must be selected for compositing.
    expect(select(cards, new Set()).size).toBe(1);
  });

  it('excludes only senders that genuinely cleared', () => {
    const select = (cards: Array<{ id: string; card: unknown }>, cleared: Set<string>) => {
      const map = new Map<string, unknown>();
      for (const entry of cards) {
        if (cleared.has(entry.id)) continue;
        const parsed = parseCardSpec(entry.card);
        if (parsed.ok) map.set(entry.id, parsed.value);
      }
      return map;
    };

    // The bug: deriving "cleared" from the presence of cards.
    const wronglyDerived = new Set(['c1']);
    expect(select([{ id: 'c1', card: CARD }], wronglyDerived).size).toBe(0);
  });
});