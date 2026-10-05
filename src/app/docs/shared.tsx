import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "motion/react";
import { Link } from "react-router";
import { AmbientBackground as SharedAmbientBackground } from "@/app/components/primitives";
import { useMotionPrefs, useReducedMotion } from "@/app/motion";

/**
 * Shared building blocks + page chrome for the docs/help split (plan A4.4).
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

/**
 * Re-export of the shared primitive, so `/docs` and `/help` use the exact same
 * depth layer as the landing page instead of a private copy.
 */
export const AmbientBackground = SharedAmbientBackground;

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
     className="telemetry rounded bg-background-sunken px-1.5 py-0.5 text-foreground"
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
       className="flex items-center justify-between gap-3 px-5 py-2.5"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-brand" />
          <span className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
          <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
          <span className="ml-2 text-[11px] uppercase tracking-widest" style={{ color: MUTED, fontFamily: MONO }}>
            {lang}
          </span>
        </div>
        <button
          onClick={copy}
         className="shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent"
          style={{ color: copied ? ACCENT : MUTED, fontFamily: MONO }}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="telemetry overflow-x-auto p-5 text-sm leading-relaxed text-foreground" >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 space-y-4 text-[0.9375rem]">
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
     className="flex items-start gap-3 p-5"
      style={{
        background: "rgba(251,133,0,0.06)",
        border: "1px solid rgba(251,133,0,0.18)",
        color: "#5A5550",
        lineHeight: 1.75,
      }}
    >
      <span
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning-surface text-[0.625rem] font-bold text-brand-ink"
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
             className="telemetry text-xs text-brand"
            >
              {String(index).padStart(2, "0")}
            </span>
            <span className="h-px flex-1 max-w-[40px] h-px w-10 bg-brand/35" />
            <p className="text-xs uppercase tracking-widest font-semibold text-brand">
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
  // Was a private copy seeded once from the media query and never updated, so
  // the OS setting needed a reload and the toggle only affected this page.
  const reducedMotion = useReducedMotion();
  const motionPrefs = useMotionPrefs();
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
    <div className="relative min-h-screen w-full bg-background font-sans text-foreground">
      {/* The shell reads the app-wide motion preference rather than owning a
          private copy, so the footer toggle governs every screen. */}
      <AmbientBackground className="fixed -z-10 inset-0" />

      <motion.div
       className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left"
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
             className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-accent md:hidden"
              aria-label="Toggle docs menu"
              aria-expanded={isMenuOpen}
              aria-controls="docs-mobile-menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
               className="size-5"
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
              className="hidden items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground md:flex"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
               className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              back home
            </Link>

            <span
             className="rounded-full bg-accent px-3 py-1 font-medium text-foreground"
            >
              {routeLabel}
            </span>
          </div>

          <div className="flex items-center pr-2 select-none">
            <Link to="/" className="text-lg font-medium tracking-tight" >
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
             className="rounded-2xl p-4 md:hidden"
              style={GLASS}
            >
              <Link
                to="/"
               className="block rounded-lg px-3.5 py-3 text-[0.9375rem] text-foreground transition-colors duration-200 hover:bg-accent"
              >
                ← back home
              </Link>
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left capitalize ${
                    activeSection === s.id
                      ? "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
            <div className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-2">
                {!reducedMotion && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                )}
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
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
            <p className="max-w-2xl max-w-2xl text-[1.0625rem]">
              {heroDescription}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {quickJumpIds.map((id) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                 className="transition-colors duration-200 hover:-translate-y-0.5"
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
                   className="relative w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-accent"
                    style={{ color: isActive ? FG : MUTED, fontWeight: isActive ? 600 : 400 }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="docs-active-rule"
                        className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand"
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
                <p className="font-serif text-[1.6rem] font-light tracking-tight text-foreground">
                  Ready to present with presence?
                </p>
                <p className="text-sm mt-1 text-muted-foreground">
                  Head back and try the live demo on the landing page.
                </p>
              </div>
              <Link
                to="/"
                className="inline-flex items-center gap-2 self-start rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover sm:self-auto"
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

      {/* The toggle now drives the app-wide preference, so it governs the
          landing page, the dashboard, and the meet surfaces too — not just
          the animations on this page. */}
      <div className="glass fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-3 py-2">
        <button
          type="button"
          onClick={motionPrefs.toggle}
          role="switch"
          aria-checked={reducedMotion}
          aria-label="Reduce motion"
         className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
          style={{ background: reducedMotion ? "#1A1512" : "rgba(26,21,18,0.15)" }}
        >
<span
            aria-hidden
            className="absolute left-0.5 size-4 rounded-full bg-background shadow-subtle transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: reducedMotion ? "translateX(16px)" : "translateX(0)" }}
          />
        </button>
        <span className="text-[0.6875rem] text-muted-foreground">
          {reducedMotion ? "Motion reduced" : "Motion on"}
        </span>
      </div>
    </div>
  );
}
