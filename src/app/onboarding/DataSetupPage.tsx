/**
 * `/setup/data` — step 3 of 5 (plan §5.5).
 *
 * Two cards: AI provider config (priority, recommended) and Notion (optional).
 * Step is satisfied when *either* an AI provider is available *or* Notion is connected.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type NotionConnection } from '@/lib/api';
import { AiProviderPanel } from '@/app/dashboard/AiProviderPanel';
import { saveSetupStep } from '@/lib/setup';
import { OnboardingShell } from './OnboardingShell';

export default function DataSetupPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [notion, setNotion] = useState<NotionConnection | null | 'loading'>('loading');
  const [aiProviderSource, setAiProviderSource] = useState<string | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getNotionConnection().then(setNotion).catch(() => setNotion(null));
  }, [getAccessToken]);

  function handleAiChange() {
    // Re-fetch to see if AI provider is now active.
    const api = getApiClient(getAccessToken);
    api.getAiProvider().then((state) => setAiProviderSource(state.source));
  }

  async function handleConnectNotion() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    saveSetupStep('rehearse');
    window.location.href = url;
  }

  function handleContinue() {
    saveSetupStep('rehearse');
    navigate('/rehearse');
  }

  function handleSkip() {
    saveSetupStep('rehearse');
    navigate('/rehearse');
  }

  const stepSatisfied = aiProviderSource === 'user' || aiProviderSource === 'server' || (notion && notion !== 'loading');

  return (
    <OnboardingShell step={3} totalSteps={5}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Give it something to say
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Step 3 of 5 — Cards need something to generate from. Set up an AI key, connect Notion, or both.
        </p>
      </div>

      {/* AI card */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: '#1A1512' }}>
          AI provider
        </h2>
        <AiProviderPanel
          initialState={null}
          onChange={handleAiChange}
        />
      </div>

      {/* Notion card */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: '#1A1512' }}>
          Notion <span className="text-xs font-normal" style={{ color: '#5A5550' }}>Optional</span>
        </h2>

        {notion === 'loading' && (
          <p className="text-sm" style={{ color: '#5A5550' }}>Checking Notion connection…</p>
        )}

        {notion === null && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: '#5A5550' }}>
              Connect Notion and Stash Live will turn your pages and databases into cards that fire
              when you say their trigger phrases. You can skip this — the AI key alone is enough.
            </p>
            <Button variant="outline" onClick={handleConnectNotion}>
              Connect Notion
            </Button>
          </div>
        )}

        {notion && notion !== 'loading' && (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: '#2e7d32' }}>
              Connected to <strong>{notion.workspaceName}</strong>
            </p>
            {notion.lastSyncedAt && (
              <p className="text-xs" style={{ color: '#5A5550' }}>
                Last synced: {new Date(notion.lastSyncedAt).toLocaleDateString()}
              </p>
            )}
            <a
              href="/dashboard/integrations"
              className="text-xs underline block"
              style={{ color: '#fb8500' }}
            >
              Manage in Integrations
            </a>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={handleSkip}>
          Skip for now
        </Button>
        <Button size="lg" disabled={!stepSatisfied} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </OnboardingShell>
  );
}
