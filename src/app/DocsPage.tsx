import { useEffect } from "react";
import {
  Code,
  CodeBlock,
  Prose,
  Card,
  Callout,
  DocSectionBlock,
  DocsPageShell,
  type DocSection,
} from "./docs/shared";

/**
 * Stash Live — Developer / self-host documentation (/docs).
 *
 * Rewritten for the v2 architecture (plan §4.4): the old content described
 * a single local `engine/` process on `localhost:5000` with a Puppeteer
 * compositor and manually-loaded extension. That process no longer exists.
 * This describes the real system: Supabase auth, a nonce-based device
 * pairing handshake, a hosted engine (Express + WS + Postgres via Prisma),
 * and a Manifest V3 Chrome extension that runs its own in-page canvas
 * compositor — not a server-side one.
 */

const SECTIONS: DocSection[] = [
  { id: "overview", label: "overview" },
  { id: "architecture", label: "architecture" },
  { id: "setup", label: "setup" },
  { id: "configuration", label: "configuration" },
  { id: "protocol", label: "websocket protocol" },
  { id: "extension", label: "extension" },
  { id: "frontend", label: "frontend" },
  { id: "testing", label: "testing" },
  { id: "troubleshooting", label: "troubleshooting" },
];

export default function DocsPage() {
  useEffect(() => {
    document.title = "Docs — Stash Live";
  }, []);

  return (
    <DocsPageShell
      routeLabel="docs"
      badgeLabel="Developer docs · self-host & contribute"
      heroTitle="Build with Stash Live."
      heroDescription={
        <>
          How the system actually works end-to-end: Supabase auth, device pairing, the card
          contract, the WebSocket protocol, and how to run the engine and extension locally.
          For "how do I use the product," see the{" "}
          <a href="/help" className="underline hover:opacity-70">
            Help
          </a>{" "}
          page instead.
        </>
      }
      quickJumpIds={["setup", "protocol", "extension", "troubleshooting"]}
      sections={SECTIONS}
    >
      {/* Overview */}
      <DocSectionBlock index={1} id="overview" eyebrow="Overview" title="What Stash Live is" reducedMotion={false}>
        <Prose>
          <p>
            Stash Live composites glassmorphic data cards into a presenter's outbound webcam video
            during a Google Meet call, triggered by what they say. Speech is transcribed in the
            browser, matched against the user's cards, and the matching card is rendered onto a
            transparent canvas that the extension weaves into the outbound video track — no
            server-side video compositing, no virtual camera driver.
          </p>
          <p>The repository holds four parts:</p>
        </Prose>
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {[
            { t: "engine/", d: "Express + WebSocket backend: Supabase-verified auth, device pairing, card CRUD, Notion OAuth + sync, and the trigger pipeline (Tier 1 phrase match → Tier 2 embedding fallback)." },
            { t: "extension/", d: "A Manifest V3 Chrome extension. Its content script runs on meet.google.com AND on the product origin (for rehearsal), holds the authenticated WebSocket, and paints matched cards onto a canvas layered over the real camera track." },
            { t: "packages/", d: "The shared contract: card-spec (zod-validated CardSpec + WS protocol types), card-core (layout math, tokens, fixtures), card-react (the DOM renderer used here and in the dashboard), card-canvas (the extension's canvas renderer)." },
            { t: "src/ (this site)", d: "The marketing site, onboarding funnel, and dashboard — this Vite + React app." },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl p-5 motion-safe:transition-transform motion-safe:hover:-translate-y-1">
              <p className="mb-2 font-semibold text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#1A1512" }}>
                {c.t}
              </p>
              <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
                {c.d}
              </p>
            </div>
          ))}
        </div>
        <Callout>
          <strong style={{ color: "#1A1512" }}>Local dev needs no cloud credentials.</strong> Set{" "}
          <Code>STASH_LOCAL=1</Code> (engine) and <Code>VITE_STASH_MOCK=1</Code> (frontend) and every
          external dependency — Supabase auth, the datastore, Notion, the embedding provider —
          runs against an in-memory mock with a seeded local dev user.
        </Callout>
      </DocSectionBlock>

      {/* Architecture */}
      <DocSectionBlock index={2} id="architecture" eyebrow="Architecture" title="How a card gets on screen" reducedMotion={false}>
        <Prose>
          <p>
            Once paired, the extension holds one authenticated WebSocket per active meeting tab.
            Speech is transcribed locally (Web Speech API in the content script), debounced, and
            sent as transcript deltas over the socket.
          </p>
        </Prose>
        <Card>
          <ol className="space-y-3 text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
            {[
              ["Transcript in", "Content script sends { t: 'transcript', text, final, ts } over the authenticated WS."],
              ["Tier 1 match", "Token-boundary-aware phrase matching against the user's enabled cards — not naive substring or exact-equality."],
              ["Tier 2 fallback", "If no Tier 1 hit, a cosine-similarity search over card embeddings covers paraphrases."],
              ["Sensitivity gate", "The user's 3-stop sensitivity (certain / balanced / eager) maps to a { tFire, tDrop } pair; scores below tFire are suppressed."],
              ["Cooldown", "Each card has its own cooldown so it can't refire on every mention of the same phrase."],
              ["Server pushes { t: 'show', card, matchedPhrase, score }", "The extension looks up the CardSpec and renders it with card-canvas."],
              ["Composite", "The rendered card is drawn onto a canvas layered over the real camera frame; canvas.captureStream() replaces the outbound video track."],
            ].map(([k, v], i) => (
              <li key={k} className="flex gap-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: "rgba(251,133,0,0.12)", color: "#fb8500" }}
                >
                  {i + 1}
                </span>
                <span>
                  <strong style={{ color: "#1A1512" }}>{k}.</strong> {v}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Callout>
          <strong style={{ color: "#1A1512" }}>Renderer parity matters.</strong> The dashboard's live
          previews (<Code>@stash/card-react</Code>'s <Code>GlassCard</Code>) and the extension's
          in-meeting renderer (<Code>@stash/card-canvas</Code>) both consume the exact same{" "}
          <Code>CardSpec</Code> and the same layout math from <Code>@stash/card-core</Code>, so what
          you see in the editor is what appears on your video.
        </Callout>
      </DocSectionBlock>

      {/* Setup */}
      <DocSectionBlock index={3} id="setup" eyebrow="Setup" title="Install & run" reducedMotion={false}>
        <Prose>
          <p>You need Node.js 20+. Clone the repo, then from the root:</p>
        </Prose>
        <CodeBlock>{`git clone https://github.com/devcool20/meet-visualizer
cd meet-visualizer
npm install
cp .env.example .env      # optional — defaults to mock mode with no backend
npm run dev                # Vite dev server for the marketing site + dashboard`}</CodeBlock>
        <Prose>
          <p>To run the backend engine locally, from <Code>engine/</Code>:</p>
        </Prose>
        <CodeBlock>{`cd engine
npm install
cp .env.example .env       # set STASH_LOCAL=1 for zero-credential local dev
npm run dev                 # tsx watch, serves the REST + WS API`}</CodeBlock>
        <Prose>
          <p>To load the Chrome extension unpacked, from <Code>extension/</Code>:</p>
        </Prose>
        <CodeBlock lang="steps">{`1. npm install && npm run build
2. Open chrome://extensions
3. Enable "Developer mode"
4. "Load unpacked" → select extension/dist/ (or extension/, if unbuilt)`}</CodeBlock>
      </DocSectionBlock>

      {/* Configuration */}
      <DocSectionBlock index={4} id="configuration" eyebrow="Configuration" title="Environment & tuning" reducedMotion={false}>
        <Prose>
          <p>
            The engine reads configuration from <Code>engine/.env</Code>. With{" "}
            <Code>STASH_LOCAL=1</Code>, every external dependency below falls back to an in-memory
            mock automatically.
          </p>
        </Prose>
        <div className="overflow-x-auto my-5 rounded-2xl">
          <table className="w-full text-sm" style={{ color: "#5A5550" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(26,21,18,0.08)" }}>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Variable</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Default / Fallback</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Purpose</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {[
                ["STASH_LOCAL", "unset", "Set to 1 to force mock Supabase auth, mock Notion, mock embeddings, and an in-memory store."],
                ["SUPABASE_URL / SUPABASE_ANON_KEY", "mock auth provider", "Real Supabase project for Google OAuth."],
                ["DATABASE_URL", "in-memory store", "Postgres connection string for Prisma."],
                ["NOTION_CLIENT_ID / NOTION_CLIENT_SECRET", "mock connector", "Notion OAuth app credentials."],
                ["STASH_PRODUCT_ORIGIN", "https://meet-visualizer.vercel.app", "The origin the extension pairs against and the value in externally_connectable."],
              ].map(([k, d, p]) => (
                <tr key={k} style={{ borderBottom: "1px solid rgba(26,21,18,0.04)" }}>
                  <td className="px-5 py-3" style={{ color: "#1A1512" }}>{k}</td>
                  <td className="px-5 py-3">{d}</td>
                  <td className="px-5 py-3" style={{ fontFamily: "'Inter', sans-serif" }}>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>
          <p>
            Sensitivity is never a raw number in configuration or UI — the three stops (
            <Code>certain</Code> / <Code>balanced</Code> / <Code>eager</Code>) map to{" "}
            <Code>{"{ tFire, tDrop }"}</Code> pairs in <Code>engine/src/config.ts</Code>'s{" "}
            <Code>SENSITIVITY_THRESHOLDS</Code>, which are explicitly unset/hypothesis values pending
            calibration — not tuned production thresholds.
          </p>
        </Prose>
      </DocSectionBlock>

      {/* Protocol */}
      <DocSectionBlock index={5} id="protocol" eyebrow="Reference" title="WebSocket protocol v2" reducedMotion={false}>
        <Prose>
          <p>
            The extension connects with the device token obtained from pairing (
            <Code>?token=&lt;deviceToken&gt;</Code>), not a cookie. Client → server messages:
          </p>
        </Prose>
        <CodeBlock lang="ts">{`type ClientMsg =
  | { t: 'hello'; token: string; client: string; version: string }
  | { t: 'transcript'; text: string; final: boolean; ts: number }
  | { t: 'dismiss'; cardId?: string }
  | { t: 'ping' };`}</CodeBlock>
        <Prose>
          <p>Server → client:</p>
        </Prose>
        <CodeBlock lang="ts">{`type ServerMsg =
  | { t: 'ready'; userId: string; cardCount: number }
  | { t: 'config'; settings: UserSettings; token?: string }
  | { t: 'prewarm'; card: CardSpec }
  | { t: 'show'; card: CardSpec; matchedPhrase: string; score: number }
  | { t: 'hide'; cardId: string }
  | { t: 'invalidate'; cardIds: string[] }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'pong' };`}</CodeBlock>
        <Prose>
          <p>
            Every message is validated with zod (<Code>@stash/card-spec</Code>'s{" "}
            <Code>parseClientMsg</Code> / <Code>parseServerMsg</Code>) — malformed frames are
            rejected, not trusted.
          </p>
        </Prose>
      </DocSectionBlock>

      {/* Extension */}
      <DocSectionBlock index={6} id="extension" eyebrow="Chrome extension" title="Pairing & rendering" reducedMotion={false}>
        <Prose>
          <p>
            Pairing is a silent, one-time handshake (plan §2.2): the dashboard requests a 60-second
            single-use nonce from <Code>POST /api/extension/pairing-nonce</Code>, then calls{" "}
            <Code>chrome.runtime.sendMessage(EXTENSION_ID, {"{ type: 'pair', nonce }"})</Code> via{" "}
            <Code>externally_connectable</Code>. The extension's service worker exchanges the nonce
            for a long-lived device token at <Code>POST /api/extension/pair</Code> (unauthenticated
            — the nonce itself is the credential) and stores it in{" "}
            <Code>chrome.storage.local</Code>. No cookie is ever involved, because Supabase's browser
            session lives in the dashboard's <Code>localStorage</Code>, which the extension cannot
            read.
          </p>
          <p>
            The extension's content script runs on both <Code>meet.google.com</Code> and the product
            origin (for rehearsal, see the Help page), holds the WS connection, and renders matched
            cards with <Code>@stash/card-canvas</Code> onto a transparent canvas layered over the
            real webcam frame before calling <Code>canvas.captureStream()</Code>.
          </p>
        </Prose>
        <Callout>
          <strong style={{ color: "#1A1512" }}>Canvas taint safety.</strong> Any image drawn onto the
          compositing canvas is probed for cross-origin tainting before use; a tainted image is never
          drawn to the real output canvas, because a tainted <Code>captureStream()</Code> throws{" "}
          <Code>SecurityError</Code> and would break the user's camera for the rest of the call.
        </Callout>
      </DocSectionBlock>

      {/* Frontend */}
      <DocSectionBlock index={7} id="frontend" eyebrow="This site" title="The frontend" reducedMotion={false}>
        <Prose>
          <p>
            React 18 + Vite + TypeScript, Tailwind v4, react-router v7, with the existing shadcn/ui
            set in <Code>src/app/components/ui/</Code>. <Code>src/app/App.tsx</Code> is the landing
            page; onboarding lives in <Code>src/app/onboarding/</Code> and <Code>src/app/auth/</Code>;
            the dashboard lives in <Code>src/app/dashboard/</Code>, lazy-loaded behind a{" "}
            <Code>ProtectedRoute</Code>. <Code>src/lib/api.ts</Code>, <Code>auth.ts</Code>, and{" "}
            <Code>extension.ts</Code> hold the typed REST client, the Supabase wrapper, and the
            extension pairing/presence logic respectively — all with a mock mode
            (<Code>VITE_STASH_MOCK=1</Code>) that needs no backend at all.
          </p>
        </Prose>
      </DocSectionBlock>

      {/* Testing */}
      <DocSectionBlock index={8} id="testing" eyebrow="Testing" title="Running the test suite" reducedMotion={false}>
        <Prose>
          <p>From the repository root, Vitest covers the frontend and shared packages:</p>
        </Prose>
        <CodeBlock>{`npm test`}</CodeBlock>
        <Card>
          <ul className="space-y-2 text-sm list-disc list-inside" style={{ color: "#5A5550", lineHeight: 1.7 }}>
            <li>Routing / protected-route logic.</li>
            <li>The pairing client state machine, including extension-absent and nonce-expired.</li>
            <li>Sensitivity slider ↔ enum mapping.</li>
            <li>The onboarding step machine.</li>
            <li>Card library / editor components against the shared fixtures.</li>
          </ul>
        </Card>
        <Prose>
          <p>
            <Code>engine/</Code> has its own Vitest suite (<Code>cd engine && npm test</Code>),
            including a cross-tenant isolation test asserting every store method is scoped by{" "}
            <Code>userId</Code>.
          </p>
        </Prose>
      </DocSectionBlock>

      {/* Troubleshooting */}
      <DocSectionBlock index={9} id="troubleshooting" eyebrow="Troubleshooting" title="Common issues" reducedMotion={false}>
        <div className="space-y-4">
          {[
            ["Extension shows \"not detected\"", "Confirm it's installed and enabled, and that EXTENSION_ID in src/lib/extension.ts still matches extension/src/shared/constants.ts's DEV_EXTENSION_ID — they're kept in sync by hand, not by import, since the two are separate build targets."],
            ["Pairing fails with an expired-nonce error", "Nonces are single-use and expire after 60 seconds. Request a fresh one — this is expected if pairing was interrupted (e.g. by the Chrome Web Store install flow taking longer than a minute)."],
            ["Everything is running in mock mode unexpectedly", "Check VITE_STASH_MOCK and VITE_SUPABASE_URL in your .env — mock mode is the default whenever VITE_SUPABASE_URL is unset."],
            ["NotReadableError requesting camera/mic", "Another app or tab is holding the device. Close it and retry — this is surfaced explicitly in the rehearsal flow."],
            ["Cards not firing in a real meeting but firing in rehearsal", "Rehearsal runs the identical extension pipeline against the product origin, so a real discrepancy usually means the device token expired or was revoked — check Settings → Devices."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-2xl p-5 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5">
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
