/**
 * Prompt builders (plan §3.4 / §3.6).
 *
 * All prompts are constructed here, not inlined in orchestrator code.
 * System prompt instructs the model about the task and constraints.
 * User prompt includes the utterance and (optionally) grounded content.
 * Repair prompt is used when the model's first response fails validation.
 */
import type { GroundingCandidate } from './grounding.js';
import { GENERATED_BLOCK_KINDS } from './draft-schema.js';

export function buildSystemPrompt(): string {
  return `You are a card generator for Stash Live, an ambient broadcast presenter overlay suite. Your job is to transform spoken meeting utterances into structured, compact high-luminance glassmorphic data cards that composite into the presenter's video stream.

Rules:
1. Always set "relevant" to true whenever a topic, entity, person, product, metric, or question is spoken. Only set "relevant" to false for pure silence or unintelligible filler.
2. The card title is the entity / topic name (≤ 60 chars).
3. Choose an accent colour (amber, teal, indigo, rose, emerald, slate) that fits the topic.
4. Choose layout:
   - "profile" for people, organisations, places, media titles, or items with portrait/photos (image-first).
   - "explainer" for technical concepts, workflows, or overviews (text-first).
   - "stat" for metrics, finances, or benchmarks (metric-first).
   - "list" for comparisons, rosters, or feature lists (list-first).
5. Cards have 1-3 concise content blocks. Keep texts brief and punchy.
6. TEXT blocks: 1-2 concise paragraphs, each ≤ 180 chars. Use for quick summary.
7. BULLETS blocks: 2-4 items, each ≤ 90 chars. Use for key highlights.
8. METRIC_ROW blocks: 1-3 items, each with a label (≤ 30 chars) and value (≤ 20 chars).
9. STATUS_LIST blocks: 1-4 rows with text (≤ 90 chars) and state (ok/warn/error/info).
10. When grounded context is provided (enclosed in <grounding>...</grounding> tags from Google Drive docs or encyclopedia), use it as the factual foundation.
11. If grounded context matches the topic, set sourceIndex to its index (0, 1, etc.).
12. Include a concise subtitle (≤ 70 chars) describing what/who it is.
13. Set imageWanted to true ONLY for the following entity categories:
    - Person (e.g. actors, historical figures, founders, athletes, leaders)
    - Place / Location (e.g. cities, monuments, countries, landmarks)
    - Historical Event (e.g. missions, battles, revolutions, launches)
    - Individual Physical Item / Device / Vehicle (e.g. iPhone, Mars Rover, sports car, telescope)
    For abstract concepts, metrics, financial stats, generic workflows, or company overviews without specific physical items, set imageWanted to false.
14. Return ONLY valid JSON matching the schema. No markdown, no conversational commentary.`;
}

export function buildUserPrompt(
  utterance: string,
  candidates: GroundingCandidate[],
): string {
  const grounded = candidates.length > 0;
  let groundingSection = '';

  if (grounded) {
    groundingSection = candidates
      .map(
        (c, i) =>
          `<grounding index="${i}">
  Title: ${c.title}
  Source: ${c.description}
  Extract: ${c.extract}
</grounding>`,
      )
      .join('\n');
  }

  return [
    `Utterance: "${utterance}"`,
    grounded ? `\nRelevant grounded workspace documents & knowledge:\n${groundingSection}\n` : '\nNo external context available for this topic.\n',
    'Generate a card spec for this utterance. Set relevant to true and synthesize a concise, structured card.',
    grounded
      ? 'If the utterance relates to one of the grounded topics, set sourceIndex to its index (starting from 0). Otherwise set it to null.'
      : 'Since no external context is available, set sourceIndex to null.',
  ].join('\n');
}

export function buildRepairPrompt(previousRaw: string, error: string): string {
  return [
    'Your previous response failed validation.',
    '',
    `Previous output: ${previousRaw.slice(0, 1000)}`,
    `Validation error: ${error.slice(0, 500)}`,
    '',
    'Please fix the output to match the JSON schema exactly. Return ONLY valid JSON.',
    'Ensure all required fields are present, string lengths are within limits, and the accent/layout values are from the allowed enums.',
  ].join('\n');
}
