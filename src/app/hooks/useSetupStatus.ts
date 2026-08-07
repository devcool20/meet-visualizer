/**
 * Hook that fetches the live signals needed to derive setup completion (D2):
 * extension probe, AI provider state, Notion connection, and the rehearsed
 * flag. Returns `{ signals, loading, refresh }`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import { hasChromeRuntime, probeExtensionPresence } from '@/lib/extension';
import { hasRehearsed, type SetupSignals } from '@/lib/setup';

export function useSetupStatus() {
  const { getAccessToken } = useAuth();
  const [signals, setSignals] = useState<SetupSignals>({
    extensionPaired: false,
    aiProviderAvailable: false,
    notionConnected: false,
    rehearsed: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient(getAccessToken);

      // Extension probe (non-blocking — short timeout)
      let extensionPaired = false;
      if (hasChromeRuntime()) {
        extensionPaired = await probeExtensionPresence();
      }

      // AI provider state
      let aiProviderAvailable = false;
      try {
        const aiState = await api.getAiProvider();
        aiProviderAvailable = aiState.source !== 'none';
      } catch {
        // Not configured — treat as unavailable.
      }

      // Notion connection
      let notionConnected = false;
      try {
        const notion = await api.getNotionConnection();
        notionConnected = notion !== null;
      } catch {
        // Not connected.
      }

      // Rehearsed flag
      const rehearsed = hasRehearsed();

      setSignals({ extensionPaired, aiProviderAvailable, notionConnected, rehearsed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check setup status');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { signals, loading, error, refresh };
}
