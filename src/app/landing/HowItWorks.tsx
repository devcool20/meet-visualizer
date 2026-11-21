import { Reveal } from "@/app/components/primitives";
import { VoiceDemo } from "./VoiceDemo";
const steps = [
  {
    title: "Bring your context.",
    body: "Connect your sources and prepare the cards you want to have at hand.",
  },
  {
    title: "Say it your way.",
    body: "Speak naturally. Stash Live matches your words to the right card.",
  },
  {
    title: "Stay in the frame.",
    body: "Your data appears beside you, so everyone can follow the point you’re making.",
  },
];
export function HowItWorks() {
  return (
    <section id="demo" className="landing-section demo-section">
      <div className="landing-shell demo-grid">
        <div>
          <Reveal>
            <p className="landing-kicker">01 / FROM VOICE TO VISUAL</p>
            <h2 className="landing-heading">
              Less clicking.
              <br />
              <em>More conversation.</em>
            </h2>
            <p className="landing-description">
              A number is more useful when it arrives at the right moment. Try a
              topic and watch the card appear.
            </p>
          </Reveal>
          <div className="demo-steps">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.07}>
                <div className="demo-step">
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal delay={0.1} className="demo-playground">
          <div className="playground-label">
            <span className="live-dot" /> THE INTERACTIVE PLAYGROUND
            <span>TRY IT YOURSELF</span>
          </div>
          <VoiceDemo />
          <p className="demo-note">
            Sample cards. Try a topic above, type a keyword, or use your
            microphone.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
