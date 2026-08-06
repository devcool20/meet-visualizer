import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';
import { saveOnboardingStep } from '@/lib/onboarding';
import { OnboardingShell } from './OnboardingShell';

/**
 * `/welcome` — step 3 of the funnel (plan §4.2): "3 sample cards seeded",
 * zero clicks required. Calls the idempotent `POST /api/me/bootstrap`
 * (creates the user row + seeds `SAMPLE_CARDS` exactly once) and renders
 * them with the real `GlassCard` renderer so what the user sees here is
 * pixel-identical to what will composite onto their video later.
 */
export default function WelcomePage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<ApiCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    let cancelled = false;
    api
      .bootstrap()
      .then(() => api.listCards({ status: 'approved' }))
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load sample cards');
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  function handleContinue() {
    saveOnboardingStep('rehearse');
    navigate('/rehearse');
  }

  return (
    <OnboardingShell step={1} totalSteps={4}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Here are three cards to start with.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          These are sample data, ready to try. You can edit them or connect Notion later.
        </p>
      </div>

      {error && (
        <p className="text-sm text-center mb-4" style={{ color: '#d4183d' }}>
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-6 mb-10">
        {(cards ?? []).map((card) => (
          <div key={card.id} className="flex flex-col items-center gap-2">
            <GlassCard spec={card.spec} width={300} />
            <div className="flex flex-wrap gap-1.5 justify-center">
              {card.phrases.slice(0, 3).map((phrase) => (
                <span
                  key={phrase}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(26,21,18,0.06)', color: '#5A5550' }}
                >
                  &ldquo;{phrase}&rdquo;
                </span>
              ))}
            </div>
          </div>
        ))}
        {cards === null && !error && (
          <p className="text-sm" style={{ color: '#5A5550' }}>
            Setting up your account&hellip;
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <Button size="lg" disabled={cards === null} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </OnboardingShell>
  );
}
