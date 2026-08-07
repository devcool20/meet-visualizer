import { useEffect } from "react";
import { Link } from "react-router";
import { Code, Card, Callout, DocSectionBlock, DocsPageShell, type DocSection } from "./docs/shared";

/**
 * Stash Live — end-user Help page (/help), split out of the old
 * DocsPage.tsx per plan §4.4. Written for someone using the product, not
 * building it: what it does, how the funnel works, how sensitivity and
 * privacy settings behave, and what to do when something goes wrong in a
 * meeting. No architecture, no environment variables.
 */

const SECTIONS: DocSection[] = [
  { id: "overview", label: "overview" },
  { id: "getting-started", label: "getting started" },
  { id: "rehearsal", label: "rehearsal" },
  { id: "cards", label: "your cards" },
  { id: "sensitivity", label: "sensitivity" },
  { id: "privacy", label: "privacy" },
  { id: "troubleshooting", label: "troubleshooting" },
];

export default function HelpPage() {
  useEffect(() => {
    document.title = "Help — Stash Live";
  }, []);

  return (
    <DocsPageShell
      routeLabel="help"
      badgeLabel="Help · using Stash Live"
      heroTitle="Get the most out of Stash Live."
      heroDescription={
        <>
          How setup works, how cards fire, and how to fix the handful of things that can go wrong
          mid-meeting. Building or self-hosting instead?{" "}
          <Link to="/docs" className="underline hover:opacity-70">
            See the developer docs
          </Link>
          .
        </>
      }
      quickJumpIds={["getting-started", "rehearsal", "sensitivity", "troubleshooting"]}
      sections={SECTIONS}
    >
      <DocSectionBlock index={1} id="overview" eyebrow="Overview" title="What Stash Live does" reducedMotion={false}>
        <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Stash Live listens for phrases you choose — things you actually say in meetings —
          and shows a small glass card with the matching data beside your shoulder in your outbound
          video. You keep looking at the camera; the numbers show up when you talk about them.
        </p>
      </DocSectionBlock>

      <DocSectionBlock index={2} id="getting-started" eyebrow="Setup" title="Getting started" reducedMotion={false}>
        <p className="text-sm mb-4" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Setup is about a minute, and nothing you do here appears live in a real meeting until you
          choose to join one.
        </p>
        <Card>
          <ol className="space-y-2 text-sm list-decimal list-inside" style={{ color: "#5A5550", lineHeight: 1.8 }}>
            <li>Sign in with Google.</li>
            <li>Seed three sample cards (step 1 of 5).</li>
            <li>Install the Chrome extension — Web Store or load-unpacked (step 2 of 5).</li>
            <li>Configure an AI API key or connect Notion (step 3 of 5).</li>
            <li>Hold Alt+Shift+Space and say a sentence to rehearse (step 4 of 5).</li>
            <li>Join a real Google Meet — keep your normal webcam selected (step 5 of 5).</li>
          </ol>
        </Card>
      </DocSectionBlock>

      <DocSectionBlock index={3} id="rehearsal" eyebrow="Rehearsal" title="Why rehearse first" reducedMotion={false}>
        <p className="text-sm mb-3" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Rehearsal runs the exact same extension, matching, and rendering pipeline a real meeting
          uses — just on this page instead of meet.google.com. If a card fires correctly here, it
          will fire the same way in a client call.
        </p>
        <Callout>
          Nobody wants a tool drawing on their face in a client pitch they haven't watched work
          first. Rehearsal is how you build that trust and calibrate sensitivity before it matters.
        </Callout>
      </DocSectionBlock>

      <DocSectionBlock index={4} id="cards" eyebrow="Cards" title="Your cards" reducedMotion={false}>
        <p className="text-sm mb-3" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Every card has a title, some data, and a list of trigger phrases. You can edit any card
          from the dashboard's Cards library — rename it, change its phrases, enable or disable
          it, or delete it. Cards imported from Notion arrive as <em>drafts</em> first; nothing goes
          live until you approve it in Review drafts.
        </p>
        <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Use <strong style={{ color: "#1A1512" }}>Test this phrase</strong> in the card editor to
          check whether a phrase would actually fire before you rely on it live.
        </p>
      </DocSectionBlock>

      <DocSectionBlock index={5} id="sensitivity" eyebrow="Settings" title="Sensitivity" reducedMotion={false}>
        <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Sensitivity is a simple three-way choice in Settings —{" "}
          <Code>Only when I'm certain</Code>, <Code>Balanced</Code>, or <Code>Eager</Code> — no
          raw numbers to tune. "Certain" means fewer, more confident cards; "Eager" means more cards,
          including some near-misses. Most people start on Balanced and adjust after a rehearsal or
          two.
        </p>
      </DocSectionBlock>

      <DocSectionBlock index={6} id="privacy" eyebrow="Privacy" title="What we keep, and what we don't" reducedMotion={false}>
        <p className="text-sm mb-3" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          By default, Stash Live does not store what you say. Turning on{" "}
          <strong style={{ color: "#1A1512" }}>Save activity snippets</strong> in Settings (off by
          default) keeps near-miss transcript text for 24 hours so you can tune your phrases from the
          Activity page — you can turn it off again at any time.
        </p>
        <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.8 }}>
          Google handles sign-in and, in a meeting, your camera/microphone permission. If you connect
          Notion, only the pages and databases you explicitly select are shared. Settings lists every
          data processor by name.
        </p>
      </DocSectionBlock>

      <DocSectionBlock index={7} id="troubleshooting" eyebrow="Troubleshooting" title="If something's not working" reducedMotion={false}>
        <div className="space-y-4">
          {[
            ["Camera says \"could not access\"", "Close other apps or browser tabs using your camera (another meeting app is a common culprit), then retry the permission prompt."],
            ["A card isn't firing", "Try Test this phrase in the card editor — it tells you exactly why (too quiet a match, or too similar to another card). Raising sensitivity to Eager also helps."],
            ["The extension shows \"not detected\"", "Make sure it's installed and enabled in chrome://extensions, then refresh this page."],
            ["I don't see the same thing in a real meeting as in rehearsal", "Rehearsal runs the identical pipeline, so this is unusual — check that your device is still listed (not revoked) under Settings → Devices."],
            ["Extension not detected on install screen", "If the page says the origin doesn't match, you're on a different domain than the extension was built for. Use the hosted app, or rebuild the extension with the right PRODUCT_ORIGIN."],
            ["AI key was rejected", "Check that the key format matches the provider you selected. Gemini keys start with AIza, OpenAI keys with sk-, Anthropic keys with sk-ant-. The server validates the key with a live API call."],
            ["Camera busy error", "Another app — often a Meet tab already in a call — is using the camera. Close it and retry."],
            ["No card appears in Meet", "The extension patches getUserMedia at document start. If Meet was open before the extension loaded, refresh the Meet tab or re-select your camera in Meet Settings → Video."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-2xl p-5">
              <p className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "#1A1512" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fb8500" }} />
                {q}
              </p>
              <p className="text-sm pl-3.5" style={{ color: "#5A5550", lineHeight: 1.7 }}>{a}</p>
            </div>
          ))}
        </div>
      </DocSectionBlock>
    </DocsPageShell>
  );
}
