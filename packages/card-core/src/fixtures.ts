/**
 * The four approved cards, expressed as CardSpec.
 *
 * These are the acceptance gate for the contract (plan §2.3): if one of the
 * approved designs cannot be expressed here, the SPEC changes, not the card.
 * They double as the sample cards seeded on every new account, so a new user
 * can see a card on their own face before connecting anything.
 *
 * Content is transcribed from the preview components in src/app/App.tsx
 * (RevenuePreviewCard L133, TeamPreviewCard L223, ProductPreviewCard L287,
 * GrowthPreviewCard L383). Note TRIGGER_MAP was NOT usable as a source: it
 * holds only flat label/value/colour rows with no titles, series, people or
 * trigger phrases.
 */
import type { CardSpec } from '@stash/card-spec';

export interface SampleCard {
  spec: CardSpec;
  /** Seed trigger phrases. Users edit these freely afterwards. */
  phrases: string[];
}

export const REVENUE_CARD: CardSpec = {
  v: 1,
  id: 'sample-revenue',
  revision: 1,
  title: 'Revenue',
  subtitle: 'Q2 FY26',
  blocks: [
    {
      kind: 'metric_row',
      items: [
        { label: 'Q2 Revenue', value: '$240,000', emphasis: true },
        { label: 'Growth', value: '+40%', delta: { value: 'YoY', direction: 'up' } },
        { label: 'Churn', value: '1.8%' },
      ],
    },
    {
      kind: 'line_chart',
      area: true,
      series: [
        { label: 'Jan', value: 42 },
        { label: 'Feb', value: 58 },
        { label: 'Mar', value: 51 },
        { label: 'Apr', value: 74 },
        { label: 'May', value: 68 },
        { label: 'Jun', value: 91 },
      ],
    },
  ],
};

export const TEAM_CARD: CardSpec = {
  v: 1,
  id: 'sample-team',
  revision: 1,
  title: 'Team',
  subtitle: 'Engineering & Product',
  blocks: [
    {
      kind: 'metric_row',
      items: [
        { label: 'Headcount', value: '142 Active', emphasis: true },
        { label: 'Performance', value: '78 NPS' },
        { label: 'Open Roles', value: '12' },
      ],
    },
    {
      kind: 'avatar_grid',
      columns: 6,
      people: [
        { name: 'Jane Doe', initials: 'JD', status: 'active' },
        { name: 'Alex Miller', initials: 'AM', status: 'active' },
        { name: 'Sarah Reed', initials: 'SR', status: 'active' },
        { name: 'Liam King', initials: 'LK', status: 'active' },
        { name: 'Will Taylor', initials: 'WT', status: 'idle' },
        { name: 'Penny Lane', initials: 'PL', status: 'active' },
      ],
    },
    {
      kind: 'status_list',
      monospace: true,
      rows: [
        { text: 'Notion API: jane.doe connected', state: 'ok' },
        { text: 'Slack: 4 channels integrated', state: 'ok' },
        { text: 'GitHub: main branch parsed', state: 'ok' },
      ],
    },
  ],
};

export const PRODUCT_CARD: CardSpec = {
  v: 1,
  id: 'sample-product',
  revision: 1,
  title: 'Product Health',
  subtitle: 'Real-time latency monitor',
  blocks: [
    {
      kind: 'metric_row',
      items: [
        { label: 'Daily Active Users', value: '48.2K', emphasis: true },
        { label: 'Latency', value: '18ms' },
        { label: 'Uptime', value: '99.97%' },
      ],
    },
    {
      kind: 'line_chart',
      area: true,
      unit: 'ms',
      series: [
        { label: '', value: 32 },
        { label: '', value: 27 },
        { label: '', value: 55 },
        { label: '', value: 41 },
        { label: '', value: 24 },
        { label: '', value: 62 },
        { label: '', value: 19 },
        { label: '', value: 71 },
        { label: '', value: 30 },
        { label: '', value: 46 },
      ],
    },
  ],
};

export const GROWTH_CARD: CardSpec = {
  v: 1,
  id: 'sample-growth',
  revision: 1,
  title: 'Growth',
  subtitle: 'Trailing six months',
  blocks: [
    {
      kind: 'metric_row',
      items: [
        { label: 'Monthly Recurring Revenue', value: '$180K', emphasis: true },
        { label: 'Conversion', value: '4.7%' },
        { label: 'CAC', value: '$124' },
      ],
    },
    {
      kind: 'bar_chart',
      series: [
        { label: 'Jan', value: 120 },
        { label: 'Feb', value: 138 },
        { label: 'Mar', value: 151 },
        { label: 'Apr', value: 160 },
        { label: 'May', value: 172 },
        { label: 'Jun', value: 180 },
      ],
      unit: 'K',
    },
  ],
};

/** Every approved design. Used by the golden fixture parity tests. */
export const APPROVED_CARDS: CardSpec[] = [
  REVENUE_CARD,
  TEAM_CARD,
  PRODUCT_CARD,
  GROWTH_CARD,
];

/**
 * Blocks not exercised by the approved four. Included so the golden tests cover
 * every block kind the spec allows, not just the ones the mockups happened to
 * use.
 */
export const COVERAGE_CARD: CardSpec = {
  v: 1,
  id: 'sample-coverage',
  revision: 1,
  title: 'Roadmap',
  subtitle: 'H2 priorities',
  blocks: [
    { kind: 'bullets', items: ['Ship Notion sync', 'Close the SOC-2 audit', 'Open EU region'] },
    {
      kind: 'text',
      paragraphs: [
        'We are prioritising reliability over surface area this half, with a single new integration.',
      ],
    },
  ],
};

/** Seeded on every new account (plan §4.2 step 3). */
export const SAMPLE_CARDS: SampleCard[] = [
  {
    spec: REVENUE_CARD,
    phrases: ['q2 revenue', 'revenue numbers', 'how much revenue', 'top line'],
  },
  {
    spec: TEAM_CARD,
    phrases: ['our team', 'the team', 'headcount', 'who is on the team'],
  },
  {
    spec: PRODUCT_CARD,
    phrases: ['product health', 'daily active users', 'our uptime', 'latency'],
  },
];
