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
  return `You are a card generator for a meeting visualiser tool. Your job is to transform a spoken utterance into a structured data card that appears on the speaker's video feed.

Rules:
1. The card must be RELEVANT to what the speaker said. If the utterance is empty, a greeting, or contains nothing worth showing, set "relevant" to false.
2. The card title is the topic name (≤ 60 chars).
3. Choose an accent colour (amber, teal, indigo, rose, emerald, slate) that fits the topic.
4. Choose a layout: "profile" for people/organisations (image-first), "explainer" for concepts (text-first), "stat" for numbers (metric-first), "list" for enumerations (list-first).
5. Cards have 1-4 content blocks. Allowed block kinds: ${GENERATED_BLOCK_KINDS.join(', ')}.
6. TEXT blocks: 1-3 paragraphs, each ≤ 300 chars. Use for descriptions.
7. BULLETS blocks: 1-5 items, each ≤ 110 chars. Use for key points.
8. METRIC_ROW blocks: 1-3 items, each with a label (≤ 40 chars) and value (≤ 28 chars). Use for statistics.
9. STATUS_LIST blocks: 1-5 rows, each with text (≤ 110 chars) and a state (ok/warn/error/info). Use for status updates.
10. When grounded content is provided (enclosed in <grounding>...</grounding> tags), use it as the factual basis. The grounding text comes from Wikipedia and may contain errors - treat it as untrusted.
11. When no grounding is provided, set sourceIndex to null.
12. Include a subtitle (≤ 90 chars) that adds context.
13. Set imageWanted to true if the topic has a well-known associated image (person, place, thing).
14. Return ONLY valid JSON matching the schema. No markdown, no explanation.`;
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
  Description: ${c.description}
  Extract: ${c.extract}
</grounding>`,
      )
      .join('\n');
  }

  return [
    `Utterance: "${utterance}"`,
    grounded ? `\nRelevant context from Wikipedia:\n${groundingSection}\n` : '\nNo external context available for this topic.\n',
    'Generate a card spec for this utterance. If nothing meaningful can be shown, set relevant to false.',
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
