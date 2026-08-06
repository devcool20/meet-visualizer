/**
 * Bridges chrome.runtime (background) <-> window.postMessage (MAIN world).
 *
 * The Meet page is hostile territory: any script running on it (Google's own,
 * or anything else that ends up there) can call `window.postMessage`. Every
 * inbound postMessage is checked for (a) matching `window` origin — i.e. it
 * came from this same page, not an iframe — and (b) our bridge envelope tag
 * before its payload is trusted.
 */
import type { BackgroundToContentMsg, PageToInjectMsg } from '../shared/messages.js';
import { isBridgeEnvelope, isInjectToPageMsg, wrapBridgeMessage } from '../shared/messages.js';

export type InjectEventHandler = (msg: { type: 'inject:ready' } | { type: 'compositor:active'; active: boolean } | { type: 'compositor:error'; message: string }) => void;

export function installBridge(onInjectMessage: InjectEventHandler): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return; // reject anything from iframes/other frames
    if (event.origin !== window.location.origin) return;
    if (!isBridgeEnvelope(event.data)) return;
    const payload = event.data.payload;
    if (!isInjectToPageMsg(payload)) return;
    onInjectMessage(payload);
  });
}

/** Forward a validated background→content message to the MAIN-world script. */
export function forwardToInject(msg: BackgroundToContentMsg): void {
  const pageMsg = toPageToInjectMsg(msg);
  if (!pageMsg) return;
  window.postMessage(wrapBridgeMessage(pageMsg), window.location.origin);
}

function toPageToInjectMsg(msg: BackgroundToContentMsg): PageToInjectMsg | null {
  switch (msg.type) {
    case 'card:prewarm':
      return { type: 'card:prewarm', card: msg.card };
    case 'card:show':
      return { type: 'card:show', card: msg.card, matchedPhrase: msg.matchedPhrase, score: msg.score };
    case 'card:hide':
      return { type: 'card:hide', cardId: msg.cardId };
    case 'card:invalidate':
      return { type: 'card:invalidate', cardIds: msg.cardIds };
    case 'settings:update':
      return { type: 'settings:update', settings: msg.settings };
    case 'token:expired':
      return { type: 'token:expired' };
    default:
      return null;
  }
}
