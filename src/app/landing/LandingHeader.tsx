/**
 * The floating landing header.
 *
 * One bar for the whole page rather than per-section nav: desktop gets the
 * section list, mobile gets a sheet. The bar material changes as the hero
 * scrolls away — driven by scroll progress, not by a section spy, so it can
 * never disagree with what is on screen.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, Video, X } from "lucide-react";
import { Action, Wordmark } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";
import { EASE, DURATION, useReducedMotion } from "@/app/motion";
import { useAuth } from "@/app/auth/AuthContext";
import { NAV_SECTIONS } from "./content";

export function LandingHeader() {
  const reduced = useReducedMotion();
  const { status } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 40);
  });

  // A scrollable region behind the sheet should not scroll the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Skip link — the first focusable thing on the page. */}
      <a
        href="#main"
       className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-primary focus:px-5 focus:py-2.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <motion.header
       className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5"
        initial={false}
        animate={{
          y: reduced ? 0 : 0,
        }}
      >
        <motion.nav
          aria-label="Primary"
          initial={false}
          animate={{
            backgroundColor: scrolled ? "rgba(251, 249, 246, 0.82)" : "rgba(22, 18, 16, 0.34)",
            borderColor: scrolled ? "rgba(26, 21, 18, 0.08)" : "rgba(251, 249, 246, 0.12)",
          }}
          transition={{ duration: reduced ? 0.01 : 0.3, ease: EASE }}
          className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 rounded-full border px-3 py-2 backdrop-blur-xl sm:px-4 sm:py-2.5"
          style={{
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
          }}
        >
          {/* Brand */}
          <Link
            to="/"
            aria-label="Stash Live home"
           className={cn("shrink-0 rounded-full px-2 py-1 transition-opacity duration-200 hover:opacity-75", scrolled ? "text-foreground" : "text-[#FBF9F6]")}
          >
            <Wordmark
              size="sm"
              className={scrolled ? "text-foreground" : "text-[#FBF9F6]"}
            />
          </Link>

          {/* Section links — desktop */}
          <ul className="hidden items-center gap-0.5 md:flex">
            {NAV_SECTIONS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
                    scrolled
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-[#FBF9F6]/70 hover:text-[#FBF9F6]"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/docs"
                className={`rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
                  scrolled
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-[#FBF9F6]/70 hover:text-[#FBF9F6]"
                }`}
              >
                Docs
              </Link>
            </li>
          </ul>

{/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {/* The meeting platform is the front door now, so it gets the first
                button on the page rather than being buried in the footer. */}
            <Link
              to="/meet"
              className={cn(
                "hidden items-center gap-2 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-all duration-200 sm:inline-flex",
                scrolled
                  ? "bg-foreground text-background hover:opacity-85"
                  : "bg-[#FBF9F6] text-foreground hover:bg-[#FBF9F6]/88",
              )}
            >
              <Video className="size-3.5" strokeWidth={2.25} />
              Join Meet
            </Link>
            <Action
              to={status === "signed-in" ? "/dashboard" : "/signup"}
              size="sm"
              variant={scrolled ? "primary" : "brand"}
              className="hidden sm:inline-flex"
            >
              {status === "signed-in" ? "Dashboard" : "Get started"}
            </Action>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="landing-mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className={`flex size-9 items-center justify-center rounded-full transition-colors duration-200 md:hidden ${
                scrolled
                  ? "text-foreground hover:bg-accent"
                  : "text-[#FBF9F6] hover:bg-[#FBF9F6]/12"
              }`}
            >
              {open ? <X className="size-4.5" strokeWidth={2} /> : <Menu className="size-4.5" strokeWidth={2} />}
            </button>
          </div>
        </motion.nav>
      </motion.header>

      {/* Mobile sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-mobile-menu"
           className="fixed inset-x-0 top-0 z-40 px-4 pt-[4.75rem] md:hidden"
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.2 }}
          >
            <motion.div
             className="glass-strong rounded-panel p-4"
              initial={reduced ? false : { y: -10 }}
              animate={reduced ? undefined : { y: 0 }}
              transition={{ duration: reduced ? 0.01 : DURATION.base, ease: EASE }}
            >
              <ul className="flex flex-col">
                {NAV_SECTIONS.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => setOpen(false)}
                     className="block rounded-lg px-3.5 py-3 text-[0.9375rem] text-foreground transition-colors duration-200 hover:bg-accent"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link
                    to="/docs"
                    onClick={() => setOpen(false)}
                   className="block rounded-lg px-3.5 py-3 text-[0.9375rem] text-foreground transition-colors duration-200 hover:bg-accent"
                  >
                    Docs
                  </Link>
                </li>
              </ul>
<div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <Link
                  to="/meet"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-3 text-[0.9375rem] font-medium text-background"
                >
                  <Video className="size-4" strokeWidth={2.25} />
                  Join Meet
                </Link>
                <Action
                  to={status === "signed-in" ? "/dashboard" : "/signup"}
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  {status === "signed-in" ? "Go to Dashboard" : "Get started free"}
                </Action>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
