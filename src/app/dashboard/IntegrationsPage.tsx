import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type NotionConnection } from '@/lib/api';

const COMING_SOON = ['Airtable', 'Google Drive', 'Google Sheets', 'Salesforce', 'HubSpot'];

/**
 * Integrations (plan §4.3): Notion connect/disconnect, workspace, selected
 * sources, last sync, manual resync, per-source errors. Everything else is
 * explicit "Coming soon" — the product is honest that v1 is Notion-only.
 */
export default function IntegrationsPage() {
  const { getAccessToken } = useAuth();
  const [connection, setConnection] = useState<NotionConnection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromOnboarding = params.get('from') === 'onboarding';

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getNotionConnection().then((c) => {
      setConnection(c);
      setLoaded(true);
    });
  }, [getAccessToken]);

  async function handleConnect() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    window.location.href = url;
  }

  async function handleResync() {
    setSyncing(true);
    const api = getApiClient(getAccessToken);
    await api.notionSync('default');
    const refreshed = await api.getNotionConnection();
    setConnection(refreshed);
    setSyncing(false);
  }

  async function handleDisconnect() {
    const api = getApiClient(getAccessToken);
    await api.deleteNotionConnection();
    setConnection(null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Integrations
      </h1>

      {fromOnboarding && (
        <div className="rounded-xl p-3 text-sm flex items-center justify-between" style={{ background: 'rgba(251,133,0,0.08)', color: '#5A5550' }}>
          <span>Connect Notion now, or skip — you can always do this later.</span>
          <Button variant="outline" size="sm" onClick={() => navigate('/meet')}>
            Skip to next step
          </Button>
        </div>
      )}

      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">Notion</span>
            {connection ? <Badge>Connected</Badge> : <Badge variant="outline">Not connected</Badge>}
          </div>
          {connection ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={syncing} onClick={handleResync}>
                {syncing ? 'Syncing…' : 'Resync'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            loaded && <Button size="sm" onClick={handleConnect}>Connect</Button>
          )}
        </div>
        {connection && (
          <div className="text-sm space-y-1" style={{ color: '#5A5550' }}>
            <p>Workspace: {connection.workspaceName}</p>
            <p>Sources: {connection.selectedSources.join(', ') || 'none selected'}</p>
            <p>Last synced: {connection.lastSyncedAt ?? 'never'}</p>
            {connection.syncError && <p style={{ color: '#d4183d' }}>Error: {connection.syncError}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {COMING_SOON.map((name) => (
          <div
            key={name}
            className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'rgba(26,21,18,0.03)', color: '#5A5550' }}
          >
            <span className="text-sm">{name}</span>
            <Badge variant="outline">Coming soon</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
