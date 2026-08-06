/**
 * Cross-context constants for Stash Live.
 *
 * Single source of truth for the production origin, the (currently
 * development) extension ID, and the WebSocket engine origin. Every other
 * module imports from here — never hardcode these strings elsewhere (plan
 * §3.8 / open question 6).
 */

/**
 * The Stash Live product origin. `externally_connectable` in the manifest,
 * host_permissions, and the pairing-origin check in the service worker all
 * key off this EXACT string — no wildcard, no subdomain match (plan §2.2).
 */
export const PRODUCT_ORIGIN = 'https://meet-visualizer.vercel.app';

/**
 * The hosted engine's HTTP(S) origin. The WebSocket URL and the
 * `/api/extension/pair` REST call are both derived from this. Point this at a
 * local engine (e.g. `http://localhost:5000`) for development by overriding
 * `ENGINE_ORIGIN_OVERRIDE` in `chrome.storage.local` — see background/config.ts.
 */
export const ENGINE_ORIGIN = 'https://meet-visualizer.vercel.app';

/** Derives a `ws(s)://` URL from an `http(s)://` origin. */
export function toWebSocketUrl(httpOrigin: string, path = '/ws'): string {
  const url = new URL(path, httpOrigin);
  url.protocol = url.protocol === 'https' ? 'wss' : 'ws';
  return url.toString();
}

/**
 * DEVELOPMENT EXTENSION ID — NOT the Chrome Web Store identity.
 *
 * This ID is derived from the RSA keypair committed in `manifest.json`'s
 * `key` field (see `extension/scripts/gen-key.mjs`). Chrome computes the
 * extension ID deterministically from that public key, which is why pairing
 * (an `externally_connectable` flow keyed on a stable ID) needs a `key` at
 * all for an unpacked/dev build.
 *
 * *** REGENERATE THIS BEFORE SUBMITTING TO THE CHROME WEB STORE. ***
 * The Web Store assigns its own ID from the *upload* key, which will not
 * match this value. Update this constant (and the dashboard's pairing
 * target) once that ID is known — do not scatter a second copy elsewhere.
 */
export const DEV_EXTENSION_ID = 'fdeplcogfapfmfpkelllkjbcphmlccll';

/** Client identity string sent in the `hello` frame. */
export const CLIENT_NAME = 'stash-live-extension';

/** Must track manifest.json `version`. Kept here so tests can assert it. */
export const CLIENT_VERSION = '0.1.0';

/** Minimum supported Chrome major version (plan §3.1 — WS keepalive semantics). */
export const MIN_CHROME_VERSION = 116;

/** Heartbeat interval, ms — also what keeps the MV3 service worker alive. */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** Reconnect backoff bounds, ms (plan §2.5: jittered 1s→30s). */
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** Debounce window for interim transcripts (plan §2.4). */
export const INTERIM_DEBOUNCE_MS = 400;

/** Keys used in chrome.storage.local. Centralised to avoid typo drift. */
export const STORAGE_KEYS = {
  deviceToken: 'stash.deviceToken',
  userSettings: 'stash.userSettings',
  engineOriginOverride: 'stash.engineOriginOverride',
} as const;
