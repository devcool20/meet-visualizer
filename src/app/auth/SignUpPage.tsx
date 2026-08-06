import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { useAuth } from './AuthContext';

/**
 * `/signup` — step 2 of the funnel (plan §4.2): "Sign in with Google",
 * one click plus consent. In mock mode this signs in a fixed local dev
 * user with no OAuth round trip, so the funnel is fully clickable with
 * zero configuration.
 */
export default function SignUpPage() {
  const { status, signInWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  if (status === 'signed-in') {
    return <Navigate to="/welcome" replace />;
  }

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Real Supabase mode redirects away for OAuth; mock mode resolves
      // immediately and we navigate on here.
      navigate(location.state?.from ?? '/welcome', { replace: true });
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
        <span
          className="block text-2xl font-medium tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Stash Live
        </span>
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
