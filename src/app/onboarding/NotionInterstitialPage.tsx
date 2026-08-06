import { useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { getApiClient } from '@/lib/api';
import { useAuth } from '@/app/auth/AuthContext';
import { saveOnboardingStep } from '@/lib/onboarding';
import { OnboardingShell } from './OnboardingShell';

/**
 * "Now use your real data" (plan §4.2 step 8). Explicitly SKIPPABLE — the
 * plan calls Notion OAuth the highest-abandonment step and says it isn't
 * needed to prove value, so this is a pre-OAuth interstitial explaining
 * what the picker will ask for, not the OAuth flow itself.
 */
export default function NotionInterstitialPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  async function handleConnect() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    saveOnboardingStep('meet');
    window.location.href = url;
  }

  function handleSkip() {
    saveOnboardingStep('meet');
    navigate('/meet');
  }

  return (
    <OnboardingShell step={3} totalSteps={4}>
      <div className="text-center space-y-4">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Now use your real data.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Connect Notion and Stash Live will turn your pages and databases into cards. You can skip
          this — the sample cards work in real meetings too.
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
          <Button variant="outline" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button onClick={handleConnect}>Connect Notion</Button>
        </div>
      </div>
    </OnboardingShell>
  );
}
