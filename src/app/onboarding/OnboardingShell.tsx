/**
 * Onboarding shell — the frame for all five setup steps.
 *
 * Three changes from the previous version:
 *  - The wordmark is a link home, and the step indicator has real progress
 *    semantics instead of being decorative dots that happen to share a colour
 *    between "current" and "complete".
 *  - `maxWidth` no longer triggers a 300ms width transition on every step
 *    change. RehearsePage varies its own width, and animating it caused layout
 *    work on a page that is simultaneously running a 60fps video stream.
 *  - Gutters scale with the viewport, matching every other screen.
 */
import { type ReactNode } from "react";
import { Link } from "react-router";
import { Wordmark } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";

export function OnboardingShell({
  step,
  totalSteps,
  children,
  maxWidth = "max-w-xl",
}: {
  step: number;
  totalSteps: number;
  children: ReactNode;
  maxWidth?: string;
}) {
  const progress = Math.round(((step - 1) / Math.max(totalSteps - 1, 1)) * 100);

  return (
    <div className="relative flex min-h-screen w-full flex-col px-[var(--gutter)] py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
        <Link to="/" aria-label="Stash Live home" className="transition-opacity hover:opacity-70">
          <Wordmark size="md" className="block text-foreground" />
        </Link>

        <div
         className="flex items-center gap-3"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${totalSteps}`}
          aria-label="Setup progress"
        >
          <span className="eyebrow hidden text-muted-subtle sm:inline">
            {String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
          </span>
          <ol className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => {
              const index = i + 1;
              const isDone = index < step;
              const isCurrent = index === step;
              return (
                <li key={index} className="flex items-center">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      // Current step is wider AND brand-coloured; complete steps
                      // are a dimmer fill. Position is legible without colour.
                      isCurrent ? "w-6 bg-brand" : isDone ? "w-1.5 bg-brand/45" : "w-1.5 bg-border-strong",
                    )}
                  />
                </li>
              );
            })}
          </ol>
          <span className="sr-only">{progress}% complete</span>
        </div>
      </div>

      <div className={cn("mx-auto mt-10 w-full sm:mt-14", maxWidth)}>{children}</div>
    </div>
  );
}
