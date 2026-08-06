import { describe, it, expect } from 'vitest';
import {
  generateDeviceToken,
  hashToken,
  hashesEqual,
  generatePairingNonce,
  hashNonce,
} from '../util/tokens.js';

describe('device tokens', () => {
  it('generates a sufficiently long, URL-safe token', () => {
    const token = generateDeviceToken();
    expect(token.length).toBeGreaterThanOrEqual(16); // clientMsgSchema requires token.min(16)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates distinct tokens on each call', () => {
    expect(generateDeviceToken()).not.toBe(generateDeviceToken());
  });

  it('hashToken is deterministic for the same input', () => {
    const token = generateDeviceToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('hashToken differs for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('hashesEqual: true for identical hashes, false otherwise', () => {
    const h1 = hashToken('token-a');
    const h2 = hashToken('token-a');
    const h3 = hashToken('token-b');
    expect(hashesEqual(h1, h2)).toBe(true);
    expect(hashesEqual(h1, h3)).toBe(false);
  });

  it('hashesEqual returns false (not throws) for mismatched lengths', () => {
    expect(hashesEqual('ab', 'abcd')).toBe(false);
  });
});

describe('pairing nonces', () => {
  it('generates distinct nonces', () => {
    expect(generatePairingNonce()).not.toBe(generatePairingNonce());
  });

  it('hashNonce is deterministic and differs across inputs', () => {
    const n = generatePairingNonce();
    expect(hashNonce(n)).toBe(hashNonce(n));
    expect(hashNonce(n)).not.toBe(hashNonce(generatePairingNonce()));
  });
});
