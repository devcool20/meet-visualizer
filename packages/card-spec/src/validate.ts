/**
 * Runtime validation for the card contract.
 *
 * This is not belt-and-braces: a CardSpec arrives in the extension's MAIN world
 * and is drawn into the canvas that becomes the user's outbound video. A
 * malformed spec must be rejected before it can throw inside the render loop,
 * because an exception there costs the user their camera.
 */
import { z } from 'zod';
import type { CardSpec, ClientMsg, ServerMsg } from './types.js';

const hexOrCssColor = z.string().min(1).max(64);

export const metricItemSchema = z.object({
  label: z.string().min(1).max(48),
  value: z.string().min(1).max(32),
  delta: z
    .object({
      value: z.string().min(1).max(24),
      direction: z.enum(['up', 'down', 'flat']),
    })
    .optional(),
  emphasis: z.boolean().optional(),
});

export const pointSchema = z.object({
  label: z.string().max(24),
  value: z.number().finite(),
});

export const personSchema = z.object({
  name: z.string().min(1).max(48),
  initials: z.string().min(1).max(3),
  status: z.enum(['active', 'idle', 'offline']),
});

export const statusRowSchema = z.object({
  text: z.string().min(1).max(120),
  state: z.enum(['ok', 'warn', 'error', 'info']),
});

export const cardBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('metric_row'), items: z.array(metricItemSchema).min(1).max(3) }),
  z.object({
    kind: z.literal('bar_chart'),
    series: z.array(pointSchema).min(1).max(12),
    unit: z.string().max(8).optional(),
    maxValue: z.number().finite().positive().optional(),
  }),
  z.object({
    kind: z.literal('line_chart'),
    series: z.array(pointSchema).min(2).max(24),
    area: z.boolean().optional(),
    unit: z.string().max(8).optional(),
  }),
  z.object({
    kind: z.literal('avatar_grid'),
    people: z.array(personSchema).min(1).max(12),
    columns: z.number().int().min(2).max(6).optional(),
  }),
  z.object({
    kind: z.literal('status_list'),
    rows: z.array(statusRowSchema).min(1).max(8),
    monospace: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('bullets'), items: z.array(z.string().min(1).max(120)).min(1).max(6) }),
  z.object({
    kind: z.literal('text'),
    paragraphs: z.array(z.string().min(1).max(320)).min(1).max(4),
  }),
  z.object({
    // Only https. A http:// image would both fail on the Meet page and risk
    // tainting the capture canvas (plan §3.2).
    kind: z.literal('image'),
    url: z.string().url().startsWith('https://').max(2048),
    alt: z.string().max(160).optional(),
    aspect: z.number().finite().positive().max(4).optional(),
  }),
]);

export const cardThemeSchema = z
  .object({
    surface: hexOrCssColor,
    border: hexOrCssColor,
    text: hexOrCssColor,
    textMuted: hexOrCssColor,
    accent: hexOrCssColor,
    blurPx: z.number().min(0).max(60),
    saturate: z.number().min(0).max(3),
  })
  .partial();

export const cardSpecSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(64),
  subtitle: z.string().max(96).optional(),
  blocks: z.array(cardBlockSchema).min(1).max(6),
  theme: cardThemeSchema.optional(),
  position: z.enum(['auto', 'left', 'right']).optional(),
  ttlMs: z.number().int().min(1000).max(120_000).optional(),
});

export const userSettingsSchema = z.object({
  sensitivity: z.enum(['certain', 'balanced', 'eager']),
  position: z.enum(['auto', 'left', 'right']),
  autoDismissMs: z.number().int().min(2000).max(120_000),
  reducedMotion: z.boolean(),
  storeSnippets: z.boolean(),
  triggerMode: z.enum(['hold-to-talk', 'ambient']).default('hold-to-talk'),
});

export const clientMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    token: z.string().min(16).max(512),
    client: z.string().max(64),
    version: z.string().max(32),
  }),
  z.object({
    t: z.literal('transcript'),
    text: z.string().max(4000),
    final: z.boolean(),
    ts: z.number(),
  }),
  z.object({ t: z.literal('dismiss'), cardId: z.string().max(64).optional() }),
  z.object({ t: z.literal('ping') }),
  z.object({
    t: z.literal('generate'),
    captureId: z.string().min(1).max(64),
    text: z.string().min(1).max(2000),
    ts: z.number(),
  }),
]);

export const serverMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), userId: z.string(), cardCount: z.number() }),
  z.object({ t: z.literal('config'), settings: userSettingsSchema, token: z.string().optional() }),
  z.object({ t: z.literal('prewarm'), card: cardSpecSchema }),
  z.object({
    t: z.literal('show'),
    card: cardSpecSchema,
    matchedPhrase: z.string(),
    score: z.number(),
    captureId: z.string().min(1).max(64).optional(),
    origin: z.enum(['match', 'generated']).optional(),
  }),
  z.object({ t: z.literal('hide'), cardId: z.string() }),
  z.object({ t: z.literal('invalidate'), cardIds: z.array(z.string()) }),
  z.object({
    t: z.literal('error'),
    code: z.enum(['auth_failed', 'token_expired', 'rate_limited', 'internal']),
    message: z.string(),
  }),
  z.object({ t: z.literal('pong') }),
  z.object({
    t: z.literal('generating'),
    captureId: z.string().min(1).max(64),
  }),
  z.object({
    t: z.literal('generate_failed'),
    captureId: z.string().min(1).max(64),
    code: z.enum(['empty', 'no_provider', 'timeout', 'invalid_output', 'rate_limited', 'internal']),
    message: z.string(),
  }),
]);

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function toResult<T>(parsed: z.SafeParseReturnType<unknown, T>): ValidationResult<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.errors[0];
  const path = first?.path.join('.') || '(root)';
  return { ok: false, error: `${path}: ${first?.message ?? 'invalid'}` };
}

export function parseCardSpec(input: unknown): ValidationResult<CardSpec> {
  return toResult(cardSpecSchema.safeParse(input) as z.SafeParseReturnType<unknown, CardSpec>);
}

export function parseClientMsg(input: unknown): ValidationResult<ClientMsg> {
  return toResult(clientMsgSchema.safeParse(input) as z.SafeParseReturnType<unknown, ClientMsg>);
}

export function parseServerMsg(input: unknown): ValidationResult<ServerMsg> {
  return toResult(serverMsgSchema.safeParse(input) as z.SafeParseReturnType<unknown, ServerMsg>);
}

/** Throwing variant for trusted-authoring paths (fixtures, seed data). */
export function assertCardSpec(input: unknown): CardSpec {
  const r = parseCardSpec(input);
  if (!r.ok) throw new Error(`Invalid CardSpec — ${r.error}`);
  return r.value;
}
