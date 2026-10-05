/**
 * The tagline band.
 *
 * A single full-bleed moment between the argument and the feature grid. The
 * dot field collapses and reforms on a loop, and the type types itself — both
 * fully inert under reduced motion.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { Reveal } from "@/app/components/primitives";
import { useReducedMotion } from "@/app/motion";
import orangeTexture from "@/imports/orange.jpg";

const TAGLINES = [
  "Visualize what you speak.",
  "Speak your metrics into view.",
  "Present with pure presence.",
];

/** How long a completed tagline rests before the next one starts typing. */
const DWELL_MS = 2600;
const TYPE_MS = 42;

const COLS = 20;
const ROWS = 7;

export function TaglineBand() {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(reduced ? TAGLINES[0] : "");

  // Deterministic per-dot animation config. Randomising on every render would
  // restart the whole field each time state changed.
  const dots = useMemo(
    () =>
      Array.from({ length: COLS * ROWS }, (_, i) => {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        return {
          // A clear centre channel so the type never sits on a dot.
          inChannel: row >= 2 && row <= 4 && col >= 4 && col <= 15,
          driftX: [0, (i % 5) - 2, -((i % 3) - 1), 0],
          driftY: [0, (i % 7) - 3, -((i % 4) - 2), 0],
          driftDuration: 9 + (i % 11),
          collapseAt: (i % 9) * 1.4,
          collapseDuration: 1.6 + (i % 4) * 0.4,
          collapseEvery: 5 + (i % 6),
        };
      }),
    [],
  );

  useEffect(() => {
    if (reduced) {
      setTyped(TAGLINES[0]);
      return;
    }

    let index = 0;
    let i = 0;
    let current = "";
    let charTimer: ReturnType<typeof setInterval>;

    /**
     * Type → dwell → retype. The previous version restarted the cycle on a
     * fixed interval that was shorter than the typing time, so the band sat
     * blank for most of every loop.
     */
    const cycle = () => {
      if (i === 0) {
        current = TAGLINES[index];
        index = (index + 1) % TAGLINES.length;
        setTyped("");
      }
      i += 1;
      setTyped(current.slice(0, i));

      const dwell = i >= current.length ? DWELL_MS : TYPE_MS;
      if (i >= current.length) i = 0;
      charTimer = setTimeout(cycle, dwell);
    };

    charTimer = setTimeout(cycle, 400);

    return () => clearTimeout(charTimer);
  }, [reduced]);

  return (
    <section className="w-full px-[var(--gutter)] py-16 sm:py-20">
      <Reveal>
        <div className="relative mx-auto aspect-[16/9] w-full max-w-[1240px] overflow-hidden rounded-panel border border-border-strong shadow-card sm:aspect-[21/8]">
          <ImageWithFallback
            src={orangeTexture}
            alt=""
           className="size-full object-cover"
            loading="lazy"
          />

          {/* Dot field. Hidden from assistive tech — pure texture. */}
          <div
            aria-hidden
            className="absolute inset-4 hidden sm:inset-8 md:grid"
            style={{
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
              gap: "clamp(4px, 1.4vw, 14px)",
            }}
          >
            {dots.map((dot, i) =>
              dot.inChannel ? (
                <span key={i} className="self-center" />
              ) : (
                <motion.span
                  key={i}
                 className="size-1.5 self-center justify-self-center rounded-full bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.18)] md:size-2"
                  animate={
                    reduced
                      ? undefined
                      : {
                          x: dot.driftX,
                          y: dot.driftY,
                          scale: [1, 1, 0, 1, 1],
                          opacity: [1, 1, 0, 1, 1],
                        }
                  }
                  transition={
                    reduced
                      ? undefined
                      : {
                          x: { duration: dot.driftDuration, repeat: Infinity, ease: "easeInOut" },
                          y: { duration: dot.driftDuration, repeat: Infinity, ease: "easeInOut" },
                          scale: {
                            duration: dot.collapseDuration,
                            repeatDelay: dot.collapseEvery,
                            repeat: Infinity,
                            delay: dot.collapseAt,
                            ease: "easeInOut",
                          },
                          opacity: {
                            duration: dot.collapseDuration,
                            repeatDelay: dot.collapseEvery,
                            repeat: Infinity,
                            delay: dot.collapseAt,
                            ease: "easeInOut",
                          },
                        }
                  }
                />
              ),
            )}
          </div>

          {/* Mobile dot field — sparser, offset so it never crowds the type. */}
          <div
            aria-hidden
            className="absolute inset-3 grid sm:hidden"
            style={{
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gridTemplateRows: "repeat(5, minmax(0, 1fr))",
              gap: "6px",
            }}
          >
            {Array.from({ length: 60 }, (_, i) => {
              const row = Math.floor(i / 12);
              const col = i % 12;
              const inChannel = row >= 1 && row <= 3 && col >= 3 && col <= 8;
              return inChannel ? (
                <span key={i} />
              ) : (
                <span
                  key={i}
                 className="size-1.5 justify-self-center self-center rounded-full bg-white/85"
                  style={
                    reduced
                      ? undefined
                      : { animation: `drift-dot ${6 + (i % 7)}s ease-in-out ${i % 5}s infinite alternate` }
                  }
                />
              );
            })}
          </div>

          <div className="absolute inset-0 flex items-center justify-center px-6">
            {/* The typewriter is decorative; the accessible name is the full
                set of taglines so a screen reader is not read a fragment. */}
            <h2 className="sr-only">Stash Live taglines</h2>
            <p
              aria-hidden
              className="text-center font-serif text-[clamp(1.375rem,3.4vw,2.5rem)] font-light tracking-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.28)]"
            >
              {typed}
              <motion.span
               className="ml-0.5 inline-block w-[2px] translate-y-[0.15em] bg-white/90"
                animate={reduced ? { opacity: 1 } : { opacity: [1, 1, 0] }}
                transition={
                  reduced
                    ? { duration: 0.01 }
                    : { duration: 1.05, repeat: Infinity, times: [0, 0.5, 1], ease: "linear" }
                }
                style={{ height: "1em" }}
              />
            </p>
            <ul className="sr-only">
              {TAGLINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
