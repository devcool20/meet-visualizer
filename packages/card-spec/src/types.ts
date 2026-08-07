/**
 * Stash Live card contract.
 *
 * A CardSpec is the ONLY thing that crosses the wire between the engine and the
 * in-meeting client. It is plain JSON: no bitmaps, no functions, no DOM. Both
 * renderers (`@stash/card-react` for the dashboard, `@stash/card-canvas` for the
 * outbound video) consume exactly this shape.
 *
 * See plan §2.3. The block list is deliberately composable: the approved
 * TeamPreviewCard mixes a metric row, an avatar grid and a monospaced activity
 * log in one card, which a flat variant union could not express.
 */

export type CardSpecVersion = 1;

export const CARD_SPEC_VERSION: CardSpecVersion = 1;

export interface MetricItem {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  /** Renders at the large display size. At most one per row should set this. */
  emphasis?: boolean;
}

export interface Point {
  label: string;
  value: number;
}

export type PersonStatus = 'active' | 'idle' | 'offline';

export interface Person {
  name: string;
  initials: string;
  status: PersonStatus;
}

export type StatusState = 'ok' | 'warn' | 'error' | 'info';

export interface StatusRow {
  text: string;
  state: StatusState;
}

export type CardBlock =
  | { kind: 'metric_row'; items: MetricItem[] }
  | { kind: 'bar_chart'; series: Point[]; unit?: string; maxValue?: number }
  | { kind: 'line_chart'; series: Point[]; area?: boolean; unit?: string }
  | { kind: 'avatar_grid'; people: Person[]; columns?: number }
  | { kind: 'status_list'; rows: StatusRow[]; monospace?: boolean }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'text'; paragraphs: string[] }
  | { kind: 'image'; url: string; alt?: string; aspect?: number };

export type CardBlockKind = CardBlock['kind'];

export interface CardTheme {
  /** Glass fill drawn over the blurred camera region. */
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  /** Backdrop blur radius in CSS pixels at 1x. */
  blurPx: number;
  /** Backdrop saturation multiplier. Dropping this makes the glass look grey. */
  saturate: number;
}

export type CardPosition = 'auto' | 'left' | 'right';

export interface CardSpec {
  v: CardSpecVersion;
  id: string;
  /** Bumped on every edit. Clients drop cached raster when this changes. */
  revision: number;
  title: string;
  subtitle?: string;
  /** Rendered top-to-bottom in order. */
  blocks: CardBlock[];
  theme?: Partial<CardTheme>;
  position?: CardPosition;
  ttlMs?: number;
}

/* ------------------------------------------------------------------ */
/* WebSocket protocol v2 (plan §2.5)                                    */
/* ------------------------------------------------------------------ */

export type TriggerMode = 'hold-to-talk' | 'ambient';

export interface UserSettings {
  /** Three-stop sensitivity. The raw threshold is never shown to the user. */
  sensitivity: 'certain' | 'balanced' | 'eager';
  position: CardPosition;
  autoDismissMs: number;
  reducedMotion: boolean;
  /** Off by default. Controls whether near-miss transcript text is retained. */
  storeSnippets: boolean;
  /**
   * Which capture path is live. Exactly one at a time.
   * - 'hold-to-talk' (default): client emits `generate` frames, never `transcript`.
   * - 'ambient': client emits `transcript` frames, never `generate`.
   * The engine accepts both frame types from any user; gating lives in the client.
   */
  triggerMode: TriggerMode;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  sensitivity: 'balanced',
  position: 'auto',
  autoDismissMs: 12_000,
  reducedMotion: false,
  storeSnippets: false,
  triggerMode: 'hold-to-talk',
};

export type ClientMsg =
  | { t: 'hello'; token: string; client: string; version: string }
  | { t: 'transcript'; text: string; final: boolean; ts: number }
  | { t: 'dismiss'; cardId?: string }
  | { t: 'ping' }
  | { t: 'generate'; captureId: string; text: string; ts: number };

export type ServerErrorCode =
  | 'auth_failed'
  | 'token_expired'
  | 'rate_limited'
  | 'internal';

export type GenerateFailCode =
  | 'empty'
  | 'no_provider'
  | 'timeout'
  | 'invalid_output'
  | 'rate_limited'
  | 'internal';

export type ServerMsg =
  | { t: 'ready'; userId: string; cardCount: number }
  | { t: 'config'; settings: UserSettings; token?: string }
  | { t: 'prewarm'; card: CardSpec }
  | { t: 'show'; card: CardSpec; matchedPhrase: string; score: number; captureId?: string; origin?: 'match' | 'generated' }
  | { t: 'hide'; cardId: string }
  | { t: 'invalidate'; cardIds: string[] }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'pong' }
  | { t: 'generating'; captureId: string }
  | { t: 'generate_failed'; captureId: string; code: GenerateFailCode; message: string };
