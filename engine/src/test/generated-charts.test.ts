import { describe, it, expect } from 'vitest';
import {
  generatedDraftSchema,
  normalizeDraftInput,
  GENERATED_BLOCK_KINDS,
} from '../generation/draft-schema.js';
import { assembleCardSpec } from '../generation/assemble.js';
import type { GroundingCandidate } from '../generation/grounding.js';

/**
 * Two regressions this covers:
 *
 *  1. A generated card could never contain a chart. Chart kinds were absent from
 *     the draft schema AND from every layout recipe's `blockOrder`, so they
 *     sorted last and were truncated away. "ARR and gross margin" could only ever
 *     come back as a metric row and a paragraph.
 *  2. The picture came from `candidates[sourceIndex]` - whichever entity the
 *     search ranked first - so asking about a person inside a film illustrated
 *     the card with the film.
 */

const ctx = {
  utterance: 'our ARR and gross margin',
  candidates: [] as GroundingCandidate[],
  imageUrl: null,
  autoDismissMs: 12_000,
};

function assemble(blocks: unknown[], layout: 'stat' | 'explainer' | 'profile' = 'stat') {
  const draft = generatedDraftSchema.parse({
    relevant: true,
    sourceIndex: null,
    subjectIndex: null,
    title: 'ARR & Gross Margin',
    subtitle: 'Stash Live Financial Highlights',
    accent: 'amber',
    layout,
    imageWanted: false,
    blocks,
  });
  return assembleCardSpec(draft, ctx);
}

describe('generated drafts may contain charts', () => {
  it('permits bar_chart and line_chart block kinds', () => {
    expect(GENERATED_BLOCK_KINDS).toContain('bar_chart');
    expect(GENERATED_BLOCK_KINDS).toContain('line_chart');
    // avatar_grid still needs people data the model does not have.
    expect(GENERATED_BLOCK_KINDS).not.toContain('avatar_grid');
  });

  it('parses a line_chart block', () => {
    const parsed = generatedDraftSchema.parse({
      relevant: true,
      sourceIndex: 0,
      subjectIndex: 0,
      title: 'MRR',
      subtitle: null,
      accent: 'amber',
      layout: 'stat',
      imageWanted: false,
      blocks: [
        {
          kind: 'line_chart',
          series: [
            { label: 'Jan', value: 120 },
            { label: 'Feb', value: 132 },
            { label: 'Mar', value: 148 },
          ],
          area: true,
        },
      ],
    });
    const block = parsed.blocks[0] as any;
    expect(block.kind).toBe('line_chart');
    expect(block.series).toHaveLength(3);
  });

  it('keeps a chart through assembly on a stat layout', () => {
    const result = assemble([
      {
        kind: 'metric_row',
        items: [
          { label: 'ARR', value: '$148,000' },
          { label: 'GROSS MARGIN', value: '84%' },
        ],
      },
      {
        kind: 'line_chart',
        series: [
          { label: 'Jan', value: 120 },
          { label: 'Feb', value: 134 },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The chart must survive assembly, and sit next to the metric row.
    const kinds = result.value.blocks.map((b) => b.kind);
    expect(kinds).toContain('line_chart');
    expect(kinds.indexOf('line_chart')).toBeGreaterThan(-1);
    // Source footer is still appended.
    expect(kinds[kinds.length - 1]).toBe('status_list');
  });

  it('normalizes a chart block the model emitted loosely', () => {
    const draft = normalizeDraftInput({
      title: 'ARR',
      blocks: [
        {
          type: 'line_chart',
          series: [
            { label: 'Jan', value: '120' },
            { label: 'Feb', value: 134 },
            { label: 'nope', value: 'abc' },
          ],
        },
      ],
    });
    const block = draft.blocks[0];
    expect(block.kind).toBe('line_chart');
    // Non-numeric points are dropped rather than poisoning the series.
    expect(block.series).toHaveLength(2);
    expect(block.series[0].value).toBe(120);
  });

  it('drops a chart with fewer than two points, which cannot be a chart', () => {
    const draft = normalizeDraftInput({
      title: 'ARR',
      blocks: [{ kind: 'bar_chart', series: [{ label: 'Jan', value: 120 }] }],
    });
    // No usable chart block, so the normalizer falls back to a text block.
    expect(draft.blocks[0].kind).toBe('text');
  });

  it('carries subjectIndex through normalization', () => {
    const draft = normalizeDraftInput({
      title: 'X',
      sourceIndex: 0,
      subjectIndex: 3,
      blocks: [{ kind: 'text', paragraphs: ['a'] }],
    });
    expect(draft.subjectIndex).toBe(3);
    // A model that omits it must not become `undefined` mid-schema.
    expect(normalizeDraftInput({ title: 'X', blocks: [] }).subjectIndex).toBeNull();
  });
});