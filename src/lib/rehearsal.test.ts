import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordGeneratedCard, listGeneratedCards, clearGeneratedCards, removeGeneratedCard } from './rehearsal';

describe('rehearsal session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts with an empty list', () => {
    expect(listGeneratedCards()).toEqual([]);
  });

  it('records a card and retrieves it', () => {
    recordGeneratedCard({ title: 'Q2 Revenue', spec: { style: 'glass' }, provider: 'gemini' });
    const cards = listGeneratedCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Q2 Revenue');
    expect(cards[0].provider).toBe('gemini');
    expect(cards[0].id).toBeTruthy();
    expect(cards[0].createdAt).toBeTruthy();
  });

  it('caps at 5 entries', () => {
    for (let i = 0; i < 10; i++) {
      recordGeneratedCard({ title: `Card ${i}`, spec: {}, provider: 'openai' });
    }
    expect(listGeneratedCards()).toHaveLength(5);
    // Most recent first.
    expect(listGeneratedCards()[0].title).toBe('Card 9');
  });

  it('survives reload within a session', () => {
    recordGeneratedCard({ title: 'Persisted', spec: {}, provider: 'anthropic' });
    expect(listGeneratedCards()).toHaveLength(1);
    // sessionStorage persists across navigations within the same tab.
  });

  it('clears all cards', () => {
    recordGeneratedCard({ title: 'A', spec: {}, provider: 'gemini' });
    recordGeneratedCard({ title: 'B', spec: {}, provider: 'openai' });
    clearGeneratedCards();
    expect(listGeneratedCards()).toEqual([]);
  });

  it('removes a single card', () => {
    recordGeneratedCard({ title: 'Keep', spec: {}, provider: 'gemini' });
    recordGeneratedCard({ title: 'Remove', spec: {}, provider: 'openai' });
    const cards = listGeneratedCards();
    // Most recent is first, so cards[0] is 'Remove'.
    removeGeneratedCard(cards[0].id);
    expect(listGeneratedCards()).toHaveLength(1);
    expect(listGeneratedCards()[0].title).toBe('Keep');
  });

  it('tolerates disabled storage', () => {
    const spy = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('locked down');
    });
    expect(listGeneratedCards()).toEqual([]);
    expect(() => recordGeneratedCard({ title: 'X', spec: {}, provider: 'gemini' })).not.toThrow();
    spy.mockRestore();
  });
});
