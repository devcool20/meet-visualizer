import {
  Captions,
  MessageSquare,
  MonitorUp,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Action, Reveal } from "@/app/components/primitives";
import { PresenterStage } from "./PresenterStage";

const CAPABILITIES = [
  {
    icon: Video,
    title: "One link. Everyone’s in.",
    body: "Invite your team with a link or meeting code. Guests can join without an account.",
  },
  {
    icon: MonitorUp,
    title: "Room for the whole story.",
    body: "Share a deck alongside your camera. Your face and your live cards stay visible.",
  },
  {
    icon: Captions,
    title: "Follow every word.",
    body: "Browser-generated captions help the room keep up with the conversation.",
  },
  {
    icon: MessageSquare,
    title: "Keep the useful bits.",
    body: "Chat, react, and revisit the cards shared during your meeting.",
  },
];
export function MeetPlatform() {
  return (
    <section id="meet" className="landing-section meeting-section">
      <div className="landing-shell">
        <div className="meeting-grid">
          <Reveal>
            <p className="landing-kicker">02 / MEET IN STASH LIVE</p>
            <h2 className="landing-heading">
              A better place
              <br />
              to <em>make your point.</em>
            </h2>
            <p className="landing-description">
              The call and the context, together. Hold the Stash Live button,
              say what you want to show, and bring a card into the conversation.
            </p>
            <div className="meeting-actions">
              <Action to="/meet" variant="primary" size="lg" trailingArrow>
                <Video size={16} /> Join a meeting
              </Action>
              <a href="/docs" className="landing-text-link">
                Read the docs
              </a>
            </div>
            <p className="meeting-note">
              <ShieldCheck size={15} /> Peer-to-peer encrypted audio and video
            </p>
          </Reveal>
          <Reveal delay={0.12} className="meeting-preview">
            <PresenterStage topic="revenue" />
            <p>Everyone sees the same card, right in the video.</p>
          </Reveal>
        </div>
        <div className="meeting-capabilities">
          {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="capability">
                <Icon size={21} strokeWidth={1.6} />
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
