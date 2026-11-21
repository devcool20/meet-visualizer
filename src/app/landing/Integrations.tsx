import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { Reveal } from "@/app/components/primitives";
import { INTEGRATIONS } from "./content";
export function Integrations() {
  return (
    <section id="integrations" className="landing-section integrations-section">
      <div className="landing-shell">
        <Reveal>
          <p className="landing-kicker">04 / BRING YOUR WORK WITH YOU</p>
          <h2 className="landing-heading">
            Your tools.
            <br />
            <em>A new way to show them.</em>
          </h2>
          <p className="landing-description">
            Turn the information your team already maintains into cards for the
            conversation.
          </p>
        </Reveal>
        <div className="integration-grid">
          {INTEGRATIONS.map(
            ({ id, name, description, note, available, icon: Icon }, i) => (
              <Reveal key={id} delay={i * 0.04}>
                <article
                  className={`integration-item ${!available ? "is-planned" : ""}`}
                >
                  <div className={`integration-icon integration-${id}`}>
                    <Icon className="size-6" />
                  </div>
                  <div className="integration-copy">
                    <h3>
                      {name}
                      {note && <span>{note}</span>}
                    </h3>
                    <p>{description}</p>
                  </div>
                  {available ? (
                    <Link
                      to="/dashboard/integrations"
                      aria-label={`Set up ${name}`}
                      className="integration-link"
                    >
                      <ArrowUpRight size={20} />
                    </Link>
                  ) : (
                    <span className="planned-label">Coming soon</span>
                  )}
                </article>
              </Reveal>
            ),
          )}
        </div>
        <Reveal>
          <p className="integration-note">
            Connections are managed in your workspace.{" "}
            <Link to="/docs">
              Explore the documentation <ArrowUpRight size={14} />
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
