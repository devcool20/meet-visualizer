import { motion } from "motion/react";
import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import { Action } from "@/app/components/primitives";
import { EASE, useReducedMotion } from "@/app/motion";
import type { TopicKey } from "./content";
import { PresenterStage } from "./PresenterStage";

export function Hero({ topic }: { topic: TopicKey }) {
  const reduced = useReducedMotion();
  return (
    <section id="about" className="landing-hero">
      <div className="landing-shell hero-grid">
        <div className="hero-copy">
          <motion.p
            className="landing-kicker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.5 }}
          >
            <span className="live-dot" /> A LITTLE LESS SCREEN SHARING. A LOT
            MORE YOU.
          </motion.p>
          <h1 aria-label="Your numbers. Your voice. One frame.">
            {["Your numbers.", "Your voice.", "One frame."].map((line, i) => (
              <span className="hero-line" key={line} aria-hidden="true">
                <motion.span
                  className={i === 2 ? "hero-accent" : ""}
                  initial={
                    reduced ? false : { y: "110%", rotateX: -35, opacity: 0 }
                  }
                  animate={{ y: 0, rotateX: 0, opacity: 1 }}
                  transition={{
                    duration: reduced ? 0 : 0.85,
                    delay: 0.08 + i * 0.12,
                    ease: EASE,
                  }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: reduced ? 0 : 0.4, ease: EASE }}
          >
            <p className="hero-description">
              Bring live charts and data into your camera feed, just by
              speaking. Keep your face in the conversation and your numbers
              right beside you.
            </p>
            <div className="hero-actions">
              <Action to="/rehearse" variant="brand" size="lg" trailingArrow>
                Try a rehearsal
              </Action>
              <a className="landing-text-link" href="#demo">
                See it in action <ArrowUpRight size={17} />
              </a>
            </div>
            <p className="hero-footnote">
              <Check size={14} /> Explore with sample data <span /> No setup
              needed
            </p>
          </motion.div>
        </div>
        <motion.div
          className="hero-product"
          initial={reduced ? false : { opacity: 0, y: 35, rotateY: -8 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: reduced ? 0 : 1, delay: 0.25, ease: EASE }}
        >
          <div className="product-overline">
            <span>THE CONVERSATION, WITH CONTEXT.</span>
            <span>01 / LIVE PREVIEW</span>
          </div>
          <PresenterStage topic={topic} />
          <div className="product-caption">
            <span className="caption-line" />
            <span>You say it. The right card appears.</span>
            <a href="#demo" aria-label="Try the interactive demo">
              <ArrowDown size={16} />
            </a>
          </div>
        </motion.div>
      </div>
      <div className="hero-bottom landing-shell">
        <span>Built for the moments that need a number.</span>
        <div>
          <span>Product reviews</span>
          <span>Team updates</span>
          <span>Customer calls</span>
        </div>
      </div>
    </section>
  );
}
