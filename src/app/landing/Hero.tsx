/**
 * Landing hero.
 *
 * Composition notes (this replaces the previous version, where the type, the
 * meeting mockup, and the photograph's own subject were all fighting for the
 * same two columns):
 *
 *  - The photograph is the hero. Its subject sits right-of-centre and its left
 *    third is near-black, so the type block lives there and the type never
 *    fights the image for the same pixels.
 *  - A directional scrim — not four 5% vignette strips — guarantees contrast
 *    for the heading at every viewport width.
 *  - Only ONE focal object: the type. The presenter stage is a small, anchored
 *    preview that reads as a teaser, not a second headline.
 *  - The hero is `min-h-[100svh]`, never `h-screen`, so a short laptop window
 *    cannot clip the CTA out of existence.
 */
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowDown, Sparkles } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { Action } from "@/app/components/primitives";
import { EASE, DURATION, useReducedMotion } from "@/app/motion";
import heroBg from "@/imports/hero.jpg";
import type { TopicKey } from "./content";
import { PresenterStage } from "./PresenterStage";

const TRUST_POINTS = [
  "No screen sharing",
  "Voice processed locally",
  "Live in under 60 seconds",
];

export function Hero({ topic }: { topic: TopicKey }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Depth: the photograph drifts slower than the page and settles back.
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.04, 1.14]);
  // The type leaves faster than the image, so the eye follows the photograph.
  const copyY = useTransform(scrollYProgress, [0, 1], ["0%", "-70px"]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const rise = (delay: number) => ({
    initial: reduced ? { opacity: 1 } : { opacity: 0, y: 26, filter: "blur(6px)" },
    animate: reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: reduced
      ? { duration: 0.01 }
      : { duration: DURATION.reveal, ease: EASE, delay },
  });

  return (
    <section
      ref={ref}
      id="about"
     className="relative isolate flex min-h-[100svh] w-full flex-col overflow-hidden"
    >
      {/* ── Photograph ── */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        style={reduced ? undefined : { y: imageY, scale: imageScale }}
      >
        <ImageWithFallback
          src={heroBg}
          alt=""
         className="size-full object-cover object-[62%_58%] lg:object-[58%_55%]"
          loading="eager"
          fetchPriority="high"
        />
      </motion.div>

      {/* Directional scrim. One gradient, weighted to the left where the type is. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0B0908]/92 via-[#0B0908]/62 to-[#0B0908]/20 lg:via-[#0B0908]/45 lg:to-transparent"
      />
      {/* Bottom fade melts the hero into the cream canvas below. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-t from-background via-background/55 to-transparent"
      />
      {/* Top scrim keeps the floating nav legible against the photograph. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[#0B0908]/70 to-transparent"
      />

      {/* ── Content ── */}
      <motion.div
       className="relative flex w-full flex-1 flex-col justify-center px-[var(--gutter)] pb-40 pt-32 sm:pb-44 lg:pb-32"
        style={reduced ? undefined : { y: copyY, opacity: copyOpacity }}
      >
        {/* `minmax(0,1fr)` (not the implicit `auto`) so a narrow viewport can
            never be widened by the type column's intrinsic max-width. */}
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,42ch)_minmax(0,1fr)] lg:gap-16">
          {/* Type column */}
          <motion.div {...rise(0.05)} className="min-w-0 max-w-full lg:max-w-[42ch]">
            <h1 className="font-serif text-[clamp(2.5rem,6.2vw,4.75rem)] font-light leading-[0.98] tracking-[-0.03em] text-[#FBF9F6] text-balance">
              Project live metrics,{" "}
              <span className="italic text-brand">as you speak.</span>
            </h1>

            <p className="mt-7 max-w-full text-[1.0625rem] leading-[1.65] text-[#FBF9F6]/72 lg:max-w-[46ch]">
              Stash Live listens to your voice during a call and projects real-time charts and data
              from Notion, Airtable, and Google&nbsp;Drive straight onto your camera feed. Your face
              stays on screen the whole time.
            </p>

<div className="mt-9 flex flex-wrap items-center gap-3">
              <Action to="/rehearse" variant="brand" size="lg" trailingArrow>
                Rehearse
              </Action>
              <Action
                href="#demo"
                variant="outline"
                size="lg"
                className="border-[#FBF9F6]/35 bg-[#FBF9F6]/5 text-[#FBF9F6] hover:border-[#FBF9F6]/60 hover:bg-[#FBF9F6]/12"
              >
                <ArrowDown className="size-4" strokeWidth={2} aria-hidden />
                See it work
              </Action>
            </div>

            <ul className="mt-11 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-[#FBF9F6]/12 pt-6">
              {TRUST_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2 text-[0.8125rem] text-[#FBF9F6]/60"
                >
                  <Sparkles className="size-3 shrink-0 text-brand" strokeWidth={2} aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Product preview — anchored, deliberately smaller than the type block */}
          <motion.div
            {...rise(0.24)}
           className="relative mx-auto w-full min-w-0 max-w-[560px] lg:justify-self-end"
          >
            <PresenterStage topic={topic} />
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-7 hidden justify-center lg:flex"
        initial={reduced ? undefined : { opacity: 0 }}
        animate={reduced ? undefined : { opacity: 1 }}
        transition={{ delay: 1.1, duration: DURATION.slow, ease: EASE }}
      >
        <motion.span
         className="flex flex-col items-center gap-2 text-[#FBF9F6]/40"
          animate={reduced ? undefined : { y: [0, 7, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="eyebrow text-[#FBF9F6]/40">Scroll</span>
          <ArrowDown className="size-3.5" strokeWidth={2} />
        </motion.span>
      </motion.div>
    </section>
  );
}
