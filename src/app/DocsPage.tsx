/**
 * `/docs` — developer and self-host documentation.
 *
 * This file used to be a ~500-line private copy of `docs/shared.tsx`: its own
 * glass header, hero, scroll-spy sidebar, `Reveal`, `DocSectionBlock`, and
 * motion toggle. It now composes the same `DocsPageShell` that `/help` uses, so
 * a token change only has to be made once.
 *
 * Two bugs fell out of that duplication and are fixed here: three sections
 * (`deploy-engine`, `publish-extension`, `configuration-table`) were rendered
 * with no sidebar entry, so they could never be highlighted or reached from the
 * mobile menu; and the motion toggle only affected this one page.
 */
import { Link } from "react-router";
import {
  Callout,
  Card,
  Code,
  CodeBlock,
  DocSectionBlock,
  DocsPageShell,
  GLASS,
  MONO,
  Prose,
  Reveal,
  SERIF,
  type DocSection,
} from "./docs/shared";
import { useReducedMotion } from "@/app/motion";

/**
 * Must list every `DocSectionBlock` id below. `DocsPageShell` builds the
 * sidebar and the scroll-spy from this array, so an id missing here becomes a
 * section that is unreachable from the navigation.
 */
const SECTIONS: DocSection[] = [
  { id: "overview", label: "overview" },
  { id: "architecture", label: "architecture" },
  { id: "deploy-engine", label: "deploy the engine" },
  { id: "setup", label: "setup" },
  { id: "publish-extension", label: "publish the extension" },
  { id: "configuration", label: "configuration" },
  { id: "configuration-table", label: "environment variables" },
  { id: "usage", label: "usage" },
  { id: "protocol", label: "websocket protocol" },
  { id: "extension", label: "extension" },
  { id: "frontend", label: "frontend" },
  { id: "testing", label: "testing" },
  { id: "troubleshooting", label: "troubleshooting" },
];

export default function DocsPage() {
  const reducedMotion = useReducedMotion();

  return (
    <DocsPageShell
      routeLabel="docs"
      badgeLabel="Docs · runs offline by default"
      heroTitle="Build with Stash Live."
      heroDescription={
        <>
          Everything you need to run the ambient presenter engine locally — from a first{" "}
          <Code>npm run dev</Code> to the WebSocket protocol, the Chrome extension, and adding your
          own overlay cards. These docs describe the system as it actually behaves, including its
          local fallbacks when no cloud keys are configured.
        </>
      }
      quickJumpIds={["setup", "usage", "protocol", "troubleshooting"]}
      sections={SECTIONS}
    >
          {/* Overview */}
          <DocSectionBlock index={1} id="overview" eyebrow="Overview" title="What Stash Live is" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                Stash Live is a real-time, speech-triggered overlay engine for video calls. As you
                speak, it identifies intent, looks up the matching data card, renders it on a
                transparent canvas, and streams the frames into your outbound Google Meet webcam feed —
                so context appears beside your shoulder while you keep eye contact.
              </p>
              <p>The repository holds three parts:</p>
            </Prose>
            <div className="grid sm:grid-cols-3 gap-4 mt-6">
              {[
                { t: "engine/", d: "The backend orchestrator — Express + WebSocket server, Gemini intent parsing, Notion-backed cache, and a headless Puppeteer compositor that streams PNG overlay frames." },
                { t: "engine/extension/", d: "A Manifest V3 Chrome extension that composites the engine's overlay frames onto the Meet webcam stream." },
                { t: "src/ (this site)", d: "The marketing/landing showcase (React + Vite). It is standalone and does not talk to the engine." },
              ].map((c) => (
                <div key={c.t} className="rounded-2xl p-5 motion-safe:transition-transform motion-safe:hover:-translate-y-1" style={GLASS}>
                  <p className="mb-2 font-semibold text-sm" style={{ fontFamily: MONO, color: "#1A1512" }}>
                    {c.t}
                  </p>
                  <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
                    {c.d}
                  </p>
                </div>
              ))}
            </div>
            <Callout>
              <strong style={{ color: "#1A1512" }}>Runs offline by default.</strong> Every external
              dependency has a local fallback: with no <Code>GEMINI_API_KEY</Code> the engine uses a
              local keyword simulator; with no <Code>NOTION_API_KEY</Code> it loads three built-in mock
              rows; with no <Code>REDIS_URL</Code> it uses an in-memory cache. You can run the full demo
              with zero credentials.
            </Callout>
          </DocSectionBlock>

          {/* Architecture */}
          <DocSectionBlock index={2} id="architecture" eyebrow="Architecture" title="How a card gets on screen" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                A single trigger flows through the engine as a pipeline. Speech text arrives over the
                WebSocket, Gemini (or the local simulator) decides whether an overlay should fire and
                which data anchor it maps to, a confidence gate filters weak matches, the cache resolves
                the anchor's payload, and the compositor renders and streams frames.
              </p>
            </Prose>
            <Card>
              <ol className="space-y-3 text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
                {[
                  ["Speech in", "Dashboard or a WS client sends { type: 'speech', text }."],
                  ["Intent parse", "GeminiService keeps a rolling transcript, pre-warms on keywords, and returns a structured intent (type + anchor + confidence)."],
                  ["Confidence gate", "Anchors scoring below 0.88, or anchors missing from the cache, are suppressed."],
                  ["Cache lookup", "The anchor key resolves to its payload (Redis or in-memory), seeded from Notion on boot."],
                  ["Compose", "The Puppeteer compositor renders a transparent 1280×720 card and screenshots it on a frame loop."],
                  ["Stream", "PNG frame buffers + { type: 'log' } messages are broadcast to every WS client."],
                  ["Composite", "The extension paints those frames onto the Meet webcam canvas."],
                ].map(([k, v], i) => (
                  <li key={k} className="flex gap-3">
                    <span
                     className="flex size-6 shrink-0 items-center justify-center rounded-full"
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
              <strong style={{ color: "#1A1512" }}>Note:</strong> the <Code>gmeet.ts</Code> proxy
              service exists in the codebase but is experimental and not wired into the server — it does
              not consume the streamed frames. The extension is the supported path into Meet.
            </Callout>
          </DocSectionBlock>

          {/* Setup */}
          <DocSectionBlock index={3} id="setup" eyebrow="Setup" title="Install & run" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                You need Node.js 20+ and Chrome. The engine bundles Chromium via Puppeteer; on Linux you
                may need the usual shared libraries (see Troubleshooting).
              </p>
              <p>Clone the repo, then start the engine:</p>
            </Prose>
            <CodeBlock>{`git clone https://github.com/devcool20/meet-visualizer
cd meet-visualizer/engine
npm install
cp .env.example .env   # optional — runs in simulation mode without it
npm run dev            # tsx watch, serves the dashboard on :5000`}</CodeBlock>
            <Prose>
              <p>Engine scripts:</p>
            </Prose>
            <Card>
              <ul className="space-y-2 text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
                <li><Code>npm run dev</Code> — watch mode via <Code>tsx</Code>.</li>
                <li><Code>npm run build</Code> — compile TypeScript to <Code>dist/</Code>.</li>
                <li><Code>npm start</Code> — run the compiled server (<Code>node dist/index.js</Code>).</li>
                <li><Code>npm test</Code> — run the pipeline test harness.</li>
              </ul>
            </Card>
            <Prose>
              <p>To run this landing site locally, from the repository root:</p>
            </Prose>
            <CodeBlock>{`cd meet-visualizer
npm install
npm run dev   # Vite dev server`}</CodeBlock>
          </DocSectionBlock>

          {/* Configuration */}
          <DocSectionBlock index={4} id="configuration" eyebrow="Configuration" title="Environment & tuning" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                The engine reads configuration from <Code>engine/.env</Code>. Every variable is
                optional — leave it unset to use the local fallback.
              </p>
            </Prose>
            <div className="overflow-x-auto my-5 rounded-2xl" style={GLASS}>
              <table className="w-full text-sm" style={{ color: "#5A5550" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(26,21,18,0.08)" }}>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Variable</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Default / Fallback</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: "#1A1512" }}>Purpose</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: MONO }}>
                  {[
                    ["PORT", "5000", "HTTP + WebSocket port."],
                    ["GEMINI_API_KEY", "local simulator", "Enables gemini-1.5-flash intent parsing."],
                    ["NOTION_API_KEY", "3 mock rows", "Enables live Notion database sync."],
                    ["NOTION_DATABASE_ID", "—", "The Notion database to pull cards from."],
                    ["REDIS_URL", "in-memory cache", "Backing store for the anchor cache."],
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
                Other tunables live in code: the confidence gate is <Code>0.88</Code>
                {" "}(<Code>config.confidenceThreshold</Code>), the compositor renders a 1280×720 transparent
                canvas at 30fps during ~800ms transitions and 1fps when idle, and the built-in anchors
                are <Code>q2_financials</Code> (graph), <Code>sys_architecture_v2</Code> (image), and{" "}
                <Code>security_compliance</Code> (text_card).
              </p>
            </Prose>
          </DocSectionBlock>

          {/* Usage */}
          <DocSectionBlock index={5} id="usage" eyebrow="Usage" title="Driving the engine" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                <strong style={{ color: "#1A1512" }}>Dashboard.</strong> With the engine running, open{" "}
                <Code>http://localhost:5000</Code>. The Ambient Control Console has sample trigger
                buttons, a live-mic input (Web Speech API), a dismiss button, a static hot-cache
                explorer, a mock presenter canvas, and a live pipeline log stream. Click a trigger and
                watch the card render.
              </p>
              <p>
                <strong style={{ color: "#1A1512" }}>Real Meet, via the extension.</strong> Load the
                unpacked extension, join a Meet, and keep your <em>normal</em> webcam selected — there
                is no separate virtual-camera device. Then drive triggers from a separate source (the
                dashboard buttons, the dashboard mic, or a manual WS client). The extension composites
                the resulting frames onto your outbound video.
              </p>
            </Prose>
            <Callout>
              Speaking <em>inside Meet</em> does not itself trigger overlays. The extension is a frame
              consumer; the transcript that fires cards comes from whatever WS client you use to send{" "}
              <Code>{"{ type: 'speech', text }"}</Code>.
            </Callout>
          </DocSectionBlock>

          {/* Protocol */}
          <DocSectionBlock index={6} id="protocol" eyebrow="Reference" title="WebSocket protocol" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                The dashboard connects to <Code>ws://{"{window.location.host}"}</Code> (so it follows{" "}
                <Code>PORT</Code>); the extension hardcodes <Code>ws://localhost:5000</Code>. If you
                change <Code>PORT</Code>, update <Code>engine/extension/inject.js</Code> too.
              </p>
              <p>Client → server messages are JSON:</p>
            </Prose>
            <CodeBlock lang="json">{`{ "type": "speech", "text": "our q2 revenue was strong" }
{ "type": "dismiss" }`}</CodeBlock>
            <Prose>
              <p>Server → client is a mix of JSON log lines and raw binary PNG frames:</p>
            </Prose>
            <CodeBlock lang="json">{`{ "type": "log", "source": "gemini", "text": "intent: graph @ 0.94" }
<binary PNG frame buffer>   // one per compositor tick`}</CodeBlock>
            <Prose>
              <p>
                A client distinguishes the two by message type: string/JSON payloads are log events;
                binary payloads are overlay frames to paint.
              </p>
            </Prose>
          </DocSectionBlock>

          {/* Extension */}
          <DocSectionBlock index={7} id="extension" eyebrow="Chrome extension" title="Stash Live GMeet Interceptor" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                The Manifest V3 extension injects <Code>inject.js</Code> into <Code>meet.google.com</Code>
                . That script monkeypatches <Code>navigator.mediaDevices.getUserMedia</Code>, composites
                the engine's streamed PNG frames onto a canvas, and exposes{" "}
                <Code>canvas.captureStream(30)</Code> as the webcam.
              </p>
              <p>Load it unpacked:</p>
            </Prose>
            <CodeBlock lang="steps">{`1. Open chrome://extensions
2. Enable "Developer mode"
3. "Load unpacked" → select engine/extension/
4. Ensure the engine is running on port 5000`}</CodeBlock>
            <Callout>
              The extension is a compositor, not a speech client and not a virtual-camera driver. It
              does not create a selectable camera device and does not capture Meet audio. Overlays only
              appear when a separate trigger source is driving the engine.
            </Callout>
          </DocSectionBlock>

          {/* Frontend */}
          <DocSectionBlock index={8} id="frontend" eyebrow="This site" title="The landing frontend" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                The page you're reading lives in <Code>src/</Code>: React 18 + Vite 6 + TypeScript,
                Tailwind v4, and Framer Motion, with a shadcn/ui component set. It's a standalone
                showcase — the interactive hero demo is entirely client-side (a local keyword map) and
                does not connect to the engine.
              </p>
              <p>
                The entry chain is <Code>index.html</Code> → <Code>src/main.tsx</Code> →{" "}
                <Code>src/app/App.tsx</Code> for the landing route, with this page at{" "}
                <Code>src/app/DocsPage.tsx</Code> mounted at <Code>/docs</Code>. Design tokens live in{" "}
                <Code>src/styles/</Code> and <Code>design.md</Code>.
              </p>
            </Prose>
          </DocSectionBlock>

          {/* Testing */}
          <DocSectionBlock index={9} id="testing" eyebrow="Testing" title="The pipeline harness" reducedMotion={reducedMotion}>
            <Prose>
              <p>
                From <Code>engine/</Code>, run <Code>npm test</Code>. It runs a manual harness (not a
                framework) that exercises four checks:
              </p>
            </Prose>
            <Card>
              <ol className="space-y-2 text-sm list-decimal list-inside" style={{ color: "#5A5550", lineHeight: 1.7 }}>
                <li>Cache set/get round-trips.</li>
                <li>Notion sync populates the expected anchor keys.</li>
                <li>Gemini intent parsing + pre-warm fires on a matching transcript.</li>
                <li>Low-confidence intents are suppressed by the gate.</li>
              </ol>
            </Card>
            <Prose>
              <p>It runs in simulation mode without any API keys, so it works out of the box.</p>
            </Prose>
          </DocSectionBlock>

          {/* Troubleshooting */}
          <DocSectionBlock index={10} id="troubleshooting" eyebrow="Troubleshooting" title="Common issues" reducedMotion={reducedMotion}>
            <div className="space-y-4">
              {[
                ["Puppeteer fails to launch on Linux", "Install the Chromium shared libraries, and pass --no-sandbox if running as root. This affects both the compositor and the gmeet proxy."],
                ["Everything is \"mock\" / \"simulated\"", "Expected with no API keys. Check the boot logs to see which mode is active — set GEMINI_API_KEY and NOTION_API_KEY to go live."],
                ["Redis errors on boot", "A set REDIS_URL is used directly with no automatic fallback. If it's unreachable you'll see connection errors — unset REDIS_URL to force the in-memory cache."],
                ["Extension won't connect", "It hardcodes ws://localhost:5000. Confirm the engine is running on port 5000; if you changed PORT, edit engine/extension/inject.js."],
                ["No overlay in Meet", "Confirm the engine is running, the extension is loaded, and a trigger source is actively driving the engine — the extension itself does not trigger cards."],
              ].map(([q, a]) => (
                <div key={q} className="rounded-2xl p-5 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5" style={GLASS}>
                  <p className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "#1A1512" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fb8500" }} />
                    {q}
                  </p>
                  <p className="text-sm pl-3.5" style={{ color: "#5A5550", lineHeight: 1.7 }}>{a}</p>
                </div>
              ))}
            </div>
          </DocSectionBlock>

          <DocSectionBlock index={11} id="deploy-engine" eyebrow="Manual operator step" title="Deploying the engine" reducedMotion={reducedMotion}>
            <p className="text-sm" style={{ color: '#d4183d', marginBottom: '12px' }}>
              ⚠ Performed by a human, not by the build. The engine is a long-lived Express + ws
              server and cannot run on Vercel (WebSocket timeout limitation).
            </p>
            <ol className="space-y-2 text-sm" style={{ color: '#5A5550', lineHeight: 1.7, listStyle: 'decimal', paddingLeft: '1.2rem' }}>
              <li>Create a service from the repo, root directory <code>engine/</code>, Node 20.</li>
              <li>Build: <code>npm ci {'&&'} npm run build -w engine</code>; start: <code>node engine/dist/index.js</code>. Ensure the platform routes HTTP and WebSocket upgrade traffic to the same port.</li>
              <li>Set env vars: <code>DATABASE_URL</code>, <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>STASH_ENCRYPTION_KEY</code> (32 bytes, base64/hex), <code>STASH_PRODUCT_ORIGIN</code> (the Vercel dashboard origin), and optionally <code>GEMINI_API_KEY</code> / <code>OPENAI_API_KEY</code> / <code>ANTHROPIC_API_KEY</code>.</li>
              <li>Run Prisma migrations against <code>DATABASE_URL</code> (pgvector required).</li>
              <li>Confirm <code>GET /health</code> answers over the public URL and that CORS allows the dashboard origin.</li>
              <li>Set <code>VITE_STASH_API_URL</code> on Vercel to that engine origin and redeploy the dashboard.</li>
              <li>Set <code>ENGINE_ORIGIN</code> in <code>extension/src/shared/constants.ts</code> and add the engine origin to <code>host_permissions</code> in manifest.json, then rebuild the extension.</li>
            </ol>
          </DocSectionBlock>

          <DocSectionBlock index={12} id="publish-extension" eyebrow="Manual operator step" title="Publishing the Chrome extension" reducedMotion={reducedMotion}>
            <p className="text-sm" style={{ color: '#d4183d', marginBottom: '12px' }}>
              ⚠ Performed by a human, not by the build. Requires a Chrome Web Store developer
              account (one-time registration fee), and a review period measured in days.
            </p>
            <ol className="space-y-2 text-sm" style={{ color: '#5A5550', lineHeight: 1.7, listStyle: 'decimal', paddingLeft: '1.2rem' }}>
              <li>Register a Chrome Web Store developer account and pay the one-time fee.</li>
              <li>Build the extension against the final <code>PRODUCT_ORIGIN</code> and <code>ENGINE_ORIGIN</code>, zip the build output.</li>
              <li>Prepare listing assets: name, description, at least one 1280×800 screenshot, a 128×128 icon, a category, a privacy policy URL, and permission justifications for microphone and camera access.</li>
              <li>Upload the zip, complete the privacy and permissions questionnaire, submit for review.</li>
              <li>After publication, copy the new ID from the store listing URL, then set <code>VITE_STASH_EXTENSION_ID</code> to it on Vercel and redeploy. Set <code>VITE_STASH_EXT_SOURCE=webstore</code> so the store CTA becomes primary.</li>
              <li>Until step 5, leave <code>VITE_STASH_EXT_SOURCE=unpacked</code>. The install screen shows the load-unpacked path and pairing targets the dev ID.</li>
            </ol>
          </DocSectionBlock>

          <DocSectionBlock index={13} id="configuration-table" eyebrow="Reference" title="Configuration values" reducedMotion={reducedMotion}>
            <p className="text-sm mb-3" style={{ color: '#5A5550' }}>
              All client-side env vars with their defaults. The product origin and engine origin
              are now separate — see the deploy instructions above.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ color: '#5A5550' }}>
                <thead>
                  <tr className="border-b" style={{ borderColor: 'rgba(26,21,18,0.06)' }}>
                    <th className="text-left py-2 pr-4 font-medium" style={{ color: '#1A1512' }}>Var</th>
                    <th className="text-left py-2 pr-4 font-medium" style={{ color: '#1A1512' }}>Default</th>
                    <th className="text-left py-2 font-medium" style={{ color: '#1A1512' }}>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['VITE_STASH_MOCK', '1', 'Forces mock auth + in-memory API'],
                    ['VITE_SUPABASE_URL', 'unset', 'Real Supabase project URL; unset ⇒ mock'],
                    ['VITE_SUPABASE_ANON_KEY', 'unset', 'Supabase anonymous key'],
                    ['VITE_STASH_API_URL', 'localhost:5000 (dev)', 'Engine host origin (separate from dashboard)'],
                    ['VITE_STASH_PRODUCT_ORIGIN', 'https://meet-visualizer.vercel.app', 'Dashboard origin the extension is built for'],
                    ['VITE_STASH_EXTENSION_ID', 'fdeplcog… (dev ID)', 'Pairing target; set to store ID after publishing'],
                    ['VITE_STASH_EXT_SOURCE', 'unpacked', 'Distribution mode: unpacked | webstore'],
                    ['VITE_STASH_EXT_ZIP_URL', 'unset', 'Optional pre-built extension download URL'],
                  ].map(([k, d, p]) => (
                    <tr key={k} className="border-b" style={{ borderColor: 'rgba(26,21,18,0.04)' }}>
                      <td className="py-2 pr-4 font-mono text-xs" style={{ color: '#1A1512' }}>{k}</td>
                      <td className="py-2 pr-4 text-xs">{d}</td>
                      <td className="py-2 text-xs">{p}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocSectionBlock>

          <Reveal reducedMotion={reducedMotion}>
            <div
             className="rounded-3xl p-8 sm:p-10 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              style={GLASS}
            >
              <div>
                <p style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 300, color: "#1A1512", letterSpacing: "-0.01em" }}>
                  Ready to present with presence?
                </p>
                <p className="text-sm mt-1" style={{ color: "#5A5550" }}>
                  Head back and try the live demo on the landing page.
                </p>
              </div>
              <Link
                to="/"
               className="inline-flex items-center gap-2 self-start rounded-full px-6 py-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:self-auto"
                style={{ background: "#1A1512", color: "#FBF9F6" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Stash Live
              </Link>
            </div>
          </Reveal>
    </DocsPageShell>
  );
}
