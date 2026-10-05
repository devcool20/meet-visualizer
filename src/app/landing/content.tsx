/**
 * Landing page content and demo data.
 *
 * Kept out of the components so copy can be edited without touching layout,
 * and so the voice demo's keyword map has one definition shared by the input,
 * the simulator, and the preview cards.
 */
import type { ReactElement, ReactNode } from "react";
import { REVENUE_CARD, TEAM_CARD, PRODUCT_CARD, GROWTH_CARD } from "@stash/card-core";
import type { CardSpec } from "@stash/card-spec";

export type TopicKey = "revenue" | "team" | "product" | "growth";

/** The four approved sample cards, rendered through the real GlassCard. */
export const TOPIC_CARDS: Record<TopicKey, CardSpec> = {
  revenue: REVENUE_CARD,
  team: TEAM_CARD,
  product: PRODUCT_CARD,
  growth: GROWTH_CARD,
};

/** Compact metric strip shown under the voice input, keyed by spoken word. */
export const TOPIC_METRICS: Record<
  TopicKey,
  { label: string; value: string; emphasis: boolean }[]
> = {
  revenue: [
    { label: "Q2 Revenue", value: "$240,000", emphasis: true },
    { label: "YoY Growth", value: "+40%", emphasis: true },
    { label: "Churn", value: "1.8%", emphasis: false },
  ],
  team: [
    { label: "Headcount", value: "142", emphasis: true },
    { label: "Open Roles", value: "12", emphasis: false },
    { label: "NPS", value: "78", emphasis: true },
  ],
  product: [
    { label: "Daily Active Users", value: "48.2K", emphasis: true },
    { label: "Uptime", value: "99.97%", emphasis: true },
    { label: "Latency", value: "18ms", emphasis: false },
  ],
  growth: [
    { label: "MRR", value: "$180K", emphasis: true },
    { label: "Conversion", value: "4.7%", emphasis: true },
    { label: "CAC", value: "$124", emphasis: false },
  ],
};

/** Caption line the simulated speaker "says" while each card is projected. */
export const TOPIC_CAPTIONS: Record<TopicKey, string> = {
  revenue: "…our Q3 revenue came in at…",
  team: "…the active team size is…",
  product: "…on product latency…",
  growth: "…month over month growth…",
};

/** Simulated latency, ms — shown in the telemetry readouts. */
export const TOPIC_LATENCY: Record<TopicKey, number> = {
  revenue: 18,
  team: 24,
  product: 11,
  growth: 31,
};

export const TOPIC_KEYS = Object.keys(TOPIC_CARDS) as TopicKey[];

export function matchTopic(input: string): TopicKey | null {
  const lower = input.toLowerCase();
  return TOPIC_KEYS.find((key) => lower.includes(key)) ?? null;
}

/* ── Navigation ──────────────────────────────────────────────────────── */

export const NAV_SECTIONS = [
  { id: "demo", label: "How it works" },
  { id: "features", label: "Why Stash Live" },
  { id: "integrations", label: "Integrations" },
] as const;

/* ── Integrations ─────────────────────────────────────────────────────── */

export type Integration = {
  id: string;
  name: string;
  description: string;
  note?: string;
  /** Real integrations link out; the rest are declared as upcoming. */
  available: boolean;
   icon: (props: { className?: string }) => ReactElement;
};

function makeIcon(path: ReactNode, viewBox = "0 0 24 24") {
  return function IntegrationIcon({ className }: { className?: string }) {
    return (
      <svg viewBox={viewBox} fill="currentColor" className={className} aria-hidden focusable="false">
        {path}
      </svg>
    );
  };
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Sync database records and live workspace tables straight into your overlay.",
    available: true,
    icon: makeIcon(
      <path d="M4.6 2h14.8c1.4 0 2.6 1.2 2.6 2.6v14.8c0 1.4-1.2 2.6-2.6 2.6H4.6C3.2 22 2 20.8 2 19.4V4.6C2 3.2 3.2 2 4.6 2zm1.6 3.6v12.8h2.3V7.2l5.6 9.2h2.3V5.6h-2.3v9.2L8.5 5.6H6.2z" />,
    ),
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Pull in presentation decks and spreadsheet charts without leaving the call.",
    available: true,
    icon: makeIcon(
      <path d="M15.2 2H8.8L2 13.8L5.2 19.3L12 7.5L18.8 19.3H22L15.2 2ZM9.4 14.8L6 20.8H18L21.4 14.8H9.4ZM3 13.8L8.2 20.8L11.6 14.8L6.4 7.8L3 13.8Z" />,
    ),
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Project live inventory rows and customer records as structured cards.",
    note: "Beta",
    available: true,
    icon: makeIcon(
      <path d="M12.5 2.23l9 4.88a1 1 0 0 1 .5.87v8.08a1 1 0 0 1-.5.87l-9 4.88a1 1 0 0 1-1 0l-9-4.88a1 1 0 0 1-.5-.87V7.98a1 1 0 0 1 .5-.87l9-4.88a1 1 0 0 1 1 0zM12 4.14L4.85 8 12 11.86 19.15 8 12 4.14zM3.5 10.05v5.82L10.5 19.7v-5.83l-7-3.82zm17 0l-7 3.82v5.83l7-3.83v-5.82z" />,
    ),
  },
  {
    id: "slack",
    name: "Slack",
    description: "Stream channel alerts and workspace notifications as they happen.",
    note: "Requires admin",
    available: true,
    icon: makeIcon(
      <path d="M5.04 15.12a2.52 2.52 0 1 1-2.52-2.52h2.52zm1.26 0a2.52 2.52 0 0 1 5.04 0v5.04a2.52 2.52 0 1 1-5.04 0zM8.88 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52zm0 1.26a2.52 2.52 0 0 1 0 5.04H3.84a2.52 2.52 0 1 1 0-5.04zM18.96 8.88a2.52 2.52 0 1 1 2.52 2.52h-2.52zm-1.26 0a2.52 2.52 0 0 1-5.04 0V3.84a2.52 2.52 0 1 1 5.04 0zM15.12 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52zm0-1.26a2.52 2.52 0 0 1 0-5.04h5.04a2.52 2.52 0 1 1 0 5.04z" />,
    ),
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Project pipeline value, deal stages, and activity logs on the fly.",
    note: "Beta",
    available: true,
    icon: makeIcon(
      <path d="M18.88 12.35a3.86 3.86 0 0 0-3.13-2.14V7.58a3.11 3.11 0 1 0-1.5 0v2.63a3.86 3.86 0 0 0-2.31 1.7L7.33 9.47A3.11 3.11 0 1 0 6 10.74l4.63 2.45a3.86 3.86 0 1 0 6.64.91l4.08.77a1.55 1.55 0 1 0 .28-1.47zM7 9.75a1.56 1.56 0 1 1 0-3.11 1.56 1.56 0 0 1 0 3.11zm7.75-5a1.56 1.56 0 1 1 0 3.11 1.56 1.56 0 0 1 0-3.11zm-2.75 9.75a2.31 2.31 0 1 1 2.31-2.31 2.31 2.31 0 0 1-2.31 2.31z" />,
    ),
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Surface live pipeline dashboards and customer growth figures.",
    note: "Planned",
    available: false,
    icon: makeIcon(
      <path d="M19.14 9.87A6.49 6.49 0 0 0 7.4 8.7a4.67 4.67 0 0 0-3.69 4.56 4.78 4.78 0 0 0 .19 1.34 4.19 4.19 0 0 0-1.6 3.32 4.29 4.29 0 0 0 4.29 4.29h12a3.81 3.81 0 0 0 .5-7.59 4 4 0 0 0 .35-4.75z" />,
    ),
  },
];

/* ── How it works ─────────────────────────────────────────────────────── */

export const STEPS = [
  {
    title: "Speak naturally",
    body: "No hotkey, no trigger phrase to memorise. Say the thing you would normally point at, and the engine listens for it on-device.",
    detail: "Voice runs locally · nothing recorded",
  },
  {
    title: "The engine matches",
    body: "Your transcript is matched against the cards in your library and the workspaces you have connected, then scored for confidence.",
    detail: "Tiered matching · cooldown aware",
  },
  {
    title: "It lands beside you",
    body: "The card renders directly into your camera feed at the correct moment, positioned on your free shoulder.",
    detail: "Spring placement · compression safe",
  },
] as const;
