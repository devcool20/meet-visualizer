import { Link } from "react-router";
import { ArrowUpRight, ArrowUp } from "lucide-react";
import { Action, Reveal } from "@/app/components/primitives";
import { useMotionPrefs } from "@/app/motion";
export function LandingFooter() {
  const { reduced, toggle } = useMotionPrefs();
  return (
    <footer className="landing-footer">
      <div className="landing-shell">
        <Reveal>
          <div className="footer-cta">
            <div>
              <p className="landing-kicker">
                YOUR NEXT MEETING, WITH MORE CONTEXT.
              </p>
              <h2>
                Make your point.
                <br />
                <em>Stay in the picture.</em>
              </h2>
              <p>Try a rehearsal. Find your flow. Bring it to the room.</p>
            </div>
            <div className="footer-cta-actions">
              <Action to="/rehearse" variant="brand" size="lg" trailingArrow>
                Try a rehearsal
              </Action>
              <Link to="/meet" className="landing-text-link">
                Join a meeting <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
        </Reveal>
        <div className="footer-nav">
          <div>
            <Link className="landing-logo" to="/">
              stash<span>live</span>
            </Link>
            <p>Live data. Human conversations.</p>
          </div>
          <nav aria-label="Footer product">
            <a href="#demo">How it works</a>
            <a href="#meet">Meetings</a>
            <a href="#integrations">Integrations</a>
          </nav>
          <nav aria-label="Footer resources">
            <Link to="/docs">Documentation</Link>
            <Link to="/help">Help centre</Link>
            <Link to="/dashboard">Dashboard</Link>
          </nav>
          <a className="back-to-top" href="#about">
            Back to top <ArrowUp size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Stash Live</span>
          <button
            type="button"
            role="switch"
            aria-checked={reduced}
            onClick={toggle}
          >
            Reduce motion <span>{reduced ? "On" : "Off"}</span>
          </button>
          <span>Made for the conversation.</span>
        </div>
      </div>
    </footer>
  );
}
