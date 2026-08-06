/**
 * Internal message contracts used ONLY inside the extension's own contexts:
 * background ↔ content script (chrome.runtime messaging) and content script
 * ↔ MAIN-world injected script (window.postMessage).
 *
 * These are NOT the frozen wire contract in `@stash/card-spec` — that one
 * crosses the WebSocket. These wrap it for the extra hops it makes after
 * arriving at the service worker. Every message that can be forged by a
 * hostile page (i.e. everything received via `window.postMessage`, since the
 * Meet page's own script can call `postMessage` too) MUST be validated with
 * the guards below before use.
 */
import type { CardSpec, ServerErrorCode, UserSettings } from '@stash/card-spec';

/** Tag stamped on every postMessage payload so we never act on a stray page message. */
export const BRIDGE_SOURCE_TAG = 'stash-live-bridge-v1';

/* ------------------------------------------------------------------ */
/* background  <->  content script  (chrome.runtime, JSON-serialised)  */
/* ------------------------------------------------------------------ */

/** Sent from background to the active meeting tab's content script. */
export type BackgroundToContentMsg =
  | { type: 'card:prewarm'; card: CardSpec }
  | { type: 'card:show'; card: CardSpec; matchedPhrase: string; score: number }
  | { type: 'card:hide'; cardId: string }
  | { type: 'card:invalidate'; cardIds: string[] }
  | { type: 'conn:status'; status: ConnectionStatus }
  | { type: 'settings:update'; settings: UserSettings }
  | { type: 'token:expired' };

/** Sent from content script to background. */
export type ContentToBackgroundMsg =
  | { type: 'transcript'; text: string; final: boolean; ts: number }
  | { type: 'dismiss'; cardId?: string }
  | { type: 'hud:ready' }
  | { type: 'popup:query-state' };

export type ConnectionStatus =
  | { phase: 'disconnected' }
  | { phase: 'connecting' }
  | { phase: 'connected'; cardCount: number }
  | { phase: 'error'; code: ServerErrorCode; message: string };

/* ------------------------------------------------------------------ */
/* content script (ISOLATED)  <->  injected script (MAIN world)        */
/* ------------------------------------------------------------------ */

export type PageToInjectMsg =
  | { type: 'card:prewarm'; card: CardSpec }
  | { type: 'card:show'; card: CardSpec; matchedPhrase: string; score: number }
  | { type: 'card:hide'; cardId: string }
  | { type: 'card:invalidate'; cardIds: string[] }
  | { type: 'settings:update'; settings: UserSettings }
  | { type: 'token:expired' };

export type InjectToPageMsg =
  | { type: 'inject:ready' }
  | { type: 'compositor:active'; active: boolean }
  | { type: 'compositor:error'; message: string };

interface BridgeEnvelope<T> {
  source: typeof BRIDGE_SOURCE_TAG;
  payload: T;
}

export function wrapBridgeMessage<T>(payload: T): BridgeEnvelope<T> {
  return { source: BRIDGE_SOURCE_TAG, payload };
}

/**
 * Narrow an arbitrary `MessageEvent.data` down to a bridge envelope. This is
 * the FIRST line of defence against a hostile page: `meet.google.com` runs
 * Google's own script, which can (accidentally or not) call
 * `window.postMessage` with anything. We only accept objects carrying our
 * exact source tag; everything else is silently ignored.
 */
export function isBridgeEnvelope(data: unknown): data is BridgeEnvelope<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).source === BRIDGE_SOURCE_TAG &&
    'payload' in (data as Record<string, unknown>)
  );
}

const PAGE_TO_INJECT_TYPES = new Set<PageToInjectMsg['type']>([
  'card:prewarm',
  'card:show',
  'card:hide',
  'card:invalidate',
  'settings:update',
  'token:expired',
]);

/** Strict shape check for a payload claiming to be a `PageToInjectMsg`. */
export function isPageToInjectMsg(payload: unknown): payload is PageToInjectMsg {
  if (typeof payload !== 'object' || payload === null) return false;
  const type = (payload as Record<string, unknown>).type;
  return typeof type === 'string' && PAGE_TO_INJECT_TYPES.has(type as PageToInjectMsg['type']);
}

const INJECT_TO_PAGE_TYPES = new Set<InjectToPageMsg['type']>([
  'inject:ready',
  'compositor:active',
  'compositor:error',
]);

export function isInjectToPageMsg(payload: unknown): payload is InjectToPageMsg {
  if (typeof payload !== 'object' || payload === null) return false;
  const type = (payload as Record<string, unknown>).type;
  return typeof type === 'string' && INJECT_TO_PAGE_TYPES.has(type as InjectToPageMsg['type']);
}
