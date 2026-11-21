/**
 * Integrations grid.
 *
 * Two states per tile, distinguished by weight rather than only by a badge:
 * available integrations are raised and interactive, upcoming ones are
 * visibly recessed. Previously both had identical visual weight.
 */
import { useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Pill, RevealGroup, RevealItem, SectionHeading } from "@/app/components/primitives";
import { EASE, useReducedMotion } from "@/app/motion";
import { INTEGRATIONS, type Integration } from "./content";

export function Integrations() {
  const reduced = useReducedMotion();
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <section id="integrations" className="w-full scroll-mt-24 py-24 sm:py-28">
      <div className="mx-auto w-full max-w-[1240px] px-[var(--gutter)]">
        <SectionHeading
          align="center"
          eyebrow="Integrations"
          title={
            <>
              Connect your workflow <AccentWord />
            </>
          }
          description="Stash Live reads directly from the tools you already keep your numbers in, so the data on your overlay is the same data your team maintains."
          className="mx-auto max-w-3xl"
        />

        <RevealGroup className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
            {INTEGRATIONS.map((app) => {
              const isConnected = Boolean(connected[app.id]);
              return (
                <RevealItem key={app.id}>
                  <IntegrationTile
                    app={app}
                    connected={isConnected}
                    onToggle={() =>
                      setConnected((prev) => ({ ...prev, [app.id]: !prev[app.id] }))
                    }
                    reduced={reduced}
                  />
                </RevealItem>
              );
            })}
        </RevealGroup>
      </div>
    </section>
  );
}

function AccentWord() {
  return (
    <>
      {" "}
      <span className="italic text-brand">in seconds.</span>
    </>
  );
}

function IntegrationTile({
  app,
  connected,
  onToggle,
  reduced,
}: {
  app: Integration;
  connected: boolean;
  onToggle: () => void;
  reduced: boolean;
}) {
  const { name, description, note, available, icon: Icon } = app;

  if (!available) {
    return (
      <div className="flex h-full flex-col gap-3 rounded-card border border-dashed border-border bg-accent/25 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background opacity-45">
            <Icon className="size-5 text-foreground" />
          </div>
          <Pill>Planned</Pill>
        </div>
        <h3 className="font-serif text-lg font-normal text-muted-foreground">{name}</h3>
        <p className="text-sm leading-relaxed text-muted-subtle">{description}</p>
        {note && <p className="telemetry mt-auto pt-2 text-[0.6875rem] text-muted-subtle">{note}</p>}
      </div>
    );
  }

  return (
    <div
      className={`glass interactive interactive-lift flex h-full flex-col gap-3 rounded-card p-6 ${
        connected ? "border-brand/30" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
          <Icon className="size-5 text-foreground" />
        </div>
        {connected ? (
          <Pill tone="brand">
            <Check className="size-2.5" strokeWidth={3} aria-hidden />
            Connected
          </Pill>
        ) : (
          note && <Pill>{note}</Pill>
        )}
      </div>

      <h3 className="font-serif text-lg font-normal text-foreground">{name}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={connected}
        className={`mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[0.6875rem] font-medium uppercase tracking-[0.1em] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
          connected
            ? "bg-brand text-white shadow-brand"
            : "border border-border-strong text-foreground hover:border-foreground/25"
        }`}
      >
        <motion.span
          key={connected ? "on" : "off"}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 5 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.16, ease: EASE }}
         className="inline-block"
        >
          {connected ? "Connected" : "Connect"}
        </motion.span>
      </button>
    </div>
  );
}
