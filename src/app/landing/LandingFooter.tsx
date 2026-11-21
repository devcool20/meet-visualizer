/**
 * Landing footer.
 *
 * Carries the closing CTA, the four link columns, the system status readout,
 * and the session motion toggle. The toggle is wired to the shared
 * `MotionProvider`, so it now actually governs every animation in the app
 * rather than only the ones on this page.
 */
import { Link } from "react-router";
import { Accent, Action, Reveal, StatusDot, Telemetry, Wordmark } from "@/app/components/primitives";
import { useMotionPrefs } from "@/app/motion";
import { chromeWebStoreUrl } from "@/lib/extension";
import footerBg from "@/imports/footer.jpg";

const COLUMNS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", to: "/#demo" },
      { label: "Why Stash Live", to: "/#features" },
      { label: "Integrations", to: "/#integrations" },
      { label: "Add to Chrome", href: chromeWebStoreUrl() },
    ],
  },
  {
    title: "Product tour",
    links: [
      { label: "Virtual camera", to: "/virtualcam" },
      { label: "Studio", to: "/studio" },
      { label: "Documentation", to: "/docs" },
      { label: "Help centre", to: "/help" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Dashboard", to: "/dashboard" },
      { label: "Account", to: "/dashboard/account" },
      { label: "Activity log", to: "/dashboard/activity" },
      { label: "Settings", to: "/dashboard/settings" },
    ],
  },
];

export function LandingFooter() {
  const { reduced, toggle, isOverridden } = useMotionPrefs();

  return (
    // `isolate` on the footer is load-bearing. The page root is a
    // `bg-background` wrapper, and negative z-index children paint *before* an
    // ancestor's own background, so without a stacking context here the
    // artwork was hidden behind it entirely.
    <footer className="relative isolate w-full overflow-hidden px-[var(--gutter)] pb-10 pt-20 sm:pb-12 sm:pt-28">
      {/* Artwork sits behind the closing CTA at full strength, anchored to the
          bottom edge at its natural aspect ratio. An earlier pass washed it out
          with opacity-30 under a full-height cream gradient, which erased it
          entirely; then `isolate` revealed it had been hidden behind the page
          root's background all along.

          The mask fades the lower third so the wash of trees never sits under
          the status row and copyright line - the artwork reads through the link
          columns, and the bottom band lands on clean cream. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src={footerBg}
          alt=""
          className="absolute inset-x-0 bottom-0 h-auto w-full object-bottom [mask-image:linear-gradient(to_bottom,#000_52%,transparent_100%)]"
          loading="lazy"
        />
        <div className="absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-background via-background/75 to-transparent" />
      </div>

      {/* Closing CTA */}
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-[clamp(1.875rem,3.6vw,2.875rem)] font-light leading-[1.1] tracking-[-0.025em] text-balance text-foreground">
          Ready to bring this into <Accent>your meetings?</Accent>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[0.9375rem] leading-relaxed text-muted-foreground">
          Install the extension, connect one workspace, and your first card is live before the call
          starts.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Action to="/signup" variant="primary" size="lg" trailingArrow>
            Get started
          </Action>
          <Action href={chromeWebStoreUrl()} variant="outline" size="lg">
            Add to Chrome
          </Action>
        </div>
      </Reveal>

      {/* Link columns */}
      <div className="mx-auto mt-20 grid max-w-[1240px] gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark size="md" className="block text-foreground" />
          <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
            The ambient presenter suite. Project live data without leaving your own camera feed.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="eyebrow mb-4 text-muted-subtle">{col.title}</h3>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link
                      to={link.to}
                     className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                     className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Status + motion control */}
      <div className="mx-auto mt-16 max-w-[1240px] border-t border-border pt-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
              <StatusDot tone="success" pulse />
              All systems operational
            </span>
            <Telemetry className="text-[0.6875rem] text-muted-subtle">v1.4.2 cloud</Telemetry>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={reduced}
            onClick={toggle}
           className="group inline-flex items-center gap-3 self-start rounded-full border border-border px-3.5 py-2 transition-colors duration-200 hover:border-border-strong sm:self-auto"
          >
            <span className="text-[0.8125rem] text-muted-foreground group-hover:text-foreground">
              Reduce motion
            </span>
            <span
              aria-hidden
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                reduced ? "bg-primary" : "bg-switch-background"
              }`}
            >
              <span
               className="absolute left-0.5 size-4 rounded-full bg-background shadow-subtle transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ transform: reduced ? "translateX(16px)" : "translateX(0)" }}
              />
            </span>
            <span className="sr-only">
              {isOverridden
                ? `Motion reduced by user choice. Currently ${reduced ? "reduced" : "full"}.`
                : `Currently following your system setting: ${reduced ? "reduced" : "full"}.`}
            </span>
          </button>
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-subtle">© 2026 Stash Live Inc. All rights reserved.</p>
          <p className="text-xs text-muted-subtle">Ambient presenter suite</p>
        </div>
      </div>
    </footer>
  );
}
