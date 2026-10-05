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
import { useAuth } from "@/app/auth/AuthContext";
import { useReducedMotion } from "@/app/motion";
import { Hero } from "./landing/Hero";
import { LandingHeader } from "./landing/LandingHeader";
import { HowItWorks } from "./landing/HowItWorks";
import { EngagementGap } from "./landing/EngagementGap";
import { TaglineBand } from "./landing/TaglineBand";
import { Integrations } from "./landing/Integrations";
import { LandingFooter } from "./landing/LandingFooter";
import { TOPIC_KEYS, type TopicKey } from "./landing/content";

/** The hero teaser and the demo share one rotating topic so they feel linked. */
const CYCLE_MS = 4200;

export default function App() {
  const reduced = useReducedMotion();
  const { status } = useAuth();
  const [topic, setTopic] = useState<TopicKey>(TOPIC_KEYS[0]);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 32, mass: 0.4 });

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setTopic((prev) => TOPIC_KEYS[(TOPIC_KEYS.indexOf(prev) + 1) % TOPIC_KEYS.length]);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    document.title = "Stash Live — project live metrics as you speak";
  }, []);

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background">
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

      <main id="main" className="flex-1">
        <Hero topic={topic} />
        <HowItWorks />
        <EngagementGap />
        <TaglineBand />
        <Integrations />
      </main>

      <LandingFooter />

      {/* Signed-in visitors keep a persistent route back to their workspace. */}
      {status === "signed-in" && <SignedInNudge />}
    </div>
  );
}

function SignedInNudge() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="glass-strong pointer-events-auto flex items-center gap-4 rounded-full py-2 pl-5 pr-2">
        <span className="text-[0.8125rem] text-foreground">You&rsquo;re signed in</span>
        <a
          href="/dashboard"
         className="rounded-full bg-primary px-4 py-2 text-[0.8125rem] font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover active:translate-y-0"
        >
          Open dashboard
        </a>
      </div>
    </div>
  );
}
