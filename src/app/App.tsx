/**
 * Landing page.
 *
 * A composition root, not a monolith. Previously this was a 2,543-line file
 * holding the header, four hand-rolled preview cards, the hero, three sections
 * and the footer, with ~200 inline style blocks and five coexisting spellings
 * of the same palette. The sections now live in `./landing/` and compose from
 * the shared primitives.
 */
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { useReducedMotion, useMotionPrefs } from "@/app/motion";
import { Hero } from "./landing/Hero";
import { LandingHeader } from "./landing/LandingHeader";
import { HowItWorks } from "./landing/HowItWorks";
import { MeetPlatform } from "./landing/MeetPlatform";
import { EngagementGap } from "./landing/EngagementGap";
import "./landing/landing.css";
import { Integrations } from "./landing/Integrations";
import { LandingFooter } from "./landing/LandingFooter";
import { TOPIC_KEYS, type TopicKey } from "./landing/content";

/** Rotate sample cards until the visitor chooses reduced motion. */
const CYCLE_MS = 4200;

export default function App() {
  const reduced = useReducedMotion();
  const { toggle } = useMotionPrefs();
  const [topic, setTopic] = useState<TopicKey>(TOPIC_KEYS[0]);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 32,
    mass: 0.4,
  });

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setTopic(
        (prev) =>
          TOPIC_KEYS[(TOPIC_KEYS.indexOf(prev) + 1) % TOPIC_KEYS.length],
      );
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    document.title = "Stash Live — project live metrics as you speak";
  }, []);

  return (
    <div className="landing-page relative flex min-h-screen w-full flex-col bg-background">
      {/* Reading progress */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5">
        <motion.div
          className="h-full w-full origin-left"
          style={{
            scaleX: progress,
            background: "linear-gradient(90deg, rgba(251,133,0,0.25), #fb8500)",
          }}
        />
      </div>

      <LandingHeader />
      <button
        type="button"
        className="landing-motion-control"
        aria-pressed={reduced}
        onClick={() => toggle()}
      >
        {reduced ? "Motion off" : "Motion on"}
        <span aria-hidden="true">{reduced ? "○" : "◉"}</span>
      </button>

      <main id="main" className="flex-1">
        <Hero topic={topic} />
        <HowItWorks />
        <MeetPlatform />
        <EngagementGap />
        <Integrations />
      </main>

      <LandingFooter />
    </div>
  );
}
