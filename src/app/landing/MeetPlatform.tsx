/**
 * The meeting platform section.
 *
 * This is the section that has to carry a strategic shift: Stash Live used to
 * be a plugin for somebody else's call, and now it *is* the call. The argument
 * it makes is therefore not "we also integrate with Meet" but "we stopped
 * needing Meet's permission" — and the honest detail underneath that is that
 * owning the pipeline is what let the card be burned into the video instead of
 * overlaid on top of it.
 *
 * The demo panel is a real `MeetingTile`-shaped grid rather than a screenshot,
 * because a picture of a video call says nothing about whether the card is in
 * the pixels. The visual claim here is specifically that the card sits *inside*
 * the video frame, so the illustration has to show it inside the frame.
 */
import { motion } from "motion/react";
import {
  Captions,
  Lock,
  MessageSquare,
  MonitorUp,
  Shield,
  Sparkles,
  Video,
} from "lucide-react";
import { Accent, Action, Reveal, SectionHeading, Surface, Telemetry } from "@/app/components/primitives";
import { GlassCard } from "@stash/card-react";
import { REVENUE_CARD } from "@stash/card-core";
import { EASE, useReducedMotion } from "@/app/motion";

const CAPABILITIES = [
  {
    icon: Video,
    title: "Invite code or link",
    body: "Three groups of letters, read out loud or pasted into a chat. No account required to join.",
  },
  {
    icon: MonitorUp,
    title: "Screen share beside your face",
    body: "The deck is a separate track, so your camera — and any card on it — stays on screen throughout.",
  },
  {
    icon: Captions,
    title: "Captions from the speaker's device",
    body: "Speech is recognised in the browser and relayed as text. The audio stream itself never leaves the peer connection.",
  },
  {
    icon: MessageSquare,
    title: "Chat, reactions, and a card rail",
    body: "Every card anyone puts on air is kept in the meeting, so the room can read the numbers properly afterwards.",
  },
  {
    icon: Lock,
    title: "Lockable door",
    body: "Guests queue outside and you admit them one at a time. Useful when you would rather not go live to a stranger.",
  },
  {
    icon: Shield,
    title: "Media never touches our servers",
    body: "Peer-to-peer WebRTC with DTLS-SRTP. Stash Live relays the connection and holds the cards, nothing else.",
  },
];

export function MeetPlatform() {
  const reduced = useReducedMotion();

  return (
    <section
      id="meet"
      className="relative w-full scroll-mt-24 overflow-x-clip border-b border-border bg-background py-24 sm:py-28"
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-16 px-[var(--gutter)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
        <div>
          <SectionHeading
            eyebrow="Stash Live meetings"
            title={
              <>
                We stopped waiting for
                <br />
                <Accent>someone else's call.</Accent>
              </>
            }
            description="Stash Live used to be an overlay that had to convince a browser to hand us a modified camera stream. Now it is a meeting platform, and the card is composited into the video we transmit ourselves. Nothing is layered on top of a call you are borrowing — the numbers are in the pixels."
          />

          <Reveal delay={0.14}>
            <div className="mt-8 rounded-panel border border-border bg-card/50 p-5">
              <p className="text-[0.9375rem] leading-relaxed text-foreground">
                Hold the Stash Live button mid-sentence and say what you are about to describe. The engine
                grounds it against the sources you connected, writes a card, and it is live on your camera
                within a second — for every participant, with no one to click a link.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Action to="/meet" variant="primary" size="lg" trailingArrow>
                <Video className="size-4" aria-hidden />
                Join a meeting
              </Action>
              <Action href="/docs" variant="ghost" size="lg">
                How it works
              </Action>
            </div>
          </Reveal>

          <Reveal delay={0.26}>
            <ul className="mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/12">
                    <Icon className="size-3.5 text-brand" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] font-medium text-foreground">{title}</span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted-foreground">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Illustration: a meeting stage with the card inside the video frame. */}
        <Reveal delay={0.12}>
          <div className="relative isolate">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-10 -z-10 blur-2xl"
              style={{
                background:
                  "radial-gradient(58% 52% at 52% 46%, rgba(251,133,0,0.22) 0%, rgba(251,133,0,0.08) 46%, transparent 76%)",
              }}
            />
            <CallFrame reduced={reduced} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * A stylised meeting stage. The presenter tile is the only large one, and the
 * card is drawn *inside* it at video scale — the point of the whole section.
 */
function CallFrame({ reduced }: { reduced: boolean }) {
  return (
    <Surface tone="default" radius="panel" className="overflow-hidden p-3">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <span className="eyebrow">abc-efgj-pqrt</span>
        <div className="flex items-center gap-2">
          <Telemetry className="text-[0.6875rem] text-muted-subtle">4 in the meeting</Telemetry>
          <span className="flex items-center gap-1.5 rounded-full bg-brand/12 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-brand-ink">
            <span className="size-1 rounded-full bg-brand" aria-hidden />
            live
          </span>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Presenter tile, with the card composited into the frame. */}
        <div className="relative aspect-video overflow-hidden rounded-[0.875rem] bg-[#1F1A17]">
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(70% 60% at 42% 34%, #3B332E 0%, #221D1A 68%, #171311 100%)",
            }}
          />
          {/* A stand-in for the presenter: shoulders and head, softly lit. */}
          <svg
            viewBox="0 0 320 180"
            className="absolute inset-0 size-full"
            aria-hidden
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <radialGradient id="meet-face" cx="42%" cy="34%" r="52%">
                <stop offset="0%" stopColor="#6E5F55" />
                <stop offset="100%" stopColor="#3A322D" />
              </radialGradient>
            </defs>
            <ellipse cx="134" cy="74" rx="26" ry="30" fill="url(#meet-face)" />
            <path d="M78 180c0-38 25-58 56-58s56 20 56 58z" fill="#4A403A" />
          </svg>

          {/* The card, inside the video frame, at video scale. */}
          <div className="absolute inset-y-3 right-3 flex w-[42%] items-center">
            <motion.div
              className="w-full origin-right"
              initial={reduced ? { opacity: 1 } : { opacity: 0, x: 14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={reduced ? { duration: 0.01 } : { duration: 0.6, ease: EASE, delay: 0.2 }}
            >
              <div className="[&>div]:!text-[0.5rem] [&_p]:!leading-[1.35] [&_span]:!text-[0.44rem]">
                <GlassCard spec={REVENUE_CARD} />
              </div>
            </motion.div>
          </div>

          <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] text-[#FBF9F6] backdrop-blur-sm">
            Priya · presenting
          </span>
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-brand/90 px-2 py-0.5 text-[0.625rem] font-medium text-[#1A1512]">
            <Sparkles className="size-2.5" aria-hidden />
            on air
          </span>
        </div>

        {/* Attendees. */}
        <div className="flex flex-col gap-2.5">
          {[
            { initials: 'AR', hue: 168, name: 'Ana', speaking: true },
            { initials: 'MJ', hue: 268, name: 'Marcus', speaking: false },
            { initials: 'SK', hue: 34, name: 'Sana', speaking: false },
          ].map((p) => (
            <div
              key={p.initials}
              className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-[0.875rem] ${
                p.speaking ? "ring-2 ring-brand" : ""
              }`}
              style={{ background: `linear-gradient(150deg, hsl(${p.hue} 24% 20%), hsl(${p.hue + 30} 20% 13%))` }}
            >
              <span className="font-serif text-2xl text-[#FBF9F6]/80">{p.initials}</span>
              <span className="absolute bottom-1.5 left-2 text-[0.625rem] text-[#FBF9F6]/70">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Control bar, reduced. */}
      <div className="mt-3 flex items-center justify-center gap-2 px-1">
        {[Video, MonitorUp, Sparkles, Captions, MessageSquare].map((Icon, i) => (
          <span
            key={i}
            className={`flex size-9 items-center justify-center rounded-full border ${
              i === 2
                ? "border-brand/40 bg-brand/16 text-brand"
                : "border-border bg-card/60 text-muted-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ))}
        <span className="ml-2 rounded-full bg-destructive px-4 py-2 text-[0.75rem] font-medium text-destructive-foreground">
          Leave
        </span>
      </div>
    </Surface>
  );
}