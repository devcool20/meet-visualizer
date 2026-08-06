/**
 * Text normalization shared by Tier 1 exact matching and Tier 2 embedding
 * cache keys (plan §2.4: "lowercase, strip punctuation, collapse
 * whitespace").
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/digits/space
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}
