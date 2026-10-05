/**
 * `/setup/data` — step 3 of 5.
 *
 * Two routes forward: an AI key (needed to generate new cards) or Notion (lets
 * Stash Live infer cards from what you already maintain). Either satisfies the
 * step.
 *
 * Fixed here: the Continue button used to disable with no explanation, so a
 * user who did not know why had no path forward. It now states the requirement
 * inline.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Check, Database, KeyRound } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type NotionConnection } from "@/lib/api";
import { AiProviderPanel } from "@/app/dashboard/AiProviderPanel";
import { saveSetupStep } from "@/lib/setup";
import { Pill, SkeletonRows, StatusMessage, Surface } from "@/app/components/primitives";
import { OnboardingShell } from "./OnboardingShell";
import { StepActions, StepHeader } from "./StepHeader";

export default function DataSetupPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [notion, setNotion] = useState<NotionConnection | null | "loading">("loading");
  const [aiProviderSource, setAiProviderSource] = useState<string | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getNotionConnection().then(setNotion).catch(() => setNotion(null));
  }, [getAccessToken]);

  function handleAiChange() {
    const api = getApiClient(getAccessToken);
    api.getAiProvider().then((state) => setAiProviderSource(state.source));
  }

  async function handleConnectNotion() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    saveSetupStep("rehearse");
    window.location.href = url;
  }

  function advance() {
    saveSetupStep("rehearse");
    navigate("/rehearse");
  }

  const notionConnected = Boolean(notion && notion !== "loading");
  const aiReady = aiProviderSource === "user" || aiProviderSource === "server";
  const stepSatisfied = aiReady || notionConnected;

  return (
    <OnboardingShell step={3} totalSteps={5}>
      <StepHeader
        step="Step three"
        title="Give it something to say"
        description="Cards need a source. Bring an AI key to generate new ones, connect Notion to infer them from what you already write — or both."
      />

      <div className="mt-10 space-y-5">
        {/* AI key */}
        <Surface className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <KeyRound className="size-4 text-brand" strokeWidth={1.9} aria-hidden />
              <h2 className="font-serif text-lg font-normal text-foreground">AI provider</h2>
            </div>
            {aiReady && <Pill tone="success">Ready</Pill>}
          </div>
          <AiProviderPanel initialState={null} onChange={handleAiChange} />
        </Surface>

        {/* Notion */}
        <Surface className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Database className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden />
              <h2 className="font-serif text-lg font-normal text-foreground">Notion</h2>
            </div>
            {notionConnected ? (
              <Pill tone="success">Connected</Pill>
            ) : (
              <Pill>Optional</Pill>
            )}
          </div>

          {notion === "loading" && <SkeletonRows count={1} />}

          {notion === null && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Connect Notion and Stash Live turns your pages and databases into cards that fire when
                you say their trigger phrases. You can skip this — an AI key on its own is enough to
                continue.
              </p>
              <Button variant="outline" onClick={handleConnectNotion}>
                Connect Notion
              </Button>
            </div>
          )}

          {notionConnected && notion !== "loading" && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm text-success">
                <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                <span>
                  Connected to <strong className="font-medium">{notion!.workspaceName}</strong>
                </span>
              </p>
              {notion!.lastSyncedAt && (
                <p className="text-xs text-muted-subtle">
                  Last synced {new Date(notion!.lastSyncedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              )}
              <a
                href="/dashboard/integrations"
               className="inline-block text-xs text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:text-brand-hover"
              >
                Manage in Integrations
              </a>
            </div>
          )}
        </Surface>
      </div>

      {/* Say what is blocking, rather than presenting a dead button. */}
      {!stepSatisfied && (
        <StatusMessage tone="neutral" className="mt-6">
          Connect Notion or add an AI key to continue. You can also skip and add either one later.
        </StatusMessage>
      )}

      <StepActions>
        <Button variant="outline" onClick={advance}>
          Skip for now
        </Button>
        <Button size="lg" disabled={!stepSatisfied} onClick={advance}>
          Continue
        </Button>
      </StepActions>
    </OnboardingShell>
  );
}
