import { useState, useRef, useEffect } from "react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import heroBg from "@/imports/HLKJ3SzbkAAfbgT.jpg";
import orangeTexture from "@/imports/orange.jpg";

const TRIGGER_MAP: Record<string, { label: string; value: string; color: string }[]> = {
  revenue: [
    { label: "Q3 Revenue", value: "$2.4M", color: "#10B981" },
    { label: "YoY Growth", value: "+34%", color: "#10B981" },
    { label: "Churn Rate", value: "1.8%", color: "#5A5550" },
  ],
  team: [
    { label: "Headcount", value: "142", color: "#10B981" },
    { label: "Open Roles", value: "12", color: "#5A5550" },
    { label: "NPS Score", value: "78", color: "#10B981" },
  ],
  product: [
    { label: "DAU", value: "48.2K", color: "#10B981" },
    { label: "Uptime", value: "99.97%", color: "#10B981" },
    { label: "Latency", value: "18ms", color: "#5A5550" },
  ],
  growth: [
    { label: "MRR", value: "$180K", color: "#10B981" },
    { label: "Conversion", value: "4.7%", color: "#10B981" },
    { label: "CAC", value: "$124", color: "#5A5550" },
  ],
};

function findCards(input: string) {
  const lower = input.toLowerCase();
  for (const key of Object.keys(TRIGGER_MAP)) {
    if (lower.includes(key)) return TRIGGER_MAP[key];
  }
  return null;
}

const CHART_DATA = [
  { month: "Jan", value: 42 },
  { month: "Feb", value: 58 },
  { month: "Mar", value: 51 },
  { month: "Apr", value: 74 },
  { month: "May", value: 68 },
  { month: "Jun", value: 91 },
];

const MAX_VAL = 100;

export default function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeCards, setActiveCards] = useState<typeof TRIGGER_MAP[string] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cards = findCards(inputVal);
    setActiveCards(cards);
  }, [inputVal]);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "#FBF9F6",
        fontFamily: "'Inter', sans-serif",
        color: "#1A1512",
      }}
    >
      {/* ─── HEADER ─── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
        style={{
          background: "rgba(251,249,246,0.82)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(26,21,18,0.06)",
        }}
      >
        <nav className="flex items-center gap-7">
          {["about", "features", "integrations"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-sm transition-opacity hover:opacity-60"
              style={{ color: "#5A5550", letterSpacing: "0.01em" }}
            >
              {item}
            </a>
          ))}
        </nav>

        <span
          className="absolute left-1/2 -translate-x-1/2 text-lg font-medium tracking-tight select-none"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.35rem" }}
        >
          Stash Live
        </span>

        <button
          className="px-5 py-2.5 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
          style={{ background: "#1A1512", color: "#FBF9F6", letterSpacing: "0.01em" }}
        >
          Download Client
        </button>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative w-full overflow-hidden" style={{ height: "100vh" }}>
        {/* Background */}
        <ImageWithFallback
          src={heroBg}
          alt="Person standing in a digital field beneath a binary-data sky"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Subtle vignette overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(251,249,246,0.55) 0%, rgba(251,249,246,0.0) 42%, rgba(251,249,246,0.0) 58%, rgba(251,249,246,0.42) 100%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: "120px", background: "linear-gradient(to top, #FBF9F6, transparent)" }}
        />

        {/* Content layer */}
        <div className="relative z-10 h-full flex items-center px-10 md:px-16 lg:px-24">
          {/* Left wing */}
          <div className="w-[36%] pr-8">
            <p
              className="mb-4 text-xs font-medium tracking-widest uppercase"
              style={{ color: "#10B981", fontFamily: "'Inter', sans-serif" }}
            >
              Real-Time Ambient Intelligence
            </p>
            <h1
              className="leading-none mb-6"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(2.6rem, 5vw, 4.2rem)",
                fontWeight: 300,
                letterSpacing: "-0.02em",
                color: "#1A1512",
              }}
            >
              From presentation friction to pure presence.
            </h1>
            <p className="text-sm" style={{ color: "#5A5550", lineHeight: 1.7 }}>
              Stash Live listens locally — no cloud, no latency — and surfaces the right data
              exactly when you need it.
            </p>
          </div>

          {/* Spacer — the center figure lives here */}
          <div className="flex-1" />

          {/* Right wing */}
          <div className="w-[33%] pl-8">
            <p className="text-sm mb-4" style={{ color: "#1A1512", lineHeight: 1.7 }}>
              The real-time, on-device voice engine detects your keywords and projects clean,
              context-aware data cards directly beside you — so your audience stays with{" "}
              <em>you</em>, not your screen.
            </p>

            {/* Frosted glass input */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.45)",
                backdropFilter: "blur(20px) saturate(120%)",
                border: "1px solid rgba(26,21,18,0.08)",
                boxShadow: "0 8px 32px 0 rgba(26,21,18,0.06)",
              }}
            >
              <p
                className="text-xs mb-3 uppercase tracking-widest"
                style={{ color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}
              >
                try saying
              </p>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="revenue, team, product, growth…"
                className="w-full bg-transparent text-sm outline-none placeholder-[#A8A4A0]"
                style={{ color: "#1A1512", fontFamily: "'Inter', sans-serif" }}
              />

              {/* Live cards */}
              <div
                className="mt-4 grid grid-cols-3 gap-2 overflow-hidden"
                style={{
                  maxHeight: activeCards ? "120px" : "0px",
                  opacity: activeCards ? 1 : 0,
                  transition: reducedMotion
                    ? "opacity 0.05s"
                    : "max-height 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
                }}
              >
                {(activeCards ?? []).map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(26,21,18,0.07)",
                    }}
                  >
                    <p
                      className="text-lg font-semibold leading-none mb-1"
                      style={{ color: card.color, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {card.value}
                    </p>
                    <p className="text-[10px]" style={{ color: "#5A5550" }}>
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>

              {!activeCards && (
                <p
                  className="mt-3 text-[10px]"
                  style={{ color: "#A8A4A0", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ● engine idle — speak a keyword to project
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── VALUE SECTION ─── */}
      <section
        className="w-full grid md:grid-cols-2 items-stretch"
        style={{ minHeight: "80vh" }}
      >
        {/* Left — copy */}
        <div
          className="flex flex-col justify-center px-12 py-20 lg:px-20"
          style={{ background: "#FBF9F6" }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-6"
            style={{ color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}
          >
            The Engagement Gap
          </p>
          <h2
            className="mb-6 leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2rem, 3.5vw, 3rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512",
            }}
          >
            What virtual meetings cost you is hiding in plain sight.
          </h2>
          <div className="space-y-5" style={{ color: "#5A5550", fontSize: "0.9rem", lineHeight: 1.8 }}>
            <p>
              Every time a presenter minimizes their face to share a screen, the audience loses the
              human signal they subconsciously rely on — micro-expressions, eye contact, natural
              emphasis. Engagement plummets in the first 90 seconds.
            </p>
            <p>
              Stash Live resolves this asymmetry. The engine listens locally on your device,
              identifies the keywords in your flow, and automatically projects clean, context-aware
              data cards directly beside your shoulder in the video frame.
            </p>
            <p>
              You maintain direct eye contact. Your audience stays present. The data appears exactly
              when it&apos;s relevant — never a beat too early or too late.
            </p>
          </div>
          <div className="mt-10 flex items-center gap-6">
            <button
              className="px-6 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
              style={{ background: "#1A1512", color: "#FBF9F6" }}
            >
              Book Live Demo
            </button>
            <a
              href="#"
              className="text-sm transition-opacity hover:opacity-60 flex items-center gap-2"
              style={{ color: "#5A5550" }}
            >
              How it works
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>→</span>
            </a>
          </div>
        </div>

        {/* Right — grayscale texture + glassmorphic chart */}
        <div className="relative overflow-hidden" style={{ minHeight: "500px" }}>
          <ImageWithFallback
            src={orangeTexture}
            alt="Abstract orange cloud texture rendered in monochrome"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "grayscale(100%) contrast(110%)" }}
          />
          {/* Dark overlay for legibility */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(26,21,18,0.18)" }}
          />

          {/* Glass chart card */}
          <div
            className="absolute inset-0 flex items-center justify-center p-8"
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "rgba(255,255,255,0.45)",
                backdropFilter: "blur(20px) saturate(120%)",
                border: "1px solid rgba(26,21,18,0.06)",
                boxShadow: "0 8px 32px 0 rgba(26,21,18,0.08)",
              }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p
                    className="text-xs uppercase tracking-widest"
                    style={{ color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Engagement Index
                  </p>
                  <p
                    className="text-2xl font-semibold mt-0.5"
                    style={{ color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    91 <span className="text-sm font-normal" style={{ color: "#5A5550" }}>/ 100</span>
                  </p>
                </div>
                <span
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ● live
                </span>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-2" style={{ height: "80px" }}>
                {CHART_DATA.map((d) => (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${(d.value / MAX_VAL) * 68}px`,
                        background:
                          d.month === "Jun"
                            ? "#1A1512"
                            : "rgba(26,21,18,0.15)",
                        transition: "height 0.4s ease",
                      }}
                    />
                    <span
                      className="text-[9px]"
                      style={{ color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {d.month}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="mt-4 pt-4 flex justify-between text-[10px]"
                style={{ borderTop: "1px solid rgba(26,21,18,0.08)", color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}
              >
                <span>on-device · no cloud</span>
                <span style={{ color: "#10B981" }}>↑ +18 pts this quarter</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── LOGO STRIP ─── */}
      <div
        className="py-12 px-8 flex flex-wrap items-center justify-center gap-10"
        style={{ borderBottom: "1px solid rgba(26,21,18,0.06)" }}
      >
        {["Amsterdam", "×Hamilton", "CALIFORNIA", "venice.", "Meridian"].map((name) => (
          <span
            key={name}
            className="text-lg font-light tracking-tight opacity-40 select-none"
            style={{ fontFamily: name.includes("×") || name.endsWith(".") ? "'Cormorant Garamond', serif" : "'Inter', sans-serif", color: "#1A1512" }}
          >
            {name}
          </span>
        ))}
      </div>

      {/* ─── FOOTER ─── */}
      <footer className="px-8 md:px-14 pt-14 pb-10" style={{ background: "#FBF9F6" }}>
        {/* Stars */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <span key={i} style={{ color: "#1A1512", fontSize: "0.85rem" }}>★</span>
            ))}
          </div>
          <p className="text-xs" style={{ color: "#5A5550", fontFamily: "'Inter', sans-serif" }}>
            Helped over 100+ businesses scale live engagement.
          </p>
        </div>

        {/* Footer nav row */}
        <div className="flex items-center justify-between mb-8 pb-8" style={{ borderBottom: "1px solid rgba(26,21,18,0.08)" }}>
          <nav className="flex items-center gap-6">
            {["about", "case studies"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm transition-opacity hover:opacity-60"
                style={{ color: "#5A5550" }}
              >
                {item}
              </a>
            ))}
          </nav>

          <span
            className="text-xl tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, color: "#1A1512" }}
          >
            Stash Live
          </span>

          <button
            className="px-5 py-2.5 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
            style={{ background: "#1A1512", color: "#FBF9F6" }}
          >
            Book a free call
          </button>
        </div>

        {/* Link grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {[
            {
              title: "Product",
              links: ["features", "integrations", "changelog", "api reference"],
            },
            {
              title: "Company",
              links: ["team", "privacy policy", "terms of service", "security"],
            },
            {
              title: "Resources",
              links: ["documentation", "developer api", "case studies", "blog"],
            },
            {
              title: "Status",
              links: [],
              custom: true,
            },
          ].map((col) => (
            <div key={col.title}>
              <p
                className="text-xs uppercase tracking-widest mb-4"
                style={{ color: "#1A1512", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {col.title}
              </p>
              {col.custom ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: "#10B981" }}
                    />
                    <span className="text-sm" style={{ color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>
                      system operational
                    </span>
                  </div>
                  <p
                    className="text-xs"
                    style={{ color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    v1.4.2 local
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "#A8A4A0", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    on-device client active
                  </p>
                  {/* Motion toggle */}
                  <div className="pt-3 flex items-center gap-3">
                    <button
                      onClick={() => setReducedMotion((v) => !v)}
                      className="relative inline-flex items-center rounded-full transition-colors"
                      style={{
                        width: "36px",
                        height: "20px",
                        background: reducedMotion ? "#1A1512" : "rgba(26,21,18,0.15)",
                        flexShrink: 0,
                      }}
                      aria-label="Toggle reduced motion"
                    >
                      <span
                        className="absolute rounded-full transition-transform"
                        style={{
                          width: "14px",
                          height: "14px",
                          background: "#FBF9F6",
                          top: "3px",
                          left: "3px",
                          transform: reducedMotion ? "translateX(16px)" : "translateX(0)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                    <span className="text-[10px]" style={{ color: "#5A5550", fontFamily: "'JetBrains Mono', monospace" }}>
                      {reducedMotion ? "motion off" : "motion on"}
                    </span>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm transition-opacity hover:opacity-60"
                        style={{ color: "#5A5550" }}
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Bottom line */}
        <div
          className="mt-12 pt-6 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(26,21,18,0.06)" }}
        >
          <p className="text-xs" style={{ color: "#A8A4A0", fontFamily: "'JetBrains Mono', monospace" }}>
            © 2026 Stash Live Inc. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "#A8A4A0", fontFamily: "'JetBrains Mono', monospace" }}>
            ambient presenter suite
          </p>
        </div>
      </footer>
    </div>
  );
}
