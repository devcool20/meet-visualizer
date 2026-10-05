/**
 * The engagement gap — the problem statement.
 *
 * This is the section that justifies the product, so it leads with the cost
 * (a presenter's face disappearing behind a shared screen) and resolves it
 * with the mechanism, not with adjectives.
 */
import { motion } from "motion/react";
import { Accent, Action, Reveal, SectionHeading, Surface, Telemetry } from "@/app/components/primitives";
import { EASE, useReducedMotion } from "@/app/motion";

/** Six months of the engagement index — the payoff for the mechanism. */
const ENGAGEMENT = [
  { month: "Jan", value: 42 },
  { month: "Feb", value: 58 },
  { month: "Mar", value: 51 },
  { month: "Apr", value: 74 },
  { month: "May", value: 68 },
  { month: "Jun", value: 91 },
];

export function EngagementGap() {
  const reduced = useReducedMotion();

  return (
    <section
      id="features"
     className="relative w-full scroll-mt-24 overflow-x-clip border-y border-border bg-background-sunken py-24 sm:py-28"
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-14 px-[var(--gutter)] lg:grid-cols-2 lg:gap-20">
        {/* Copy */}
        <div>
          <SectionHeading
            eyebrow="The engagement gap"
            title={
              <>
                What screen sharing costs you is{" "}
                <Accent>hiding in plain sight.</Accent>
              </>
            }
            description="Every time a presenter minimises their face to share a deck, the audience loses the human signal they rely on — eye contact, micro-expressions, natural emphasis. Attention drops in the first ninety seconds, and it rarely fully returns."
          />

          <Reveal delay={0.14}>
            <div className="mt-8 space-y-4 border-l-2 border-brand/30 pl-6">
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                Stash Live removes the trade-off. Voice runs on your machine, the engine matches what you
                said against the cards in your library, and the data appears beside your shoulder in the
                video frame.
              </p>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                You keep direct eye contact. Your audience stays present. And the number arrives exactly
                when it is relevant — never a beat early, never after the moment has passed.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <ul className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
              {[
                "Face never leaves screen",
                "Works in Zoom, Meet, Teams",
                "Local voice processing",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="size-1 rounded-full bg-brand" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.26}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Action to="/signup" variant="primary" size="lg" trailingArrow>
                Start presenting free
              </Action>
              <Action href="#demo" variant="ghost" size="lg">
                See the mechanism
              </Action>
            </div>
          </Reveal>
        </div>

        {/* Engagement chart */}
        <Reveal delay={0.12}>
          <div className="relative">
            {/* Warm bloom behind the card.
                This was a decorative <img> with `-inset-6` plus a fixed size:
                the inset offset it left a hard-edged, mis-sized rectangle
                peeking out from behind the card (visible as a grey box offset
                to one side) because it had no `object-cover` and its negative
                z-index escaped the section's own background. A radial gradient
                has no edges to betray. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-10 -z-10 blur-2xl"
              style={{
                background:
                  "radial-gradient(60% 55% at 55% 45%, rgba(251,133,0,0.20) 0%, rgba(251,133,0,0.07) 45%, transparent 75%)",
              }}
            />
            <EngagementCard reduced={reduced} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function EngagementCard({ reduced }: { reduced: boolean }) {
  return (
    <Surface tone="default" radius="panel" className="p-7 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Engagement index</p>
          <p className="font-serif text-[2.75rem] font-light leading-none tracking-tight text-brand">
            91
            <span className="ml-1.5 font-sans text-sm text-muted-foreground">/ 100</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-surface px-2.5 py-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em] text-brand-ink">
          <span className="size-1 rounded-full bg-brand" aria-hidden />
          live
        </span>
      </div>

      {/* Bars grow from a single baseline as the card enters view.
          The axis rule belongs directly under the bars, with the month labels
          below it — not inside the plot area. */}
      <div className="mt-9" role="img" aria-label="Engagement index rising from 42 in January to 91 in June">
        <div className="flex h-32 items-end gap-2.5 border-b border-border">
          {ENGAGEMENT.map((d, i) => {
            const isLatest = i === ENGAGEMENT.length - 1;
            return (
              <motion.div
                key={d.month}
                className="flex-1 rounded-t-[3px]"
                initial={reduced ? { height: `${d.value}%` } : { height: 0 }}
                whileInView={{ height: `${d.value}%` }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={
                  reduced
                    ? { duration: 0.01 }
                    : { duration: 0.7, ease: EASE, delay: 0.12 + i * 0.07 }
                }
                style={{
                  background: isLatest
                    ? "linear-gradient(180deg, #fb8500 0%, rgba(251,133,0,0.55) 100%)"
                    : "rgba(26,21,18,0.10)",
                }}
              />
            );
          })}
        </div>
        <div className="mt-2.5 flex gap-2.5">
          {ENGAGEMENT.map((d, i) => (
            <Telemetry
              key={d.month}
              as="span"
              className={`flex-1 text-center text-[0.625rem] ${
                i === ENGAGEMENT.length - 1 ? "text-brand" : "text-muted-subtle"
              }`}
            >
              {d.month}
            </Telemetry>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
        <Telemetry className="text-[0.6875rem] text-muted-subtle">cloud connected</Telemetry>
        <span className="telemetry text-[0.6875rem] text-brand">↑ +18 pts this quarter</span>
      </div>
    </Surface>
  );
}
