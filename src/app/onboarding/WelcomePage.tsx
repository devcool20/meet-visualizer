/**
 * `/welcome` — step 1: sample cards seeded, zero clicks required.
 *
 * Calls the idempotent `POST /api/me/bootstrap` (creates the user row and seeds
 * `SAMPLE_CARDS` exactly once) and renders them with the real `GlassCard`
 * renderer, so what the user sees here is pixel-identical to what composites
 * onto their video later.
 *
 * The three cards were previously stacked in a single column, making the page
 * roughly 2,000px tall with the Continue button below three full card renders.
 * They are now a row that fits above the fold on a laptop.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { GlassCard } from "@stash/card-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiCard } from "@/lib/api";
import { saveSetupStep } from "@/lib/setup";
import { SkeletonRows, StatusMessage } from "@/app/components/primitives";
import { OnboardingShell } from "./OnboardingShell";
import { StepActions, StepHeader } from "./StepHeader";

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
      .then(() => api.listCards({ status: "approved" }))
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your sample cards.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  function handleContinue() {
    saveSetupStep("extension");
    navigate("/setup/extension");
  }

  return (
    <OnboardingShell step={1} totalSteps={5} maxWidth="max-w-4xl">
      <StepHeader
        step="Step one"
        title="Three cards to start with"
        description="Sample data, already armed. Each one listens for the phrases under it — try any of them in a rehearsal before you connect anything."
      />

      {error && (
        <StatusMessage tone="danger" className="mx-auto mt-8 max-w-md">
          {error}
        </StatusMessage>
      )}

      <div className="mt-12">
        {cards === null && !error && <SkeletonRows count={1} />}

        {cards !== null && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <li
                key={card.id}
               className="flex flex-col items-center gap-4 rounded-card border border-border bg-background-sunken/50 p-5"
              >
                <GlassCard spec={card.spec} width={252} />
                {card.phrases.length > 0 && (
                  <ul className="flex flex-wrap justify-center gap-1.5">
                    {card.phrases.slice(0, 3).map((phrase) => (
                      <li
                        key={phrase}
                       className="rounded-full bg-accent px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        &ldquo;{phrase}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <StepActions>
        <Button size="lg" disabled={cards === null} onClick={handleContinue}>
          Continue
        </Button>
      </StepActions>
    </OnboardingShell>
  );
}
