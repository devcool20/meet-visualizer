/**
 * Message-bridge origin/shape checks (plan §3, §5.2).
 *
 * The Meet page is hostile territory: anything running on it can call
 * `window.postMessage`. These tests assert that only messages carrying our
 * exact bridge envelope tag AND a recognised payload shape are ever acted
 * on — everything else must be silently ignored, never throw.
 */
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_SOURCE_TAG,
  isBridgeEnvelope,
  isInjectToPageMsg,
  isPageToInjectMsg,
  wrapBridgeMessage,
} from '../src/shared/messages';
import { isExactProductOrigin, isPairRequest } from '../src/background/pairing';

describe('isBridgeEnvelope', () => {
  it('accepts a correctly wrapped envelope', () => {
    const wrapped = wrapBridgeMessage({ type: 'inject:ready' });
    expect(isBridgeEnvelope(wrapped)).toBe(true);
  });

  it('rejects an object missing the source tag (a hostile page message)', () => {
    expect(isBridgeEnvelope({ payload: { type: 'inject:ready' } })).toBe(false);
  });

  it('rejects an object with the wrong source tag', () => {
    expect(isBridgeEnvelope({ source: 'some-other-extension', payload: {} })).toBe(false);
  });

  it('rejects primitives, arrays, and null', () => {
    expect(isBridgeEnvelope('hello')).toBe(false);
    expect(isBridgeEnvelope(42)).toBe(false);
    expect(isBridgeEnvelope(null)).toBe(false);
    expect(isBridgeEnvelope(undefined)).toBe(false);
    expect(isBridgeEnvelope([])).toBe(false);
  });

  it('rejects an envelope missing the payload key entirely', () => {
    expect(isBridgeEnvelope({ source: BRIDGE_SOURCE_TAG })).toBe(false);
  });
});

describe('isPageToInjectMsg', () => {
  it('accepts every documented message type', () => {
    expect(isPageToInjectMsg({ type: 'card:prewarm', card: {} })).toBe(true);
    expect(isPageToInjectMsg({ type: 'card:show', card: {}, matchedPhrase: 'x', score: 1 })).toBe(true);
    expect(isPageToInjectMsg({ type: 'card:hide', cardId: 'x' })).toBe(true);
    expect(isPageToInjectMsg({ type: 'card:invalidate', cardIds: [] })).toBe(true);
    expect(isPageToInjectMsg({ type: 'settings:update', settings: {} })).toBe(true);
    expect(isPageToInjectMsg({ type: 'token:expired' })).toBe(true);
  });

  it('rejects an unrecognised type', () => {
    expect(isPageToInjectMsg({ type: 'eval', code: 'alert(1)' })).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(isPageToInjectMsg('card:show')).toBe(false);
    expect(isPageToInjectMsg(null)).toBe(false);
  });
});

describe('isInjectToPageMsg', () => {
  it('accepts every documented message type', () => {
    expect(isInjectToPageMsg({ type: 'inject:ready' })).toBe(true);
    expect(isInjectToPageMsg({ type: 'compositor:active', active: true })).toBe(true);
    expect(isInjectToPageMsg({ type: 'compositor:error', message: 'x' })).toBe(true);
  });

  it('rejects an unrecognised type', () => {
    expect(isInjectToPageMsg({ type: 'anything-else' })).toBe(false);
  });
});

describe('isExactProductOrigin (pairing origin check)', () => {
  it('accepts the exact production origin', () => {
    expect(isExactProductOrigin('https://meet-visualizer.vercel.app/dashboard')).toBe(true);
    expect(isExactProductOrigin('https://meet-visualizer.vercel.app/')).toBe(true);
  });

  it('rejects a subdomain of the production origin', () => {
    expect(isExactProductOrigin('https://evil.meet-visualizer.vercel.app/')).toBe(false);
  });

  it('rejects a different scheme', () => {
    expect(isExactProductOrigin('http://meet-visualizer.vercel.app/')).toBe(false);
  });

  it('rejects a spoofed lookalike domain', () => {
    expect(isExactProductOrigin('https://meet-visualizer.vercel.app.evil.com/')).toBe(false);
  });

  it('rejects a subpath trick and any other origin entirely', () => {
    expect(isExactProductOrigin('https://not-the-real-app.example.com/meet-visualizer.vercel.app')).toBe(false);
  });

  it('rejects undefined / malformed URLs without throwing', () => {
    expect(isExactProductOrigin(undefined)).toBe(false);
    expect(isExactProductOrigin('not a url')).toBe(false);
    expect(isExactProductOrigin('')).toBe(false);
  });
});

describe('isPairRequest', () => {
  it('accepts a well-formed pair request', () => {
    expect(isPairRequest({ type: 'pair', nonce: 'abc123' })).toBe(true);
  });

  it('rejects a request missing the nonce', () => {
    expect(isPairRequest({ type: 'pair' })).toBe(false);
  });

  it('rejects a request with the wrong type', () => {
    expect(isPairRequest({ type: 'not-pair', nonce: 'abc' })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isPairRequest('pair')).toBe(false);
    expect(isPairRequest(null)).toBe(false);
  });
});
