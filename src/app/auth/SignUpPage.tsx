import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { useAuth } from './AuthContext';
import { isMockMode } from '@/lib/env';
import { useSetupStatus } from '@/app/hooks/useSetupStatus';
import { firstIncompleteStep } from '@/lib/setup';

/**
 * `/signup` — step 1 of the funnel (plan §4.2): "Sign in with Google",
 * one click plus consent. In mock mode this signs in a fixed local dev
 * user with no OAuth round trip, so the funnel is fully clickable with
 * zero configuration.
 *
 * After sign-in, redirects to the first incomplete setup step, or to
 * `/dashboard` if setup is complete.
 */
export default function SignUpPage() {
  const { status, signInWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const { signals, loading } = useSetupStatus();

  // When signed-in, redirect to first incomplete step or dashboard.
  if (status === 'signed-in') {
    if (loading) return null;
    const target = firstIncompleteStep(signals) ?? '/dashboard';
    return <Navigate to={target} replace />;
  }

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Real Supabase mode redirects away for OAuth; mock mode resolves
      // immediately and we navigate on here.
      const target = firstIncompleteStep(signals) ?? '/dashboard';
      navigate(location.state?.from ?? target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setPending(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6"
      style={{ background: '#FBF9F6', color: '#1A1512' }}
    >
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex items-center justify-center gap-2">
          <span
            className="block text-2xl font-medium tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Stash Live
          </span>
          {isMockMode() && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(251,133,0,0.12)', color: '#fb8500' }}
            >
              Demo mode — no account created
            </span>
          )}
        </div>
        <h1
          className="leading-tight"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
            fontWeight: 300,
          }}
        >
          Set up in under a minute.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          We&apos;ll seed three sample cards so you can see Stash Live working before you connect
          anything.
        </p>
        <Button className="w-full" size="lg" disabled={pending} onClick={handleSignIn}>
          {pending ? 'Signing in…' : 'Sign in with Google'}
        </Button>
        {error && (
          <p className="text-sm" style={{ color: '#d4183d' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
