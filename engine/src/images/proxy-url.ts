/**
 * HMAC-signed image proxy URLs (plan §3.9).
 *
 * Tokens are opaque capabilities: a valid token proves the engine signed the
 * upstream URL. TTL bounds the window for token reuse. The allow-list is the
 * SSRF boundary.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const IMAGE_HOST_ALLOWLIST = ['upload.wikimedia.org', 'commons.wikimedia.org'] as const;

export function isAllowedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return IMAGE_HOST_ALLOWLIST.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host),
    );
  } catch {
    return false;
  }
}

/** Derive the HMAC key once. */
function hmacKey(): Buffer {
  const key = config.encryptionKey || 'dev-hmac-fallback-key-32bytes!!';
  return Buffer.from(key.slice(0, 32).padEnd(32, 'x'));
}

function buildPayload(upstream: string, expiresAt: number): string {
  return `${expiresAt}:${upstream}`;
}

/**
 * Sign an upstream image URL into an opaque token.
 * @param upstream The original image URL (must be https and on the allow-list).
 * @param now Optional timestamp for deterministic tests.
 */
export function signImageUrl(upstream: string, now: number = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + config.imageProxyTokenTtlSeconds;
  const payload = buildPayload(upstream, expiresAt);
  const hmac = createHmac('sha256', hmacKey()).update(payload).digest('hex');
  const token = Buffer.from(`${expiresAt}:${hmac}:${upstream}`).toString('base64url');
  return token;
}

/**
 * Verify a signed token and return the upstream URL, or null on verification
 * failure or expiry.
 * @param token The opaque token to verify.
 * @param now Optional timestamp for deterministic tests.
 */
export function verifyImageToken(token: string, now: number = Date.now()): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const colonIdx1 = decoded.indexOf(':');
  if (colonIdx1 < 0) return null;
  const expiresAt = parseInt(decoded.slice(0, colonIdx1), 10);
  if (isNaN(expiresAt)) return null;

  const colonIdx2 = decoded.indexOf(':', colonIdx1 + 1);
  if (colonIdx2 < 0) return null;
  const signature = decoded.slice(colonIdx1 + 1, colonIdx2);
  const upstream = decoded.slice(colonIdx2 + 1);

  // Check expiry
  if (Math.floor(now / 1000) > expiresAt) return null;

  // Check allow-list
  if (!isAllowedImageHost(upstream)) return null;

  // Verify HMAC
  const expectedPayload = buildPayload(upstream, expiresAt);
  const expectedHmac = createHmac('sha256', hmacKey()).update(expectedPayload).digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  } catch {
    return null;
  }

  return upstream;
}
