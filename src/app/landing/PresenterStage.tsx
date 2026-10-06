/**
 * The meeting stage — a faithful mock of what the extension injects into a
 * call, and the single clearest statement of what the product does.
 *
 * Previously this was ~300 lines of inline-styled JSX inside App.tsx, with
 * text at 4.5px and hand-rolled SVG charts. It is now tokenised, and the
 * projected card is the real `GlassCard` renderer rather than a lookalike.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff } from "lucide-react";
import { GlassCard, createDomTextMeasurer } from "@stash/card-react";
import { layoutCard } from "@stash/card-core";
import { Pill, StatusDot, Telemetry } from "@/app/components/primitives";
import { EASE, DURATION, useReducedMotion } from "@/app/motion";
import { TOPIC_CAPTIONS, TOPIC_CARDS, TOPIC_KEYS, type TopicKey } from "./content";

export function PresenterStage({
  topic,
  cardWidth = 264,
  className = "",
}: {
  topic: TopicKey;
  cardWidth?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  // A running call clock gives the mock a sense of being live without
  // claiming to report a metric we did not actually measure.
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => (e + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor((elapsed % 3600) / 60))}:${pad(elapsed % 60)}`;
  }, [elapsed]);

  /**
   * The card slot is sized to the TALLEST topic card, not the current one.
   *
   * Each topic card has a different block count and so a different height, which
   * made the whole stage change height every 4.2s. The hero grid centres both
   * columns with `items-center`, so a resizing preview pushed the headline up
   * and down on every rotation - it looked like the copy was breathing.
   *
   * Reserving the tallest height makes the stage a fixed-size object, and the
   * hero copy stops moving. Measured with the same layout function and DOM
   * measurer `GlassCard` itself uses, so the slot can never clip a card.
   *
   * The height is left in `GlassCard`'s own LAYOUT units - deliberately not
   * scaled by cardWidth/CARD.width. The card's box is the unscaled design size
   * and only its paint is CSS-scaled, so a flex parent centres against the
   * layout box. Scaling here would centre the tallest card correctly but leave
   * every shorter card visibly high in the slot.
   */
  const slotHeight = useMemo(() => {
    const measure = createDomTextMeasurer();
    let tallest = 0;
    for (const key of TOPIC_KEYS) {
      tallest = Math.max(tallest, layoutCard(TOPIC_CARDS[key], measure).height);
    }
    return Math.ceil(tallest);
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-panel border border-[#FBF9F6]/12 bg-[#141210] shadow-[0_40px_90px_-24px_rgba(0,0,0,0.7)] ${className}`}
    >
      {/* Call chrome */}
      <div className="flex items-center justify-between gap-3 border-b border-[#FBF9F6]/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusDot tone="success" pulse />
          <span className="truncate text-[0.6875rem] text-[#FBF9F6]/70">Weekly Product Review</span>
        </div>
        <Telemetry className="shrink-0 rounded-md bg-[#FBF9F6]/6 px-2 py-1 text-[0.625rem] text-[#FBF9F6]/50">
          {clock}
        </Telemetry>
      </div>

      {/* Two-up: you, and the person you are presenting to */}
      <div className="grid grid-cols-2 gap-2 p-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#1A1512]">
          {/* Focus brackets — the only chrome that says "this is your feed" */}
          <span className="absolute left-2 top-2 size-2.5 border-l border-t border-[#FBF9F6]/25" />
          <span className="absolute right-2 top-2 size-2.5 border-r border-t border-[#FBF9F6]/25" />
          <span className="absolute bottom-2 left-2 size-2.5 border-b border-l border-[#FBF9F6]/25" />
          <span className="absolute right-2 bottom-2 size-2.5 border-b border-r border-[#FBF9F6]/25" />

          <div className="absolute left-2 top-2.5 z-10">
            <Pill tone="brand" className="bg-[#fb8500]/15 text-[#FFA24A]">
              You
            </Pill>
          </div>

          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-brand opacity-25"
          >
            <svg viewBox="0 0 100 100" className="size-12" fill="currentColor">
              <circle cx="50" cy="35" r="18" />
              <path d="M50,58 C32,58 18,72 18,90 L82,90 C82,72 68,58 50,58 Z" />
            </svg>
          </div>

          {/* Live transcript caption */}
          <div className="absolute inset-x-2 bottom-2 z-10 flex justify-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={topic}
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 5 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -5 }}
                transition={{ duration: reduced ? 0.01 : 0.26, ease: EASE }}
               className="max-w-full truncate rounded-full border border-[#FBF9F6]/12 bg-black/65 px-2.5 py-1 text-[0.5625rem] text-[#FBF9F6]/85 backdrop-blur-md"
              >
                {TOPIC_CAPTIONS[topic]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#1C1A18]">
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-[#FBF9F6] opacity-[0.12]"
          >
            <svg viewBox="0 0 100 100" className="size-12" fill="currentColor">
              <circle cx="50" cy="35" r="18" />
              <path d="M50,58 C32,58 18,72 18,90 L82,90 C82,72 68,58 50,58 Z" />
            </svg>
          </div>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md border border-[#FBF9F6]/10 bg-black/50 px-1.5 py-1 backdrop-blur-md">
            <MicOff className="size-2.5 text-[#FBF9F6]/45" strokeWidth={2.5} aria-hidden />
            <span className="sr-only">Muted participant</span>
          </div>
        </div>
      </div>

      {/* The projected card — the entire point of the product. */}
      {/* `pt-6` reserves a band for the PROJECTED tag. The card is centred in a
          fixed-height slot sized to the tallest topic card, so shorter cards
          float with space above them and a corner tag would otherwise land on
          top of the tallest one. */}
      <div className="relative px-3 pb-3 pt-6">
        <div className="absolute left-5 top-2">
          <Pill tone="brand" className="border border-[#fb8500]/25 bg-[#1A1512] text-[#FFA24A]">
            <span className="size-1 rounded-full bg-brand" />
            Projected
          </Pill>
        </div>
        {/* Fixed-height slot: the stage must not resize as topics rotate. */}
        <div
          className="flex items-center justify-center rounded-card border border-[#FBF9F6]/10 bg-[#FBF9F6]/4 p-2.5"
          style={{ height: slotHeight + 20 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={topic}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
              transition={reduced ? { duration: 0.01 } : { duration: DURATION.base, ease: EASE }}
            >
              <GlassCard spec={TOPIC_CARDS[topic]} width={cardWidth} reducedMotion={reduced} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Signal strip */}
      <div className="flex items-center justify-between gap-3 border-t border-[#FBF9F6]/8 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[0.6875rem] text-[#FBF9F6]/55">
          <Mic className="size-3 text-brand" strokeWidth={2} aria-hidden />
          Matched on speech
        </span>
        <Telemetry className="text-[0.625rem] text-[#FBF9F6]/40">
          {TOPIC_KEYS.indexOf(topic) + 1}/{TOPIC_KEYS.length} armed
        </Telemetry>
      </div>
    </div>
  );
}
