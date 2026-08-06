import * as React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "motion/react";
import { Link } from "react-router";

/**
 * Shared building blocks + page chrome for the docs/help split (plan §4.4).
 *
 * `DocsPage.tsx` (developer/self-host) and `HelpPage.tsx` (end-user) both
 * reuse this: the same glass header, hero, sticky-sidebar scroll-spy,
 * reading-progress bar, and `DocSectionBlock` numbering — only the copy and
 * section list differ between the two pages.
 */

export const EASE = [0.16, 1, 0.3, 1] as const;

export const SERIF = "'Cormorant Garamond', serif";
export const MONO = "'JetBrains Mono', monospace";

export const FG = "#1A1512";
export const MUTED = "#5A5550";
export const ACCENT = "#fb8500";

export type DocSection = { id: string; label: string };

export const GLASS: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.45)",
  backdropFilter: "blur(20px) saturate(120%)",
  WebkitBackdropFilter: "blur(20px) saturate(120%)",
  border: "1px solid rgba(26,21,18,0.06)",
  boxShadow: "0 8px 32px 0 rgba(26, 21, 18, 0.03)",
};

/* ─────────────────────────  small building blocks  ───────────────────────── */

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded-md text-[0.85em] align-baseline"
      style={{ fontFamily: MONO, background: "rgba(26,21,18,0.05)", color: "#1A1512" }}
    >
      {children}
    </code>
  );
}

export function CodeBlock({ children, lang = "bash" }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
  const copy = () => {
    navigator.clipboard?.writeText(children).then(
      () => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };
  return (
    <div className="rounded-2xl overflow-hidden my-5" style={GLASS}>
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(26,21,18,0.06)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(251,133,0,0.6)" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(26,21,18,0.14)" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(26,21,18,0.08)" }} />
          <span className="ml-2 text-[11px] uppercase tracking-widest" style={{ color: MUTED, fontFamily: MONO }}>
            {lang}
          </span>
        </div>
        <button
          onClick={copy}
          className="text-[11px] px-2 py-1 rounded-md transition-colors hover:bg-[rgba(26,21,18,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fb8500]"
          style={{ color: copied ? ACCENT : MUTED, fontFamily: MONO }}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: MONO, color: "#1A1512" }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4" style={{ color: "#5A5550", fontSize: "0.95rem", lineHeight: 1.8 }}>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 my-5 ${className}`} style={GLASS}>
      {children}
    </div>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 my-5 text-sm flex gap-3"
      style={{
        background: "rgba(251,133,0,0.06)",
        border: "1px solid rgba(251,133,0,0.18)",
        color: "#5A5550",
        lineHeight: 1.75,
      }}
    >
      <span
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{ background: "rgba(251,133,0,0.15)", color: "#fb8500" }}
        aria-hidden
      >
        !
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Scroll-reveal wrapper — respects reduced motion. */
export function Reveal({
  children,
  reducedMotion,
  delay = 0,
}: {
  children: React.ReactNode;
  reducedMotion: boolean;
  delay?: number;
}) {
  if (reducedMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function DocSectionBlock({
  index,
  id,
  eyebrow,
  title,
  reducedMotion,
  children,
}: {
  index: number;
  id: string;
  eyebrow: string;
  title: string;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-24 scroll-mt-32">
      <Reveal reducedMotion={reducedMotion}>
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ fontFamily: MONO, color: "#fb8500" }}
            >
              {String(index).padStart(2, "0")}
            </span>
            <span className="h-px flex-1 max-w-[40px]" style={{ background: "rgba(251,133,0,0.35)" }} />
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#fb8500" }}>
              {eyebrow}
            </p>
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(1.9rem, 3vw, 2.6rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512",
              lineHeight: 1.15,
            }}
          >
            {title}
          </h2>
        </div>
      </Reveal>
      <Reveal reducedMotion={reducedMotion} delay={0.05}>
        <div>{children}</div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────  ambient background  ───────────────────────── */

export function AmbientBackground({ reducedMotion }: { reducedMotion: boolean }) {
  const blobs = useMemo(
    () => [
      { top: "-10%", left: "-8%", size: 520, color: "rgba(251,133,0,0.10)", dur: 22 },
      { top: "30%", right: "-12%", size: 620, color: "rgba(251,133,0,0.06)", dur: 28 },
      { bottom: "-15%", left: "20%", size: 560, color: "rgba(26,21,18,0.035)", dur: 25 },
    ],
    [],
  );
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(26,21,18,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(26,21,18,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)",
        }}
      />
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: b.top,
            left: b.left,
            right: b.right,
            bottom: b.bottom,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
          animate={reducedMotion ? undefined : { x: [0, 30, -20, 0], y: [0, -25, 15, 0] }}
          transition={reducedMotion ? undefined : { duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────  page chrome  ────────────────────────────── */

/**
 * Full docs-style page shell: glass header + hero + sticky-sidebar
 * scroll-spy + reading-progress bar + reduced-motion toggle. Both
 * `/docs` and `/help` render this with different `routeLabel`/copy/sections
 * and their own `DocSectionBlock` children.
 */
export function DocsPageShell({
  routeLabel,
  badgeLabel,
  heroTitle,
  heroDescription,
  quickJumpIds,
  sections,
  children,
}: {
  routeLabel: string;
  badgeLabel: string;
  heroTitle: string;
  heroDescription: React.ReactNode;
  quickJumpIds: string[];
  sections: DocSection[];
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? "");
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isScrollingToRef = useRef<string | null>(null);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const observers = sections.map(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrollingToRef.current) setActiveSection(id);
        },
        { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
      );
      observer.observe(el);
      return { observer, el };
    });
    return () => observers.forEach((o) => o && o.observer.unobserve(o.el));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollTo = (id: string) => {
    isScrollingToRef.current = id;
    setActiveSection(id);
    setIsMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    setTimeout(() => {
      if (isScrollingToRef.current === id) isScrollingToRef.current = null;
    }, 800);
  };

  return (
    <div
      className="min-h-screen w-full relative"
      style={{ backgroundColor: "#FBF9F6", fontFamily: "'Inter', sans-serif", color: "#1A1512" }}
    >
      <AmbientBackground reducedMotion={reducedMotion} />

      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 z-[60] origin-left"
        style={{ scaleX: progress, background: "linear-gradient(90deg, #fb8500, rgba(251,133,0,0.4))" }}
        aria-hidden
      />

      {/* ─── HEADER ─── */}
      <header className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl rounded-full z-50 px-4 py-2.5 md:px-8 md:py-3.5">
        <div className="absolute inset-0 rounded-full -z-10 overflow-hidden" style={GLASS} />
        <div className="flex items-center justify-between w-full relative">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMenuOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-full hover:bg-[rgba(26,21,18,0.06)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fb8500] flex items-center justify-center z-50"
              aria-label="Toggle docs menu"
              aria-expanded={isMenuOpen}
              aria-controls="docs-mobile-menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className="w-5 h-5 text-[#1A1512]"
                strokeWidth="2.2"
              >
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <Link
              to="/"
              className="hidden md:flex items-center gap-2 px-3.5 py-1.5 text-sm rounded-full transition-colors font-medium hover:bg-[rgba(26,21,18,0.06)] group"
              style={{ color: "#5A5550", letterSpacing: "0.01em" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className="w-4 h-4 motion-safe:transition-transform motion-safe:group-hover:-translate-x-0.5"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              back home
            </Link>

            <span
              className="text-sm px-3 py-1 rounded-full font-medium hidden md:inline"
              style={{ background: "rgba(26,21,18,0.06)", color: "#1A1512" }}
            >
              {routeLabel}
            </span>
          </div>

          <div className="flex items-center pr-2 select-none">
            <Link to="/" className="text-lg font-medium tracking-tight" style={{ fontFamily: SERIF, fontSize: "1.35rem", color: "#1A1512" }}>
              Stash Live
            </Link>
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              id="docs-mobile-menu"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-[calc(100%+0.5rem)] left-0 right-0 rounded-2xl p-4 flex flex-col gap-1 md:hidden max-h-[70vh] overflow-y-auto"
              style={GLASS}
            >
              <Link
                to="/"
                className="px-4 py-3 rounded-xl text-sm font-medium text-left text-[#5A5550] hover:text-[#1A1512] hover:bg-[rgba(26,21,18,0.03)] transition-colors"
              >
                ← back home
              </Link>
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left capitalize ${
                    activeSection === s.id
                      ? "bg-[rgba(26,21,18,0.06)] text-[#1A1512] font-semibold"
                      : "text-[#5A5550] hover:text-[#1A1512] hover:bg-[rgba(26,21,18,0.03)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative w-full pt-40 pb-16 px-6 sm:px-12 lg:px-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.6, ease: EASE }}
          >
            <div
              className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ ...GLASS, color: "#5A5550" }}
            >
              <span className="relative flex h-2 w-2">
                {!reducedMotion && (
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                    style={{ background: "#fb8500" }}
                  />
                )}
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#fb8500" }} />
              </span>
              {badgeLabel}
            </div>
            <h1
              className="mb-6 leading-tight"
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
                fontWeight: 300,
                letterSpacing: "-0.02em",
                color: "#1A1512",
              }}
            >
              {heroTitle}
            </h1>
            <p className="max-w-2xl" style={{ color: "#5A5550", fontSize: "1.05rem", lineHeight: 1.8 }}>
              {heroDescription}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {quickJumpIds.map((id) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors motion-safe:transition-all motion-safe:hover:-translate-y-0.5"
                  style={{ ...GLASS, color: FG }}
                >
                  <span className="capitalize">{id}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── BODY ─── */}
      <div className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-20 pb-24 grid lg:grid-cols-[220px_1fr] gap-12 relative">
        <aside className="hidden lg:block">
          <div className="sticky top-32">
            <p className="text-[11px] uppercase tracking-widest mb-4 font-semibold px-3" style={{ color: MUTED }}>
              On this page
            </p>
            <nav className="flex flex-col gap-0.5">
              {sections.map((s) => {
                const isActive = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className="relative text-left pl-4 pr-3 py-2 rounded-lg text-sm transition-colors capitalize hover:bg-[rgba(26,21,18,0.03)]"
                    style={{ color: isActive ? FG : MUTED, fontWeight: isActive ? 600 : 400 }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="docs-active-rule"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                        style={{ background: "#fb8500" }}
                        transition={reducedMotion ? { duration: 0.01 } : { ease: EASE, duration: 0.4 }}
                      />
                    )}
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          {children}

          <Reveal reducedMotion={reducedMotion}>
            <div
              className="rounded-3xl p-8 sm:p-10 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              style={GLASS}
            >
              <div>
                <p style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 300, color: "#1A1512", letterSpacing: "-0.01em" }}>
                  Ready to present with presence?
                </p>
                <p className="text-sm mt-1" style={{ color: "#5A5550" }}>
                  Head back and try the live demo on the landing page.
                </p>
              </div>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80 whitespace-nowrap self-start sm:self-auto"
                style={{ background: "#1A1512", color: "#FBF9F6" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Stash Live
              </Link>
            </div>
          </Reveal>
        </main>
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-full" style={GLASS}>
        <button
          onClick={() => setReducedMotion((v) => !v)}
          className="relative inline-flex items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fb8500]"
          style={{ width: "36px", height: "20px", background: reducedMotion ? "#1A1512" : "rgba(26,21,18,0.15)", flexShrink: 0 }}
          aria-label="Toggle reduced motion"
          role="switch"
          aria-checked={reducedMotion}
        >
          <span
            className="absolute rounded-full transition-transform"
            style={{
              width: "14px",
              height: "14px",
              background: "#FBF9F6",
              top: "3px",
              left: "3px",
              transform: reducedMotion ? "translateX(16px)" : "translateX(0)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
        <span className="text-[10px]" style={{ color: "#5A5550" }}>{reducedMotion ? "motion off" : "motion on"}</span>
      </div>
    </div>
  );
}
