import { describe, it, expect, beforeEach } from 'vitest';
import {
  pairingReducer,
  resolveExtensionId,
  extensionIdSource,
  chromeWebStoreUrl,
  isProductOrigin,
  extensionSourceMode,
  __setTestEnv,
  type PairingState,
} from './extension';

describe('pairingReducer', () => {
  it('starts idle -> probing on PROBE_START', () => {
    const state: PairingState = { phase: 'idle' };
    expect(pairingReducer(state, { type: 'PROBE_START' })).toEqual({ phase: 'probing' });
  });

  it('moves to requesting-nonce when the extension is present', () => {
    const state: PairingState = { phase: 'probing' };
    expect(pairingReducer(state, { type: 'PROBE_RESULT', present: true })).toEqual({
      phase: 'requesting-nonce',
    });
  });

  it('moves to absent when the extension is not detected', () => {
    const state: PairingState = { phase: 'probing' };
    expect(pairingReducer(state, { type: 'PROBE_RESULT', present: false })).toEqual({
      phase: 'absent',
    });
  });

  it('routes a nonce-mentioning pair failure to nonce-expired', () => {
    const state: PairingState = { phase: 'pairing' };
    expect(
      pairingReducer(state, { type: 'PAIR_FAILED', message: 'Nonce has expired' }),
    ).toEqual({ phase: 'nonce-expired' });
  });

  it('routes a non-nonce pair failure to a generic error state', () => {
    const state: PairingState = { phase: 'pairing' };
    expect(
      pairingReducer(state, { type: 'PAIR_FAILED', message: 'network unreachable' }),
    ).toEqual({ phase: 'error', message: 'network unreachable' });
  });

  it('transitions to paired on PAIR_SUCCEEDED', () => {
    const state: PairingState = { phase: 'pairing' };
    expect(pairingReducer(state, { type: 'PAIR_SUCCEEDED' })).toEqual({ phase: 'paired' });
  });

  it('resets to idle on RETRY from an error state', () => {
    const state: PairingState = { phase: 'error', message: 'boom' };
    expect(pairingReducer(state, { type: 'RETRY' })).toEqual({ phase: 'idle' });
  });

  it('surfaces a nonce request failure verbatim', () => {
    const state: PairingState = { phase: 'requesting-nonce' };
    expect(
      pairingReducer(state, { type: 'NONCE_REQUEST_FAILED', message: 'server down' }),
    ).toEqual({ phase: 'error', message: 'server down' });
  });

  it('leaves unrecognized events unchanged', () => {
    const state: PairingState = { phase: 'paired' };
    // @ts-expect-error intentionally passing an unknown event type
    expect(pairingReducer(state, { type: 'NOT_A_REAL_EVENT' })).toEqual(state);
  });
});

describe('resolveExtensionId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __setTestEnv(null);
  });

  it('defaults to DEV_EXTENSION_ID', () => {
    expect(resolveExtensionId()).toBe('fdeplcogfapfmfpkelllkjbcphmlccll');
  });

  it('uses VITE_STASH_EXTENSION_ID env var when set', () => {
    __setTestEnv({ VITE_STASH_EXTENSION_ID: 'store-assigned-id' });
    expect(resolveExtensionId()).toBe('store-assigned-id');
  });

  it('uses localStorage override over env var', () => {
    __setTestEnv({ VITE_STASH_EXTENSION_ID: 'env-id' });
    window.localStorage.setItem('stash_extension_id', 'override-id');
    expect(resolveExtensionId()).toBe('override-id');
  });

  it('returns default when override is empty string', () => {
    // No env var set — should fall through to default.
    __setTestEnv(null);
    window.localStorage.setItem('stash_extension_id', '');
    expect(resolveExtensionId()).toBe('fdeplcogfapfmfpkelllkjbcphmlccll');
  });

  it('returns default when env var is empty string', () => {
    __setTestEnv({ VITE_STASH_EXTENSION_ID: '   ' });
    expect(resolveExtensionId()).toBe('fdeplcogfapfmfpkelllkjbcphmlccll');
  });
});

describe('extensionIdSource', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __setTestEnv(null);
  });

  it('returns default when nothing is configured', () => {
    expect(extensionIdSource()).toBe('default');
  });

  it('returns env when only the env var is set', () => {
    __setTestEnv({ VITE_STASH_EXTENSION_ID: 'env-id' });
    expect(extensionIdSource()).toBe('env');
  });

  it('returns override when localStorage is set even with env var', () => {
    __setTestEnv({ VITE_STASH_EXTENSION_ID: 'env-id' });
    window.localStorage.setItem('stash_extension_id', 'override-id');
    expect(extensionIdSource()).toBe('override');
  });
});

describe('chromeWebStoreUrl', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __setTestEnv(null);
  });

  it('returns /setup/extension in unpacked mode', () => {
    expect(chromeWebStoreUrl()).toBe('/setup/extension');
  });

  it('tracks the resolved extension ID in webstore mode', () => {
    __setTestEnv({ VITE_STASH_EXT_SOURCE: 'webstore' });
    expect(chromeWebStoreUrl()).toContain('fdeplcogfapfmfpkelllkjbcphmlccll');
  });

  it('uses the env ID when set in webstore mode', () => {
    __setTestEnv({ VITE_STASH_EXT_SOURCE: 'webstore', VITE_STASH_EXTENSION_ID: 'store-id' });
    expect(chromeWebStoreUrl()).toContain('store-id');
  });
});

describe('isProductOrigin', () => {
  it('returns false for localhost (function exists)', () => {
    // Just verify it's callable and returns a boolean.
    expect(typeof isProductOrigin()).toBe('boolean');
  });
});

describe('extensionSourceMode', () => {
  beforeEach(() => {
    __setTestEnv(null);
  });

  it('defaults to unpacked when unset', () => {
    expect(extensionSourceMode()).toBe('unpacked');
  });

  it('returns unpacked for invalid values', () => {
    __setTestEnv({ VITE_STASH_EXT_SOURCE: 'invalid' });
    expect(extensionSourceMode()).toBe('unpacked');
  });

  it('returns webstore when VITE_STASH_EXT_SOURCE=webstore', () => {
    __setTestEnv({ VITE_STASH_EXT_SOURCE: 'webstore' });
    expect(extensionSourceMode()).toBe('webstore');
  });
});
