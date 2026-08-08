/**
 * Everything the dashboard needs to know about the Stash Live Chrome
 * extension: its identity, presence detection, and the silent pairing
 * handshake (plan §2.2, §4.2).
 *
 * This is the ONE place the extension ID lives on the dashboard side, as
 * required by the task brief. It must stay in sync with
 * `extension/src/shared/constants.ts`'s `DEV_EXTENSION_ID` — that file is
 * owned by the extension agent and this repo's build does not import across
 * that workspace boundary, so the two constants are kept in sync by hand.
 */

/**
 * DEVELOPMENT extension ID, derived from the RSA keypair committed in
 * `extension/manifest.json`. The Chrome Web Store will assign a different,
 * permanent ID from the *upload* key — update this the moment that ID is
 * known, in this file only.
 */
export const DEV_EXTENSION_ID = 'fdeplcogfapfmfpkelllkjbcphmlccll';

/**
 * Backward-compatible alias. New code should use `resolveExtensionId()`
 * which supports the three-tier resolution (D6): localStorage override →
 * VITE_STASH_EXTENSION_ID env var → DEV_EXTENSION_ID default.
 */
export const EXTENSION_ID = DEV_EXTENSION_ID;

/** Chrome Web Store listing. Opens in a NEW tab per plan §4.2 seam. */
export const CHROME_WEB_STORE_URL = chromeWebStoreUrl();

/** How long we wait for a presence probe / pairing round trip before giving up. */
export const PROBE_TIMEOUT_MS = 1200;
export const PAIR_TIMEOUT_MS = 5000;

/** Minimal shape of the `chrome.runtime` API this module depends on. */
export interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string } | undefined;
}

function getChromeRuntime(): ChromeRuntimeLike | null {
  const w = globalThis as unknown as { chrome?: { runtime?: ChromeRuntimeLike } };
  if (!w.chrome?.runtime?.sendMessage) return null;
  return w.chrome.runtime;
}

/** True only in a Chromium-family browser that exposes `chrome.runtime`. */
export function hasChromeRuntime(): boolean {
  return getChromeRuntime() !== null;
}

// Test-only injection point for env vars.
let __testEnv: Record<string, string> | null = null;

/** @internal — only for tests. */
export function __setTestEnv(env: Record<string, string> | null): void {
  __testEnv = env;
}

function getEnv(key: string): string | undefined {
  if (__testEnv !== null) return __testEnv[key];
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key];
}

/**
 * Three-tier extension ID resolution (D6):
 * 1. `localStorage['stash_extension_id']` — runtime per-browser override
 * 2. `VITE_STASH_EXTENSION_ID` — build-time deploy configuration
 * 3. `DEV_EXTENSION_ID` — the committed default
 */
export function resolveExtensionId(): string {
  try {
    const override = window.localStorage.getItem('stash_extension_id');
    if (override && override.trim()) return override.trim();
  } catch {
    // Fall through.
  }
  const envId = getEnv('VITE_STASH_EXTENSION_ID');
  if (envId && envId.trim()) return envId.trim();
  return DEV_EXTENSION_ID;
}

export type ExtensionIdSource = 'override' | 'env' | 'default';

/** Reports which tier the resolved ID comes from. */
export function extensionIdSource(): ExtensionIdSource {
  try {
    const override = window.localStorage.getItem('stash_extension_id');
    if (override && override.trim()) return 'override';
  } catch {
    // Fall through.
  }
  const envId = getEnv('VITE_STASH_EXTENSION_ID');
  if (envId && envId.trim()) return 'env';
  return 'default';
}

export function setUserExtensionId(id: string): void {
  try {
    window.localStorage.setItem('stash_extension_id', id.trim());
  } catch {
    // Non-critical.
  }
}

export function clearUserExtensionId(): void {
  try {
    window.localStorage.removeItem('stash_extension_id');
  } catch {
    // Non-critical.
  }
}

export type ExtensionSourceMode = 'unpacked' | 'webstore';

export function extensionSourceMode(): ExtensionSourceMode {
  const mode = getEnv('VITE_STASH_EXT_SOURCE');
  if (mode === 'webstore') return 'webstore';
  return 'unpacked';
}

export function extensionZipUrl(): string | undefined {
  return getEnv('VITE_STASH_EXT_ZIP_URL') || undefined;
}

export function chromeWebStoreUrl(): string {
  return 'https://chromewebstore.google.com/detail/stash-live/' + resolveExtensionId();
}

/** The expected product origin from env, or a dev fallback. */
export function expectedProductOrigin(): string {
  return getEnv('VITE_STASH_PRODUCT_ORIGIN') || 'https://meet-visualizer.vercel.app';
}

/** The engine origin, derived from the API base URL. */
export function engineOrigin(): string {
  const base = getEnv('VITE_STASH_API_URL');
  if (base) {
    try {
      const url = new URL(base);
      return url.origin;
    } catch {
      return base;
    }
  }
  if (getEnv('DEV')) return 'http://localhost:5000';
  return '';
}

export function isProductOrigin(): boolean {
  return window.location.origin === expectedProductOrigin();
}

function sendMessageWithTimeout(
  message: unknown,
  timeoutMs: number,
  runtime: ChromeRuntimeLike,
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);

    try {
      runtime.sendMessage(resolveExtensionId(), message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // chrome.runtime.lastError is how "no such extension / no listener"
        // surfaces — it is not thrown, so we must check it explicitly.
        const lastError = runtime.lastError?.message;
        if (lastError) {
          resolve({ ok: false, error: lastError });
          return;
        }
        resolve({ ok: true, response });
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Presence probe. The SAME `chrome.runtime.sendMessage` call used for
 * pairing doubles as the "is the extension installed?" check (plan §2.2,
 * §4.2): if nothing is listening on the resolved extension ID, Chrome reports
 * `lastError` and we treat that as "not installed" rather than an error to
 * surface to the user.
 */
export async function probeExtensionPresence(
  deps: { runtime?: ChromeRuntimeLike; timeoutMs?: number } = {},
): Promise<boolean> {
  const runtime = deps.runtime ?? getChromeRuntime();
  if (!runtime) return false;
  const result = await sendMessageWithTimeout({ type: 'probe' }, deps.timeoutMs ?? PROBE_TIMEOUT_MS, runtime);
  return result.ok;
}

export interface PairResponse {
  ok: boolean;
  error?: string;
}

/**
 * Fires the silent pairing message the extension's service worker expects
 * (plan §2.2 step 2): `chrome.runtime.sendMessage(EXT_ID, {type:'pair', nonce})`.
 * Zero user input — the nonce alone is the credential.
 */
export async function sendPairMessage(
  nonce: string,
  deps: { runtime?: ChromeRuntimeLike; timeoutMs?: number } = {},
): Promise<PairResponse> {
  const runtime = deps.runtime ?? getChromeRuntime();
  if (!runtime) {
    return { ok: false, error: 'extension_not_present' };
  }
  const result = await sendMessageWithTimeout(
    { type: 'pair', nonce },
    deps.timeoutMs ?? PAIR_TIMEOUT_MS,
    runtime,
  );
  if (!result.ok) return { ok: false, error: result.error ?? 'no_response' };
  const response = result.response as PairResponse | undefined;
  if (!response || typeof response.ok !== 'boolean') {
    return { ok: false, error: 'malformed_response' };
  }
  return response;
}

/* -------------------------------------------------------------------- */
/* Pairing state machine — pure, so it is unit-testable without a real   */
/* extension, a real network, or real timers (plan §4.2 seams).          */
/* -------------------------------------------------------------------- */

export type PairingState =
  | { phase: 'idle' }
  | { phase: 'probing' }
  | { phase: 'absent' } // no extension detected — show "Add to Chrome"
  | { phase: 'requesting-nonce' }
  | { phase: 'pairing' }
  | { phase: 'paired' }
  | { phase: 'nonce-expired' } // backend rejected the nonce — retry
  | { phase: 'error'; message: string };

export type PairingEvent =
  | { type: 'PROBE_START' }
  | { type: 'PROBE_RESULT'; present: boolean }
  | { type: 'NONCE_REQUESTED' }
  | { type: 'NONCE_RECEIVED' }
  | { type: 'NONCE_REQUEST_FAILED'; message: string }
  | { type: 'PAIR_SUCCEEDED' }
  | { type: 'PAIR_FAILED'; message: string }
  | { type: 'RETRY' };

/**
 * Deterministic reducer for the pairing flow. Kept separate from the React
 * hook that drives it so the extension-absent and nonce-expired branches
 * (explicitly called out in the brief) are covered by plain unit tests.
 */
export function pairingReducer(state: PairingState, event: PairingEvent): PairingState {
  switch (event.type) {
    case 'PROBE_START':
      return { phase: 'probing' };
    case 'PROBE_RESULT':
      return event.present ? { phase: 'requesting-nonce' } : { phase: 'absent' };
    case 'NONCE_REQUESTED':
      return { phase: 'requesting-nonce' };
    case 'NONCE_RECEIVED':
      return { phase: 'pairing' };
    case 'NONCE_REQUEST_FAILED':
      return { phase: 'error', message: event.message };
    case 'PAIR_SUCCEEDED':
      return { phase: 'paired' };
    case 'PAIR_FAILED':
      // A nonce is single-use and 60s-lived (plan §2.2): a failure this late
      // in the flow is most often the nonce having expired between issuance
      // and the extension's fetch, so route it to a distinct retryable
      // state rather than a generic error.
      return event.message.toLowerCase().includes('nonce')
        ? { phase: 'nonce-expired' }
        : { phase: 'error', message: event.message };
    case 'RETRY':
      return { phase: 'idle' };
    default:
      return state;
  }
}
