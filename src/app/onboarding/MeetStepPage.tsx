/**
 * `/setup/meet` — step 5 of 5, the launch pad for the *Google Meet* path.
 *
 * Distinct from `/meet`, which is now the built-in Stash Live meeting
 * platform. This page exists to hand a presenter's first rehearsal off to
 * Google Meet; the in-product alternative is the `/meet` gate reached from the
 * landing nav.
 *
 * Two ways to present, then a pre-flight check, then into the product.
 * Fixed here: the two option cards used three different surface alphas, emoji
 * as the only differentiator, and a 10px badge. "Open Google Meet" — the final
 * primary path — was the least prominent control on the page.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Check, ExternalLink, LayoutGrid, Video } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient } from "@/lib/api";
import { hasRehearsed, saveSetupStep } from "@/lib/setup";
import { Pill, Surface } from "@/app/components/primitives";
import { OnboardingShell } from "./OnboardingShell";
import { StepActions, StepHeader } from "./StepHeader";

interface ChecklistItem {
  label: string;
  done: boolean;
  /** What the user should do about it. Required when not done. */
  hint?: string;
}

export default function MeetStepPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { label: "AI key or workspace configured", done: false, hint: "Add one in step 3" },
    { label: "Rehearsal verified", done: false, hint: "Try one phrase in Studio" },
    { label: "Meet add-on or Studio ready", done: true },
  ]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const api = getApiClient(getAccessToken);
      let aiAvailable = false;
      try {
        const state = await api.getAiProvider();
        aiAvailable = state.source !== "none";
      } catch {
        /* treat an unreachable engine as "not configured" rather than blocking */
      }
      const rehearsed = hasRehearsed();
      if (cancelled) return;
      setChecklist([
        {
          label: "AI key or workspace configured",
          done: aiAvailable,
          hint: aiAvailable ? undefined : "Add one in step 3",
        },
        {
          label: "Rehearsal verified",
          done: rehearsed,
          hint: rehearsed ? undefined : "Try one phrase in Studio",
        },
        { label: "Meet add-on or Studio ready", done: true },
      ]);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  function handleDone() {
    saveSetupStep("meet");
    navigate("/dashboard");
  }

  function handleOpenMeet() {
    window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
  }

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <OnboardingShell step={5} totalSteps={5} maxWidth="max-w-3xl">
      <StepHeader
        step="Final step"
        title="Ready for live calls"
        description="Pick how you want to present, then open a meeting. You can switch approaches at any time."
      />

      {/* Ways to present */}
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        <li>
          <Surface tone="brand" className="flex h-full flex-col gap-4 p-5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <LayoutGrid className="size-4 shrink-0 text-brand" strokeWidth={1.9} aria-hidden />
                <h2 className="font-serif text-lg font-normal text-foreground">Meet add-on</h2>
                <Pill tone="brand">Recommended</Pill>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Runs inside Google Meet&rsquo;s side panel and can expand to the main stage for
                everyone in the call. Nothing to install.
              </p>
            </div>
            <div className="mt-auto border-t border-border pt-4">
              <Button asChild size="sm">
                <a href="/meet-addon" target="_blank" rel="noopener noreferrer">
                  Open add-on view
                  <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
                </a>
              </Button>
            </div>
          </Surface>
        </li>

        <li>
          <Surface className="flex h-full flex-col gap-4 p-5">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Video className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} aria-hidden />
                <h2 className="font-serif text-lg font-normal text-foreground">Web studio</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your full camera feed with cards positioned over your shoulder. Share the tab
                directly in Meet at 1080p.
              </p>
            </div>
            <div className="mt-auto border-t border-border pt-4">
              <Button asChild variant="outline" size="sm">
                <a href="/studio" target="_blank" rel="noopener noreferrer">
                  Launch studio
                  <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
                </a>
              </Button>
            </div>
          </Surface>
        </li>
      </ul>

      {/* Pre-flight */}
      <Surface tone="flat" className="mt-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="eyebrow">Pre-flight</h2>
          <span className="telemetry text-xs text-muted-subtle">
            {doneCount} / {checklist.length}
          </span>
        </div>
        <ul className="space-y-2.5" aria-live="polite">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold ${
                  item.done ? "bg-success text-white" : "bg-border text-muted-subtle"
                }`}
                aria-hidden
              >
                {item.done ? <Check className="size-2.5" strokeWidth={3.5} /> : "•"}
              </span>
              <span className="min-w-0">
                <span
                  className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {item.label}
                </span>
                {!item.done && item.hint && (
                  <span className="block text-xs text-muted-subtle">{item.hint}</span>
                )}
                <span className="sr-only">{item.done ? " — done" : " — not done yet"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Surface>

      <StepActions>
        <Button variant="outline" onClick={handleOpenMeet}>
          Open Google Meet
          <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
        </Button>
        <Button size="lg" onClick={handleDone}>
          Enter dashboard
        </Button>
      </StepActions>
    </OnboardingShell>
  );
}
