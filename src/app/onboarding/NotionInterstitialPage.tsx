import { useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { getApiClient } from '@/lib/api';
import { useAuth } from '@/app/auth/AuthContext';
import { saveSetupStep } from '@/lib/setup';
import { OnboardingShell } from './OnboardingShell';

/**
 * Notion OAuth interstitial (plan §5.5). Reachable from `/setup/data`
 * and `/dashboard/integrations`. Optional step — the user can skip.
 * On skip, routes to `/rehearse`.
 */
export default function NotionInterstitialPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  async function handleConnect() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    saveSetupStep('rehearse');
    window.location.href = url;
  }

  function handleSkip() {
    saveSetupStep('rehearse');
    navigate('/rehearse');
  }

  function handleBack() {
    navigate('/setup/data');
  }

  return (
    <OnboardingShell step={3} totalSteps={5}>
      <div className="text-center space-y-4">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Connect Notion{' '}
          <span className="text-base font-normal" style={{ color: '#5A5550' }}>
            Optional
          </span>
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Notion is an optional source for cards. The AI key alone is enough — you can skip this.
        </p>
        <div
          className="rounded-2xl p-5 text-left space-y-2 text-sm"
          style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)', color: '#5A5550' }}
        >
          <p className="font-semibold" style={{ color: '#1A1512' }}>
            What happens next
          </p>
          <p>Notion opens its own picker. You choose exactly which pages or databases to share — we never see anything you don&apos;t select.</p>
          <p>You can add or remove sources any time from Integrations, and disconnect completely with one click.</p>
        </div>
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
          <Button variant="outline" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button onClick={handleConnect}>Connect Notion</Button>
        </div>
      </div>
    </OnboardingShell>
  );
}
