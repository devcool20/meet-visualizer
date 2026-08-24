/**
 * Draft schema — what the model may emit (plan §3.4).
 *
 * The model never emits: colours, url, id, revision, v, ttlMs, position,
 * chart series. Those are engine-owned. GENERATED_BLOCK_KINDS controls which
 * block kinds the model is allowed to emit — chart blocks and avatar_grid are
 * excluded from the generated path.
 */
import { z } from 'zod';

export const GENERATED_BLOCK_KINDS = ['text', 'bullets', 'metric_row', 'status_list'] as const;

const draftTextBlockSchema = z.object({
  kind: z.literal('text'),
  paragraphs: z.array(z.string().min(1).max(300)).min(1).max(3),
});

const draftBulletsBlockSchema = z.object({
  kind: z.literal('bullets'),
  items: z.array(z.string().min(1).max(110)).min(1).max(5),
});

const draftMetricItemSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(28),
});

const draftMetricRowBlockSchema = z.object({
  kind: z.literal('metric_row'),
  items: z.array(draftMetricItemSchema).min(1).max(3),
});

const draftStatusRowSchema = z.object({
  text: z.string().min(1).max(110),
  state: z.enum(['ok', 'warn', 'error', 'info']).default('info'),
});

const draftStatusListBlockSchema = z.object({
  kind: z.literal('status_list'),
  rows: z.array(draftStatusRowSchema).min(1).max(5),
});

const draftBlockSchema = z.discriminatedUnion('kind', [
  draftTextBlockSchema,
  draftBulletsBlockSchema,
  draftMetricRowBlockSchema,
  draftStatusListBlockSchema,
]);

export const generatedDraftSchema = z.object({
  relevant: z.boolean(),
  sourceIndex: z.number().int().nullable().optional(),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(90).nullable().optional(),
  accent: z.enum(['amber', 'teal', 'indigo', 'rose', 'emerald', 'slate']).catch('amber'),
  layout: z.enum(['profile', 'explainer', 'stat', 'list']).catch('profile'),
  imageWanted: z.boolean().catch(false),
  blocks: z.array(draftBlockSchema).min(1).max(4),
});

/**
 * Normalizes raw LLM output into standard generatedDraftSchema.
 * LLMs frequently emit `content` instead of `blocks`, `type` instead of `kind`,
 * or flat `text: string` instead of `paragraphs: string[]`.
 */
export function normalizeDraftInput(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;

  const draft = { ...raw };
  const rawBlocks = Array.isArray(draft.blocks) ? draft.blocks : Array.isArray(draft.content) ? draft.content : [];

  draft.blocks = rawBlocks
    .map((b: any) => {
      if (!b || typeof b !== 'object') return null;
      const kind = b.kind || b.type;

      if (kind === 'text') {
        let paragraphs: string[] = [];
        if (Array.isArray(b.paragraphs)) {
          paragraphs = b.paragraphs.filter((p: any) => typeof p === 'string');
        } else if (typeof b.text === 'string') {
          paragraphs = [b.text];
        } else if (typeof b.paragraph === 'string') {
          paragraphs = [b.paragraph];
        }
        return { kind: 'text', paragraphs: paragraphs.slice(0, 3).map((p) => p.slice(0, 300)) };
      }

      if (kind === 'bullets' || kind === 'bullet_list') {
        const items = Array.isArray(b.items)
          ? b.items.filter((i: any) => typeof i === 'string').map((i: string) => i.slice(0, 110))
          : [];
        return { kind: 'bullets', items: items.slice(0, 5) };
      }

      if (kind === 'metric_row' || kind === 'metrics') {
        const items = Array.isArray(b.items)
          ? b.items.map((i: any) => ({
              label: String(i?.label || 'Metric').slice(0, 40),
              value: String(i?.value || '-').slice(0, 28),
            }))
          : [];
        return { kind: 'metric_row', items: items.slice(0, 3) };
      }

      if (kind === 'status_list' || kind === 'status') {
        const rows = Array.isArray(b.rows)
          ? b.rows.map((r: any) => ({
              text: String(r?.text || '').slice(0, 110),
              state: ['ok', 'warn', 'error', 'info'].includes(r?.state) ? r.state : 'info',
            }))
          : [];
        return { kind: 'status_list', rows: rows.slice(0, 5) };
      }

      return null;
    })
    .filter(Boolean);

  if (draft.blocks.length === 0) {
    draft.blocks = [{ kind: 'text', paragraphs: [String(draft.title || 'Overview')] }];
  }

  draft.sourceIndex = typeof draft.sourceIndex === 'number' ? draft.sourceIndex : null;
  return draft;
}

export type GeneratedDraft = z.infer<typeof generatedDraftSchema>;

/**
 * JSON Schema (draft-07 subset) sent to providers.
 * OpenAI strict mode requires additionalProperties:false and complete required lists.
 */
export function buildDraftJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      relevant: { type: 'boolean' },
      sourceIndex: { type: ['integer', 'null'] },
      title: { type: 'string', minLength: 1, maxLength: 60 },
      subtitle: { type: ['string', 'null'], maxLength: 90 },
      accent: { type: 'string', enum: ['amber', 'teal', 'indigo', 'rose', 'emerald', 'slate'] },
      layout: { type: 'string', enum: ['profile', 'explainer', 'stat', 'list'] },
      imageWanted: { type: 'boolean' },
      blocks: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          oneOf: [
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'text' },
                paragraphs: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 3,
                  items: { type: 'string', minLength: 1, maxLength: 300 },
                },
              },
              required: ['kind', 'paragraphs'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'bullets' },
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 5,
                  items: { type: 'string', minLength: 1, maxLength: 110 },
                },
              },
              required: ['kind', 'items'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'metric_row' },
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 3,
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', minLength: 1, maxLength: 40 },
                      value: { type: 'string', minLength: 1, maxLength: 28 },
                    },
                    required: ['label', 'value'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['kind', 'items'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'status_list' },
                rows: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 5,
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', minLength: 1, maxLength: 110 },
                      state: { type: 'string', enum: ['ok', 'warn', 'error', 'info'] },
                    },
                    required: ['text', 'state'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['kind', 'rows'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['relevant', 'sourceIndex', 'title', 'subtitle', 'accent', 'layout', 'imageWanted', 'blocks'],
    additionalProperties: false,
  };
}
