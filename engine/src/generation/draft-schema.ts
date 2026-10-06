/**
 * Draft schema — what the model may emit (plan §3.4).
 *
* The model never emits: colours, url, id, revision, v, ttlMs, position. Those
 * are engine-owned.
 *
 * Chart blocks WERE excluded here, which meant a generated card could never show
 * a chart no matter what the user asked for - "ARR and gross margin" produced a
 * metric row and a paragraph and nothing else, because the model had no way to
 * express one. They are now allowed, carrying one hard constraint stated in the
 * prompt: every plotted value must come from the grounding text. `avatar_grid`
 * stays excluded - it needs people data the model does not have.
 */
import { z } from 'zod';

export const GENERATED_BLOCK_KINDS = [
  'text',
  'bullets',
  'metric_row',
  'status_list',
  'bar_chart',
  'line_chart',
] as const;

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

/** One chart point. `label` is the axis caption, e.g. a month. */
const draftChartPointSchema = z.object({
  label: z.string().min(1).max(16),
  value: z.number().finite(),
});

const draftBarChartBlockSchema = z.object({
  kind: z.literal('bar_chart'),
  series: z.array(draftChartPointSchema).min(2).max(8),
  unit: z.string().max(12).optional(),
});

const draftLineChartBlockSchema = z.object({
  kind: z.literal('line_chart'),
  series: z.array(draftChartPointSchema).min(2).max(8),
  area: z.boolean().optional(),
  unit: z.string().max(12).optional(),
});

const draftBlockSchema = z.discriminatedUnion('kind', [
  draftTextBlockSchema,
  draftBulletsBlockSchema,
  draftMetricRowBlockSchema,
  draftStatusListBlockSchema,
  draftBarChartBlockSchema,
  draftLineChartBlockSchema,
]);

export const generatedDraftSchema = z.object({
  relevant: z.boolean(),
  sourceIndex: z.number().int().nullable().optional(),
  /**
   * Which candidate IS the subject of the request, as opposed to which one
   * best grounds the facts. For "aditya roy kapur in aashiqui 2" the subject is
   * the actor (his portrait, his name on the title) while the facts about the
   * role come from the film. Without this the engine always illustrated the card
   * with `candidates[0]`, which is whichever entity the search ranked first -
   * so asking about a person inside a film produced the film's poster.
   */
  subjectIndex: z.number().int().nullable().optional(),
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

      if (kind === 'bar_chart' || kind === 'line_chart') {
        const raw = Array.isArray(b.series) ? b.series : [];
        const series = raw
          .map((p: any) => ({
            label: String(p?.label ?? '').slice(0, 16),
            value: Number(p?.value),
          }))
          .filter((p: any) => p.label !== '' && Number.isFinite(p.value))
          .slice(0, 8);
        // A chart needs at least two points to be a chart at all.
        if (series.length < 2) return null;
        return {
          kind,
          series,
          ...(b.unit ? { unit: String(b.unit).slice(0, 12) } : {}),
          ...(kind === 'line_chart' && b.area !== undefined ? { area: Boolean(b.area) } : {}),
        };
      }

      return null;
    })
    .filter(Boolean);

  if (draft.blocks.length === 0) {
    draft.blocks = [{ kind: 'text', paragraphs: [String(draft.title || 'Overview')] }];
  }

  draft.sourceIndex = typeof draft.sourceIndex === 'number' ? draft.sourceIndex : null;
  draft.subjectIndex = typeof draft.subjectIndex === 'number' ? draft.subjectIndex : null;
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
      subjectIndex: { type: ['integer', 'null'] },
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
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'bar_chart' },
                series: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', minLength: 1, maxLength: 16 },
                      value: { type: 'number' },
                    },
                    required: ['label', 'value'],
                    additionalProperties: false,
                  },
                },
                unit: { type: 'string', maxLength: 12 },
              },
              required: ['kind', 'series'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'line_chart' },
                series: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', minLength: 1, maxLength: 16 },
                      value: { type: 'number' },
                    },
                    required: ['label', 'value'],
                    additionalProperties: false,
                  },
                },
                area: { type: 'boolean' },
                unit: { type: 'string', maxLength: 12 },
              },
              required: ['kind', 'series'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['relevant', 'sourceIndex', 'subjectIndex', 'title', 'subtitle', 'accent', 'layout', 'imageWanted', 'blocks'],
    additionalProperties: false,
  };
}
