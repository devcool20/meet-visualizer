import { describe, it, expect } from 'vitest';
import { pairingReducer, type PairingState } from './extension';

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
