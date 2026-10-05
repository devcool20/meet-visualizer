/**
 * Notion OAuth interstitial — optional, reachable from `/setup/data` and
 * `/dashboard/integrations`.
 *
 * Fixed here: "Back" and "Skip for now" were two visually identical outline
 * buttons sitting side by side, and the irreversible full-page OAuth redirect
 * was the default action. Connect is now explicitly the primary choice, and
 * the two exits are distinguishable.
 */
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/app/auth/AuthContext";
import { saveSetupStep } from "@/lib/setup";
import { Pill, Surface } from "@/app/components/primitives";
import { OnboardingShell } from "./OnboardingShell";
import { StepActions, StepHeader } from "./StepHeader";

const STEPS = [
  {
    title: "You choose what to share",
    body: "Notion opens its own picker. Stash Live only ever sees the pages and databases you select there.",
  },
  {
    title: "Nothing else is read",
    body: "Your other pages, private notes, and teamspaces are never sent to us — there is nothing for us to read.",
  },
  {
    title: "Disconnect in one click",
    body: "Revoke access from Integrations at any time, and the connection is removed immediately.",
  },
];

export default function NotionInterstitialPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  async function handleConnect() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    saveSetupStep("rehearse");
    window.location.href = url;
  }

  function advance() {
    saveSetupStep("rehearse");
    navigate("/rehearse");
  }

  return (
    <OnboardingShell step={3} totalSteps={5}>
      <StepHeader
        step="Optional"
        title="Connect Notion"
        description="Notion is an optional source for cards. An AI key on its own is enough to continue — you can skip this entirely."
      />

      <Surface className="mt-10 p-6 text-left">
        <div className="mb-5 flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-brand" strokeWidth={1.9} aria-hidden />
          <h2 className="font-serif text-lg font-normal text-foreground">What happens next</h2>
          <Pill className="ml-auto">Private by default</Pill>
        </div>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="telemetry mt-0.5 shrink-0 text-xs text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Surface>

      <StepActions className="mt-8">
        <Button variant="ghost" onClick={() => navigate("/setup/data")}>
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
          Back
        </Button>
        <Button variant="outline" onClick={advance}>
          Skip for now
        </Button>
        <Button size="lg" onClick={handleConnect}>
          Connect Notion
          <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
        </Button>
      </StepActions>
    </OnboardingShell>
  );
}
