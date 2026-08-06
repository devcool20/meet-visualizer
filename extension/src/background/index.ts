/**
 * Service worker entry point — the WebSocket owner (plan §3.1).
 *
 * Responsibilities:
 *  - own the EngineSocket, kept alive by its 20s heartbeat
 *  - load/refresh the device token from chrome.storage.local
 *  - route show/prewarm/hide/invalidate to the active meeting tab
 *  - handle token refresh (`config` frame) and `token_expired` errors
 *  - own pairing via onMessageExternal
 *  - relay transcript/dismiss from the content script onto the socket
 *  - serve popup state queries
 */
import type { ServerMsg, UserSettings } from '@stash/card-spec';
import { DEFAULT_USER_SETTINGS } from '@stash/card-spec';
import {
  CLIENT_NAME,
  CLIENT_VERSION,
  ENGINE_ORIGIN,
  STORAGE_KEYS,
  toWebSocketUrl,
} from '../shared/constants.js';
import type { BackgroundToContentMsg, ContentToBackgroundMsg, ConnectionStatus } from '../shared/messages.js';
import { EngineSocket, type EngineSocketDeps, type MinimalSocket } from './engine-socket.js';
import { handlePairMessage, isExactProductOrigin } from './pairing.js';

let deviceToken: string | null = null;
let userSettings: UserSettings = DEFAULT_USER_SETTINGS;
let connectionStatus: ConnectionStatus = { phase: 'disconnected' };
let activeMeetingTabId: number | null = null;

async function loadToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.deviceToken);
  return (stored[STORAGE_KEYS.deviceToken] as string | undefined) ?? null;
}

async function storeToken(token: string): Promise<void> {
  deviceToken = token;
  await chrome.storage.local.set({ [STORAGE_KEYS.deviceToken]: token });
}

const realSocketDeps: EngineSocketDeps = {
  createSocket: (url: string) => new WebSocket(url) as unknown as MinimalSocket,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  random: () => Math.random(),
};

let engineSocket: EngineSocket | null = null;

function broadcastToActiveTab(msg: BackgroundToContentMsg): void {
  if (activeMeetingTabId === null) return;
  chrome.tabs.sendMessage(activeMeetingTabId, msg).catch(() => {
    // Tab may have navigated away or closed; nothing to recover here.
  });
}

function handleServerMsg(msg: ServerMsg): void {
  switch (msg.t) {
    case 'ready':
      connectionStatus = { phase: 'connected', cardCount: msg.cardCount };
      break;
    case 'config':
      userSettings = msg.settings;
      if (msg.token) void storeToken(msg.token);
      broadcastToActiveTab({ type: 'settings:update', settings: userSettings });
      break;
    case 'prewarm':
      broadcastToActiveTab({ type: 'card:prewarm', card: msg.card });
      break;
    case 'show':
      broadcastToActiveTab({ type: 'card:show', card: msg.card, matchedPhrase: msg.matchedPhrase, score: msg.score });
      break;
    case 'hide':
      broadcastToActiveTab({ type: 'card:hide', cardId: msg.cardId });
      break;
    case 'invalidate':
      broadcastToActiveTab({ type: 'card:invalidate', cardIds: msg.cardIds });
      break;
    case 'error':
      if (msg.code === 'token_expired') {
        broadcastToActiveTab({ type: 'token:expired' });
        // Reconnecting will request a fresh token via the `config` frame on
        // the next successful `hello`. The socket layer already handles
        // reconnection; nothing else to do here — degrade silently (§3.7).
      }
      connectionStatus = { phase: 'error', code: msg.code, message: msg.message };
      break;
    case 'pong':
      break;
  }
}

function ensureSocket(): EngineSocket {
  if (engineSocket) return engineSocket;
  const url = toWebSocketUrl(ENGINE_ORIGIN);
  engineSocket = new EngineSocket(
    url,
    () => ({ t: 'hello', token: deviceToken ?? '', client: CLIENT_NAME, version: CLIENT_VERSION }),
    realSocketDeps,
    {
      onServerMsg: handleServerMsg,
      onStatusChange: (status) => {
        connectionStatus =
          status === 'connected'
            ? { phase: 'connected', cardCount: 0 }
            : status === 'connecting'
              ? { phase: 'connecting' }
              : { phase: 'disconnected' };
        broadcastToActiveTab({ type: 'conn:status', status: connectionStatus });
      },
      onInvalidFrame: (_raw, error) => {
        console.warn('[stash-live] dropped malformed server frame:', error);
      },
    },
  );
  return engineSocket;
}

async function startConnection(): Promise<void> {
  deviceToken = await loadToken();
  if (!deviceToken) return; // not paired yet — nothing to connect with
  ensureSocket().connect();
}

/* ------------------------------------------------------------------ */
/* Pairing — externally_connectable, exact production-origin only.     */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isExactProductOrigin(sender.url)) {
    // Do not respond at all to a non-production sender beyond this — the
    // manifest's externally_connectable.matches already restricts who can
    // reach this listener, but plan §2.2 requires re-checking here too.
    sendResponse({ ok: false, error: 'origin not allowed' });
    return;
  }
  handlePairMessage(message, sender.url, { fetchImpl: fetch, storeToken }).then((result) => {
    sendResponse(result);
    if (result.ok) void startConnection();
  });
  return true; // keep the message channel open for the async response
});

/* ------------------------------------------------------------------ */
/* Content-script <-> background messaging                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message: ContentToBackgroundMsg, sender, sendResponse) => {
  if (sender.tab?.id !== undefined) {
    activeMeetingTabId = sender.tab.id;
  }
  switch (message?.type) {
    case 'transcript':
      engineSocket?.send({ t: 'transcript', text: message.text, final: message.final, ts: message.ts });
      break;
    case 'dismiss':
      engineSocket?.send({ t: 'dismiss', cardId: message.cardId });
      break;
    case 'popup:query-state':
      sendResponse({
        paired: !!deviceToken,
        connectionStatus,
        settings: userSettings,
      });
      return true;
    case 'hud:ready':
      break;
    default:
      break;
  }
  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeMeetingTabId === tabId) activeMeetingTabId = null;
});

/* ------------------------------------------------------------------ */
/* Startup                                                              */
/* ------------------------------------------------------------------ */

chrome.runtime.onStartup.addListener(() => void startConnection());
chrome.runtime.onInstalled.addListener(() => void startConnection());

// Also attempt on script (re)load — MV3 SWs are re-evaluated frequently, and
// the heartbeat is what actually keeps this instance alive between events.
void startConnection();

export {}; // ensure this file is treated as a module by the bundler
