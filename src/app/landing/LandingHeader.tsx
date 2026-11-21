import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { NAV_SECTIONS } from "./content";
import { useAuth } from "@/app/auth/AuthContext";
import { isDemoSession } from "@/lib/auth";

export function LandingHeader() {
  const { status, session } = useAuth();
  const signedIn = status === "signed-in" && !isDemoSession(session);
  const [scrolled, setScrolled] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 801px)");
    const closeOnDesktop = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = "";
    };
  }, []);
  const close = () => dialog.current?.close();
  const destination = signedIn ? "/dashboard" : "/signup";
  return (
    <>
      <a href="#main" className="landing-skip">
        Skip to content
      </a>
      <header className={`landing-header ${scrolled ? "is-scrolled" : ""}`}>
        <nav aria-label="Primary" className="landing-shell header-inner">
          <Link to="/" className="landing-logo" aria-label="Stash Live home">
            <span className="logo-symbol" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            stash<span>live</span>
          </Link>
          <div className="header-links">
            {NAV_SECTIONS.map(({ id, label }) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
            <Link to="/docs">Docs</Link>
          </div>
          <div className="header-actions">
            <Link to="/meet" className="header-join">
              Join a meeting
            </Link>
            <Link className="header-start" to={destination}>
              {signedIn ? "Dashboard" : "Get started"}
              <ArrowUpRight size={15} />
            </Link>
            <button
              ref={trigger}
              type="button"
              className="mobile-menu-trigger"
              aria-label="Open menu"
              aria-haspopup="dialog"
              onClick={() => {
                dialog.current?.showModal();
                document.body.style.overflow = "hidden";
              }}
            >
              <Menu size={22} />
            </button>
          </div>
        </nav>
      </header>
      <dialog
        className="landing-mobile-dialog"
        ref={dialog}
        aria-labelledby="mobile-menu-title"
        onClose={() => {
          document.body.style.overflow = "";
          trigger.current?.focus();
        }}
        onCancel={() => {
          document.body.style.overflow = "";
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="mobile-menu-panel">
          <div>
            <span id="mobile-menu-title" className="landing-logo">
              stash<span>live</span>
            </span>
            <button type="button" onClick={close} aria-label="Close menu">
              <X size={22} />
            </button>
          </div>
          <nav aria-label="Mobile">
            {NAV_SECTIONS.map(({ id, label }) => (
              <a key={id} href={`#${id}`} onClick={close}>
                {label}
                <ArrowUpRight size={18} />
              </a>
            ))}
            <Link to="/docs" onClick={close}>
              Documentation
              <ArrowUpRight size={18} />
            </Link>
          </nav>
          <Link to="/meet" onClick={close} className="mobile-menu-meet">
            Join a meeting
          </Link>
          <Link to={destination} onClick={close} className="header-start">
            {signedIn ? "Dashboard" : "Get started"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </dialog>
    </>
  );
}
