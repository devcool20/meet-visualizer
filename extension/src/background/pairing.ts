/**
 * Device pairing via `chrome.runtime.onMessageExternal` (plan §2.2).
 *
 * Security-critical: `sender.url` must be checked against the EXACT
 * production origin before trusting anything in the message, because
 * `externally_connectable` only restricts who CAN message us — the plan is
 * explicit that the origin check must still happen inside the handler.
 */
import { ALLOWED_PRODUCT_ORIGINS, ENGINE_ORIGIN } from '../shared/constants.js';

export interface PairRequest {
  type: 'pair';
  nonce: string;
}

export interface PairResult {
  ok: boolean;
  error?: string;
}

export function isExactProductOrigin(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_PRODUCT_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

export function isPairRequest(msg: unknown): msg is PairRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'pair' &&
    typeof (msg as Record<string, unknown>).nonce === 'string'
  );
}

export interface PairDeps {
  fetchImpl: typeof fetch;
  storeToken: (token: string) => Promise<void>;
}

/**
 * Executes the pair exchange: `sender.url` has ALREADY been checked by the
 * caller (kept as a separate exported predicate so it's independently
 * testable) — this function additionally re-validates as defence in depth.
 */
export async function handlePairMessage(
  msg: unknown,
  senderUrl: string | undefined,
  deps: PairDeps,
  engineOrigin: string = ENGINE_ORIGIN,
): Promise<PairResult> {
  if (!isExactProductOrigin(senderUrl)) {
    return { ok: false, error: 'sender origin is not the production origin' };
  }
  if (!isPairRequest(msg)) {
    return { ok: false, error: 'malformed pair request' };
  }

  try {
    const res = await deps.fetchImpl(`${engineOrigin}/api/extension/pair`, {
      method: 'POST',
      credentials: 'omit', // no cookies (plan §2.2) — the nonce is the credential
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: msg.nonce, label: 'chrome-extension' }),
    });
    if (!res.ok) {
      return { ok: false, error: `pairing endpoint returned ${res.status}` };
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) {
      return { ok: false, error: 'pairing response missing token' };
    }
    await deps.storeToken(body.token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
