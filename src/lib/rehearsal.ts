/**
 * Session storage for AI-generated cards (D5).
 *
 * Generated cards are ephemeral by default: they are held in sessionStorage
 * for the current browser session, surfaced under "Recent AI cards" on the
 * library page, and only persisted to the card library when the user clicks
 * "Save to library". The session store caps at 5 entries and tolerates
 * disabled/tampered storage (tests, locked-down contexts).
 */

export interface RecentAiCard {
  id: string;
  title: string;
  spec: unknown;           // CardSpec, stored as-is
  provider: string;
  createdAt: string;       // ISO timestamp
}

const MAX_ENTRIES = 5;

function getStorageKey(userId?: string): string {
  return userId ? `stash_recent_ai_cards_${userId}` : 'stash_recent_ai_cards';
}

function readStore(userId?: string): RecentAiCard[] {
  try {
    const raw = sessionStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentAiCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(cards: RecentAiCard[], userId?: string): void {
  try {
    sessionStorage.setItem(getStorageKey(userId), JSON.stringify(cards));
  } catch {
    // Non-critical.
  }
}

let idCounter = 0;

export function recordGeneratedCard(card: Omit<RecentAiCard, 'id' | 'createdAt'>, userId?: string): void {
  const entry: RecentAiCard = {
    ...card,
    id: `ai-card-${Date.now()}-${++idCounter}`,
    createdAt: new Date().toISOString(),
  };
  const existing = readStore(userId);
  existing.unshift(entry);
  // Cap at MAX_ENTRIES.
  writeStore(existing.slice(0, MAX_ENTRIES), userId);
}

export function listGeneratedCards(userId?: string): RecentAiCard[] {
  return readStore(userId);
}

export function clearGeneratedCards(userId?: string): void {
  try {
    sessionStorage.removeItem(getStorageKey(userId));
  } catch {
    // Non-critical.
  }
}

export function removeGeneratedCard(id: string, userId?: string): void {
  const existing = readStore(userId);
  writeStore(existing.filter((c) => c.id !== id), userId);
}
