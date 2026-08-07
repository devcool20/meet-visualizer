/**
 * Shared hook encapsulating the pairing flow: probe, nonce request, send
 * pair message. Used by `/setup/extension`, `/rehearse`, and the
 * DashboardShell chip.
 *
 * Wraps `pairingReducer`, `probeExtensionPresence`, `sendPairMessage`, and
 * `requestPairingNonce`. Supports injection for testing.
 */

import { useCallback, useReducer } from 'react';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import {
  pairingReducer,
  probeExtensionPresence,
  sendPairMessage,
  type PairingState,
  type ChromeRuntimeLike,
} from '@/lib/extension';

export type { PairingState };

export interface UseExtensionPairingOptions {
  runtime?: ChromeRuntimeLike;
}

export function useExtensionPairing(opts: UseExtensionPairingOptions = {}) {
  const { getAccessToken } = useAuth();
  const [state, dispatch] = useReducer(pairingReducer, { phase: 'idle' });

  const probe = useCallback(async () => {
    dispatch({ type: 'PROBE_START' });
    const present = await probeExtensionPresence({ runtime: opts.runtime });
    dispatch({ type: 'PROBE_RESULT', present });
    if (present) {
      await pair();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken, opts.runtime]);

  const pair = useCallback(async () => {
    dispatch({ type: 'NONCE_REQUESTED' });
    try {
      const api = getApiClient(getAccessToken);
      const { nonce } = await api.requestPairingNonce();
      dispatch({ type: 'NONCE_RECEIVED' });
      const result = await sendPairMessage(nonce, { runtime: opts.runtime });
      if (result.ok) {
        dispatch({ type: 'PAIR_SUCCEEDED' });
      } else {
        dispatch({ type: 'PAIR_FAILED', message: result.error ?? 'pairing failed' });
      }
    } catch (err) {
      dispatch({
        type: 'NONCE_REQUEST_FAILED',
        message: err instanceof Error ? err.message : 'network error',
      });
    }
  }, [getAccessToken, opts.runtime]);

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  return { state, probe, pair, retry };
}
