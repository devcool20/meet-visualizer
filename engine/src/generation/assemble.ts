/**
 * Card assembly (plan §3.7).
 *
 * Transforms a validated draft into a full CardSpec: sorts blocks by the
 * layout recipe's blockOrder, truncates to maxContentBlocks, prepends the
 * image block when imageUrl is non-null and recipe prefers an image, appends
 * the source footer row, sets stable id/revision/theme/ttlMs.
 *
 * Pure and synchronous — exhaustively unit-testable.
 */
import { createHash } from 'node:crypto';
import type { CardSpec, CardBlock, CardTheme } from '@stash/card-spec';
import { parseCardSpec } from '@stash/card-spec';
import type { ValidationResult } from '@stash/card-spec';
import { resolveAccentTheme, LAYOUT_RECIPES, ACCENTS } from '@stash/card-core';
import type { GeneratedDraft } from './draft-schema.js';
import type { GroundingCandidate } from './grounding.js';

export interface AssembleContext {
  utterance: string;
  candidates: GroundingCandidate[];
  /** Already proxied + verified image URL, or null. */
  imageUrl: string | null;
  /** From UserSettings. */
  autoDismissMs: number;
}

function normalizedUtterance(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function stableId(utterance: string): string {
  const hash = createHash('sha256').update(normalizedUtterance(utterance)).digest('hex');
  return 'gen_' + hash.slice(0, 12);
}

function stableRevision(title: string, blocks: CardBlock[]): number {
  const hash = createHash('sha256')
    .update(JSON.stringify({ title, blocks }))
    .digest('hex');
  return parseInt(hash.slice(0, 6), 16) % 1_000_000;
}

export function assembleCardSpec(draft: GeneratedDraft, ctx: AssembleContext): ValidationResult<CardSpec> {
  const recipe = LAYOUT_RECIPES[draft.layout];
  const accentTheme = resolveAccentTheme(draft.accent);

  // Sort content blocks by the layout recipe's blockOrder preference
  const blockOrderMap = new Map<string, number>();
  recipe.blockOrder.forEach((kind, i) => blockOrderMap.set(kind, i));

  const contentBlocks = [...draft.blocks].sort(
    (a, b) => (blockOrderMap.get(a.kind) ?? 99) - (blockOrderMap.get(b.kind) ?? 99),
  );

  // Truncate to maxContentBlocks
  const truncated = contentBlocks.slice(0, recipe.maxContentBlocks);

  // Prepend image block when applicable
  const finalBlocks: CardBlock[] = [];
  if (ctx.imageUrl && recipe.preferImage) {
    finalBlocks.push({ kind: 'image', url: ctx.imageUrl });
  }
  finalBlocks.push(...truncated);

  // Append source footer row
  const sourceInfo = getSourceInfo(draft, ctx.candidates);
  finalBlocks.push({
    kind: 'status_list',
    rows: [{ text: sourceInfo, state: 'info' }],
  });

  const ttlMs = clamp(ctx.autoDismissMs, 1000, 120000);

  const spec = {
    v: 1 as const,
    id: stableId(ctx.utterance),
    revision: stableRevision(draft.title, finalBlocks),
    title: draft.title,
    subtitle: draft.subtitle,
    blocks: finalBlocks,
    theme: accentTheme as Partial<CardTheme>,
    ttlMs,
  };

  return parseCardSpec(spec);
}

function getSourceInfo(draft: GeneratedDraft, candidates: GroundingCandidate[]): string {
  if (draft.sourceIndex !== null && candidates[draft.sourceIndex]) {
    return `Source: Wikipedia · ${candidates[draft.sourceIndex].title}`;
  }
  return 'Unverified · AI-generated';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
