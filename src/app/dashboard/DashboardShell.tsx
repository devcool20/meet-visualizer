/**
 * Dashboard shell.
 *
 * The app's frame, so it sets the frame for everything inside it. Changes from
 * the previous version:
 *
 *  - Responsive. The sidebar was a fixed 224px that ate a third of a phone
 *    viewport and never collapsed. It is now a top bar on small screens.
 *  - Icons and an active indicator, not five bare words distinguished only by
 *    a background tint.
 *  - The nav active state is a conditional class, so `transition-colors`
 *    actually applies (it was an inline style, which does not transition).
 *  - The extension status chip announces changes via `aria-live`.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  Layers,
  Plug,
  Mic,
  Activity,
  Settings,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { hasChromeRuntime, probeExtensionPresence } from "@/lib/extension";
import { isMockMode } from "@/lib/env";
import { useAuth } from "@/app/auth/AuthContext";
import { useSetupStatus } from "@/app/hooks/useSetupStatus";
import { SetupChecklist } from "@/app/onboarding/SetupChecklist";
import { Pill, StatusDot, Wordmark } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";

const NAV_ITEMS = [
  { to: "/dashboard/cards", label: "Cards", icon: Layers },
  { to: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { to: "/rehearse", label: "Rehearse", icon: Mic },
  { to: "/dashboard/activity", label: "Activity", icon: Activity },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const [extensionPresent, setExtensionPresent] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { signals, loading } = useSetupStatus();

  useEffect(() => {
    if (!hasChromeRuntime()) {
      setExtensionPresent(false);
      return;
    }
    let cancelled = false;
    probeExtensionPresence().then((present) => {
      if (!cancelled) setExtensionPresent(present);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const statusTone =
    extensionPresent === null ? "neutral" : extensionPresent ? "success" : "danger";

  const nav = (
    <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200",
              isActive
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* Active rule — a positional cue that survives a colour-blind read. */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-200",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              <Icon className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background lg:flex-row">
      {/* Skip link */}
      <a
        href="#dashboard-main"
       className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-2.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* ── Sidebar ── */}
      <aside className="sticky top-0 z-40 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-background px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center justify-between gap-2 px-1">
          <Link to="/" aria-label="Stash Live home" className="transition-opacity hover:opacity-70">
            <Wordmark size="md" className="block text-foreground" />
          </Link>
          {isMockMode() && <Pill tone="brand">Demo</Pill>}
        </div>

        {nav}

        <div className="mt-auto space-y-1 pt-6">
          <div
           className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2.5"
            data-testid="extension-status-chip"
            role="status"
            aria-live="polite"
          >
            <StatusDot tone={statusTone} pulse={extensionPresent === null} />
            <span className="text-xs leading-tight text-muted-foreground">
              {extensionPresent === null && "Checking extension…"}
              {extensionPresent === true && "Extension connected"}
              {extensionPresent === false && "Extension not detected"}
            </span>
          </div>

          <div className="hairline-t mt-3 pt-3">
            <NavLink
              to="/dashboard/account"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )
              }
            >
              <User className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              Account
            </NavLink>
            <button
              type="button"
              onClick={() => signOut()}
             className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-lg lg:hidden">
        <Link to="/" aria-label="Stash Live home" className="transition-opacity hover:opacity-70">
          <Wordmark size="sm" className="block text-foreground" />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="dashboard-drawer"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
         className="flex size-9 items-center justify-center rounded-lg text-foreground transition-colors duration-200 hover:bg-accent"
        >
          {menuOpen ? <X className="size-4.5" strokeWidth={2} /> : <Menu className="size-4.5" strokeWidth={2} />}
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div
          id="dashboard-drawer"
         className="sticky top-[3.75rem] z-30 border-b border-border bg-background px-4 py-4 lg:hidden"
        >
          {nav}
          <div className="mt-4 hairline-t flex flex-col gap-1 pt-3">
            <NavLink
              to="/dashboard/account"
             className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
            >
              <User className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              Account
            </NavLink>
            <button
              type="button"
              onClick={() => signOut()}
             className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main id="dashboard-main" className="flex-1 px-[var(--gutter)] py-8 lg:py-10">
        <div className="mx-auto w-full max-w-5xl">
          {!loading && <SetupChecklist signals={signals} />}
          {children}
        </div>
      </main>
    </div>
  );
}
