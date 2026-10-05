/**
 * Setup checklist, shown at the top of the dashboard while required steps are
 * outstanding.
 *
 * Three fixes:
 *  - The dismiss state lived in component state, so any navigation remounted
 *    the shell and brought the banner straight back — despite the label
 *    promising a session-scoped dismissal. It is now in sessionStorage.
 *  - The ordinal was computed against the unfiltered list, so the number shown
 *    could disagree with the visible position.
 *  - It is a widget, not a page, so it takes the tokenised surface rather than
 *    a fifth hand-rolled orange tint recipe.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check, X } from "lucide-react";
import {
  firstIncompleteStep,
  setupItems,
  SETUP_STEP_ROUTES,
  type SetupSignals,
} from "@/lib/setup";
import { Pill, Surface } from "@/app/components/primitives";

export interface SetupChecklistProps {
  signals: SetupSignals;
}

const STEP_LABELS: Record<string, string> = {
  welcome: "Accept your sample cards",
  extension: "Install the extension",
  data: "Configure an AI key or Notion",
  rehearse: "Rehearse one phrase",
  meet: "Join a meeting",
};

const DISMISS_KEY = "stash-live:setup-dismissed";

export function SetupChecklist({ signals }: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(true);

  // Read after mount so the server-rendered/first-paint markup stays stable.
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const required = setupItems(signals).filter((item) => item.required);
  const outstanding = required.filter((item) => !item.done);
  if (outstanding.length === 0) return null;

  const next = firstIncompleteStep(signals);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — dismissal simply will not persist */
    }
    setDismissed(true);
  }

  return (
    <Surface tone="brand" className="relative mb-8 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss setup checklist"
       className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/8 hover:text-foreground"
      >
        <X className="size-3.5" strokeWidth={2.2} aria-hidden />
      </button>

      <div className="mb-4 flex flex-wrap items-center gap-3 pr-8">
        <h2 className="font-serif text-lg font-normal text-foreground">Finish setting up</h2>
        <Pill tone="brand">
          {required.length - outstanding.length} of {required.length}
        </Pill>
      </div>

      <ol className="space-y-2">
        {required.map((item, index) => (
          <li key={item.step} className="flex items-center gap-3">
            <span
              className={`telemetry flex size-4 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-bold ${
                item.done ? "bg-success text-white" : "bg-foreground/10 text-muted-foreground"
              }`}
              aria-hidden
            >
              {item.done ? <Check className="size-2.5" strokeWidth={3.5} /> : index + 1}
            </span>
            {item.done ? (
              <span className="text-sm text-muted-foreground">{STEP_LABELS[item.step]}</span>
            ) : (
              <Link
                to={SETUP_STEP_ROUTES[item.step]}
               className="text-sm font-medium text-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:decoration-brand"
              >
                {STEP_LABELS[item.step]}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {next && (
        <Link
          to={SETUP_STEP_ROUTES[next]}
         className="mt-5 inline-flex rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-medium text-white shadow-brand transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-hover"
        >
          Resume setup
        </Link>
      )}
    </Surface>
  );
}
