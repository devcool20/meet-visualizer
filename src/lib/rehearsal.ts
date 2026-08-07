/**
 * Session storage for AI-generated cards (D5).
 *
 * Generated cards are ephemeral by default: they are held in sessionStorage
 * for the current browser session, surfaced under "Recent AI cards" on the
 * library page, and only persisted to the card library when the user clicks
 * "Save to library". The session store caps at 5 entries and tolerates
 * disabled/tampered storage (tests, locked-down contexts).
 */

const STORAGE_KEY = 'stash_recent_ai_cards';

export interface RecentAiCard {
  id: string;
  title: string;
  spec: unknown;           // CardSpec, stored as-is
  provider: string;
  createdAt: string;       // ISO timestamp
}

const MAX_ENTRIES = 5;

function readStore(): RecentAiCard[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentAiCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(cards: RecentAiCard[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Non-critical.
  }
}

let idCounter = 0;

export function recordGeneratedCard(card: Omit<RecentAiCard, 'id' | 'createdAt'>): void {
  const entry: RecentAiCard = {
    ...card,
    id: `ai-card-${Date.now()}-${++idCounter}`,
    createdAt: new Date().toISOString(),
  };
  const existing = readStore();
  existing.unshift(entry);
  // Cap at MAX_ENTRIES.
  writeStore(existing.slice(0, MAX_ENTRIES));
}

export function listGeneratedCards(): RecentAiCard[] {
  return readStore();
}

export function clearGeneratedCards(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-critical.
  }
}

export function removeGeneratedCard(id: string): void {
  const existing = readStore();
  writeStore(existing.filter((c) => c.id !== id));
}
