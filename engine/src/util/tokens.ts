import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Device pairing tokens (plan §2.2).
 *
 * The token that goes to the extension is a 32-byte random value, base64url
 * encoded. Only its SHA-256 hash is ever stored (`Device.tokenHash`), so a
 * datastore leak does not hand out usable device tokens.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison — avoid timing side channels on hash lookups. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Pairing nonces (plan §2.2). A nonce is a random value; only its hash is
 * stored, mirroring device tokens, so a nonce leak from the datastore alone
 * is not directly usable (though the 60s TTL is the primary defence).
 */
export function generatePairingNonce(): string {
  return randomBytes(24).toString('base64url');
}

export function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex');
}
