/**
 * `/signup` — step 1 of the funnel: one Google click plus consent.
 *
 * This is the first screen most people ever see, and it was four elements in a
 * `space-y-6` with no navigation, no trust line, no privacy reassurance, and a
 * wordmark rendered at 32px (48% larger than every other screen). It now uses
 * the same shell, ambient depth, and type scale as the rest of the product.
 *
 * In mock mode this signs in a fixed local dev user with no OAuth round trip,
 * so the funnel stays fully clickable with zero configuration.
 */
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "./AuthContext";
import { isMockMode } from "@/lib/env";
import { useSetupStatus } from "@/app/hooks/useSetupStatus";
import { firstIncompleteStep } from "@/lib/setup";
import {
  AmbientBackground,
  Display,
  Pill,
  StatusMessage,
  Wordmark,
} from "@/app/components/primitives";
import { useReducedMotion } from "@/app/motion";

const REASSURANCE = [
  "We only ever see the pages you select in Notion",
  "Voice is processed on your machine",
  "No card reaches your feed without your approval",
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4 shrink-0" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function SignUpPage() {
  const { status, signInWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const reduced = useReducedMotion();
  const { signals, loading } = useSetupStatus();

  if (status === "signed-in") {
    if (loading) return null;
    return <Navigate to={firstIncompleteStep(signals) ?? "/dashboard"} replace />;
  }

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Real Supabase mode redirects away for OAuth; mock mode resolves
      // immediately and we navigate from here.
      navigate(location.state?.from ?? firstIncompleteStep(signals) ?? "/dashboard", {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background px-[var(--gutter)] py-8">
      {!reduced && <AmbientBackground />}

      {/* Top bar — a visitor landing here must be able to get back. */}
      <header className="relative flex items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="Back to Stash Live home"
         className="transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
          Back
        </Link>
        <Link to="/" aria-label="Stash Live home" className="transition-opacity hover:opacity-70">
          <Wordmark size="md" className="block text-foreground" />
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mb-7 flex items-center justify-center">
            {isMockMode() && <Pill tone="brand">Demo mode · no account created</Pill>}
          </div>

          <Display size="md" align="center">
            Set up in under a minute.
          </Display>

          <p className="mx-auto mt-5 max-w-[38ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
            We&rsquo;ll seed three sample cards so you can see Stash Live working before you connect
            anything.
          </p>

          <Button
           className="mt-8 w-full"
            size="lg"
            disabled={pending}
            onClick={handleSignIn}
            aria-busy={pending}
          >
            <GoogleMark />
            {pending ? "Signing in…" : "Continue with Google"}
          </Button>

          {error && (
            <StatusMessage tone="danger" className="mt-5 text-left">
              {error}
            </StatusMessage>
          )}

          {/* Why it is safe to click. */}
          <ul className="mt-9 space-y-2.5 border-t border-border pt-7 text-left">
            {REASSURANCE.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" strokeWidth={1.9} aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-7 text-xs leading-relaxed text-muted-subtle">
            By continuing you agree to let Stash Live read the Notion pages you choose and process
            your microphone locally while a meeting is open.
          </p>
        </div>
      </main>
    </div>
  );
}
