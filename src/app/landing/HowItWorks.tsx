/**
 * How it works — the interactive demo plus the three-step explanation.
 *
 * The demo is the argument; the steps are the receipt. They sit side by side
 * so a visitor can act and understand in the same glance.
 */
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { Reveal, RevealGroup, RevealItem, SectionHeading, Accent } from "@/app/components/primitives";
import videoBg from "@/imports/video-bg.jpg";
import { STEPS } from "./content";
import { VoiceDemo } from "./VoiceDemo";

export function HowItWorks() {
  return (
    <section id="demo" className="relative w-full scroll-mt-24 overflow-hidden py-24 sm:py-28">
      {/* Imagery sits behind the demo column only, so the copy stays on cream. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <ImageWithFallback
          src={videoBg}
          alt=""
         className="size-full object-cover opacity-[0.16]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/92 to-background" />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-[var(--gutter)]">
        <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
          {/* Explanation first on mobile — the argument before the toy. */}
          <div className="order-2 lg:order-1 lg:sticky lg:top-28">
            <SectionHeading
              eyebrow="How it works"
              title={
                <>
                  Real-time overlays, <Accent>powered by your voice.</Accent>
                </>
              }
              description="No hotkeys and no trigger phrases to memorise. Speak the way you normally would and the engine works out what you meant."
            />

            <RevealGroup className="mt-12 space-y-8">
              {STEPS.map((step, i) => (
                <RevealItem key={step.title}>
                  <div className="flex gap-5">
                    <span className="telemetry mt-1 shrink-0 text-[0.6875rem] text-brand">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 border-t border-border pt-4">
                      <h3 className="font-serif text-xl font-normal tracking-tight text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                      <p className="telemetry mt-3 text-[0.6875rem] uppercase tracking-[0.1em] text-muted-subtle">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>

          <Reveal delay={0.1} className="order-1 lg:order-2">
            <VoiceDemo />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
