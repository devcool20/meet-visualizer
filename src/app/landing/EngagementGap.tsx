import { Eye, Layers, AudioLines } from "lucide-react";
import { Reveal } from "@/app/components/primitives";
const benefits = [
  {
    icon: Eye,
    title: "Keep the human connection.",
    body: "Your expression, your emphasis, your eye contact. The things a spreadsheet can’t communicate stay in the room.",
  },
  {
    icon: Layers,
    title: "Give your numbers context.",
    body: "Bring up the card while you explain it. Your audience sees the data and hears the story at the same time.",
  },
  {
    icon: AudioLines,
    title: "Find your flow.",
    body: "Prepare your cards, then focus on the conversation. You can rehearse with sample data before your next call.",
  },
];
export function EngagementGap() {
  return (
    <section id="features" className="landing-section benefits-section">
      <div className="landing-shell">
        <Reveal>
          <p className="landing-kicker">03 / KEEP THE CONNECTION</p>
          <div className="benefits-intro">
            <h2 className="landing-heading">
              Be the presenter.
              <br />
              <em>Not the tiny square.</em>
            </h2>
            <p className="landing-description">
              Good conversations need a person, not just a presentation. Keep
              both in view.
            </p>
          </div>
        </Reveal>
        <div className="benefits-grid">
          {benefits.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <article>
                <Icon size={26} strokeWidth={1.4} />
                <h3>{title}</h3>
                <p>{body}</p>
                <span className="benefit-index">0{i + 1}</span>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
