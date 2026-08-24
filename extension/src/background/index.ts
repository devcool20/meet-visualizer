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

/**
 * Settings survive service-worker restarts: the engine's `config` frame is
 * persisted here, and this cached copy is what a freshly-restarted SW (and
 * any Meet tab that opens before the next `config` frame arrives) starts
 * from. Without this, a mid-call SW eviction would silently reset the
 * trigger mode and other settings until the next settings change.
 */
async function loadSettings(): Promise<UserSettings> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.userSettings);
    const s = stored[STORAGE_KEYS.userSettings] as UserSettings | undefined;
    if (s && typeof s === 'object' && typeof s.triggerMode === 'string') {
      return { ...DEFAULT_USER_SETTINGS, ...s };
    }
  } catch {
    // storage unavailable (e.g. tests) — defaults are fine
  }
  return DEFAULT_USER_SETTINGS;
}

async function storeSettings(settings: UserSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.userSettings]: settings });
  } catch {
    // non-fatal — in-memory copy is still authoritative for this SW lifetime
  }
}

/**
 * Resolves the engine origin for this connection. The compiled-in default is
 * the hosted engine; a value in chrome.storage under
 * `stash.engineOriginOverride` (e.g. `http://localhost:5000` for local
 * development) takes precedence. Vercel cannot host WebSockets, so pointing
 * the socket at a non-engine origin simply never connects — the override is
 * how development and deploys repoint it without rebuilding.
 */
async function resolveEngineOrigin(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.engineOriginOverride);
    const override = stored[STORAGE_KEYS.engineOriginOverride] as string | undefined;
    if (override && typeof override === 'string' && /^https?:\/\//.test(override.trim())) {
      return override.trim().replace(/\/+$/, '');
    }
  } catch {
    // fall through to the compiled-in default
  }
  return ENGINE_ORIGIN;
}

const realSocketDeps: EngineSocketDeps = {
  createSocket: (url: string) => new WebSocket(url) as unknown as MinimalSocket,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  random: () => Math.random(),
};

let engineSocket: EngineSocket | null = null;
let engineSocketOrigin: string | null = null;

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
      void storeSettings(userSettings);
      if (msg.token) void storeToken(msg.token);
      broadcastToActiveTab({ type: 'settings:update', settings: userSettings });
      break;
    case 'prewarm':
      broadcastToActiveTab({ type: 'card:prewarm', card: msg.card });
      break;
    case 'show':
      broadcastToActiveTab({ type: 'card:show', card: msg.card, matchedPhrase: msg.matchedPhrase, score: msg.score, captureId: msg.captureId });
      break;
    case 'generating':
      broadcastToActiveTab({ type: 'card:generating', captureId: msg.captureId });
      break;
    case 'generate_failed':
      broadcastToActiveTab({ type: 'card:error', captureId: msg.captureId, code: msg.code, message: msg.message });
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

function ensureSocket(origin: string): EngineSocket {
  if (engineSocket && engineSocketOrigin === origin) return engineSocket;
  // Origin changed (or first connect): drop any previous socket so the new
  // origin takes effect. The old instance's timers are GC'd with it.
  engineSocket = new EngineSocket(
    toWebSocketUrl(origin),
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
  engineSocketOrigin = origin;
  return engineSocket;
}

async function startConnection(): Promise<void> {
  deviceToken = await loadToken();
  if (!deviceToken) {
    // Default fallback token for local / dev use
    deviceToken = 'local-dev-device-token-12345';
    await storeToken(deviceToken);
  }
  userSettings = await loadSettings();
  const origin = await resolveEngineOrigin();
  ensureSocket(origin).connect();
}

/* ------------------------------------------------------------------ */
/* Pairing — externally_connectable, exact production-origin only.     */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isExactProductOrigin(sender.url)) {
    sendResponse({ ok: false, error: 'origin not allowed' });
    return;
  }
  resolveEngineOrigin().then((engineUrl) => {
    return handlePairMessage(
      message,
      sender.url,
      { fetchImpl: globalThis.fetch.bind(globalThis), storeToken },
      engineUrl,
    );
  }).then((result) => {
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
    case 'capture:generate': {
      if (!engineSocket || !engineSocket.isConnected) {
        // Ensure connection and queue/send
        void startConnection().then(() => {
          const sent = engineSocket?.send({ t: 'generate', captureId: message.captureId, text: message.text, ts: message.ts });
          if (!sent) {
            broadcastToActiveTab({
              type: 'card:error',
              captureId: message.captureId,
              code: 'internal',
              message: 'Connecting to engine… Please retry in a second',
            });
          }
        });
      } else {
        engineSocket.send({ t: 'generate', captureId: message.captureId, text: message.text, ts: message.ts });
      }
      break;
    }
    case 'capture:cancel':
      // No wire-level cancel frame exists; this is informational for local state
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
      // A meeting tab just came up. Push the CURRENT settings immediately —
      // the content script starts in the default mode and must not wait for
      // an unrelated settings change to learn the user's actual triggerMode.
      if (sender.tab?.id !== undefined) {
        chrome.tabs
          .sendMessage(sender.tab.id, { type: 'settings:update', settings: userSettings })
          .catch(() => {
            // Tab navigated away mid-handshake; nothing to recover.
          });
      }
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
