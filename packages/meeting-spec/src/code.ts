/**
 * Invite-code generation and normalisation for Stash Live meetings.
 *
 * Codes are Google Meet-shaped: three lowercase groups in a 3-4-4 split
 * (`abc-defg-mnpq`), so they can be read aloud over a phone line, dictated
 * letter by letter, or pasted with the hyphens stripped.
 *
 * The alphabet deliberately omits characters people confuse when hearing them
 * — `0`/`o`, `1`/`i`/`l` — plus the pairs that are indistinguishable in most UI
 * fonts (`u`/`v`, `n`/`m`). Digits are omitted entirely: a code containing `3`
 * is transcribed as "three" far more often than "tre".
 */
export const CODE_GROUP_LENGTHS = [3, 4, 4] as const;

export const CODE_GROUPS = CODE_GROUP_LENGTHS.length;

/** Total characters, excluding hyphens. */
export const CODE_LENGTH = CODE_GROUP_LENGTHS.reduce((a, b) => a + b, 0);

/**
 * The alphabet omits characters people confuse when hearing a code read aloud
 * (`0`/`o`, `1`/`i`/`l`) and one half of each visually-identical pair
 * (`u`/`v`, `n`/`m` — the more common member of each pair is kept). Digits are
 * omitted entirely: a code containing `3` is transcribed as "three" far more
 * often than "tre".
 */
export const CODE_ALPHABET = 'abcdefghjknpqrtuwxyz';

export const CODE_ALPHABET_SIZE = CODE_ALPHABET.length;

const ALPHABET_CLASS = `[${CODE_ALPHABET}]`;

/**
 * Matches a well-formed 3-4-4 code with optional hyphens and any case.
 *
 * Built from `CODE_ALPHABET` rather than written as `[a-z]` so the pattern can
 * never accept a character the alphabet forbids.
 */
export const CODE_PATTERN = new RegExp(
  `^${ALPHABET_CLASS}{3}-?${ALPHABET_CLASS}{4}-?${ALPHABET_CLASS}{4}$`,
);

/** Matches a display-form code (lower case, hyphenated). */
export const DISPLAY_CODE_PATTERN = new RegExp(
  `^${ALPHABET_CLASS}{3}-${ALPHABET_CLASS}{4}-${ALPHABET_CLASS}{4}$`,
);

function groupAt(i: number): number {
  return CODE_GROUP_LENGTHS[i];
}


/**
 * Normalises any user-supplied invite code to the canonical display form.
 *
 * Accepts `ABC-defg-MNPQ`, `abcdefgmnpq`, ` abc defg mnpq `, and full-width
 * unicode dashes. Returns `null` when the input cannot be a valid code, so
 * callers get one unambiguous branch instead of guessing.
 */
export function normalizeCode(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;

  // Lowercase, then strip every dash-like codepoint so a copy-pasted
  // en dash or non-breaking hyphen still resolves to the same room.
  const flat = input
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFF0D\u30FC]/g, '')
    .replace(/-/g, '')
    .replace(/\s/g, '');

  if (flat.length !== CODE_LENGTH) return null;
  for (const ch of flat) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }

  // Re-group as 3-4-4.
  let out = '';
  let cursor = 0;
  for (let g = 0; g < CODE_GROUPS; g++) {
    if (g > 0) out += '-';
    out += flat.slice(cursor, cursor + groupAt(g));
    cursor += groupAt(g);
  }
  return out;
}

/** True when `input` normalises to a valid invite code. */
export function isValidCode(input: string | null | undefined): boolean {
  return normalizeCode(input) !== null;
}

export interface CodeGenerator {
  (): string;
}

/**
 * Builds a code generator over an injectable random source, so tests can be
 * fully deterministic. `random` must return a float in `[0, 1)`; a value
 * outside that range is wrapped rather than trusted, because `Math.floor` of a
 * negative product indexes the alphabet backwards and yields `undefined`.
 */
export function createCodeGenerator(random: () => number = Math.random): CodeGenerator {
  return function nextCode(): string {
    let flat = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const draw = Math.floor(random() * CODE_ALPHABET_SIZE);
      // Positive modulo: JS `%` keeps the sign of the dividend.
      const idx = ((draw % CODE_ALPHABET_SIZE) + CODE_ALPHABET_SIZE) % CODE_ALPHABET_SIZE;
      flat += CODE_ALPHABET[idx];
    }
    return formatCode(flat);
  };
}

/** Regroups a flat 11-character string into the display form. */
export function formatCode(flat: string): string {
  const normalized = flat.toLowerCase().replace(/-/g, '');
  let out = '';
  let cursor = 0;
  for (let g = 0; g < CODE_GROUPS; g++) {
    if (g > 0) out += '-';
    out += normalized.slice(cursor, cursor + groupAt(g));
    cursor += groupAt(g);
  }
  return out;
}

/**
 * A non-negative offset into the code space, used for collision probing.
 *
 * Implemented as base-N addition over the alphabet, carrying from the last
 * character. A base that cannot be normalised is returned unchanged rather than
 * offset: probing is an optimisation, and inventing a code out of garbage would
 * be a worse failure than retrying the same candidate.
 */
export function offsetCode(base: string, offset: number): string {
  const canonical = normalizeCode(base);
  if (canonical === null) return formatCode(base);
  const steps = Math.max(0, Math.floor(offset));
  if (steps === 0) return canonical;

  const digits = canonical.replace(/-/g, '').split('').map((ch) => {
    const idx = CODE_ALPHABET.indexOf(ch);
    // `canonical` is guaranteed alphabet-clean, so this is defensive only.
    return idx === -1 ? 0 : idx;
  });

  let carry = steps;
  for (let i = digits.length - 1; i >= 0 && carry > 0; i--) {
    const next = digits[i] + (carry % CODE_ALPHABET_SIZE);
    digits[i] = next % CODE_ALPHABET_SIZE;
    carry = Math.floor(carry / CODE_ALPHABET_SIZE) + Math.floor(next / CODE_ALPHABET_SIZE);
  }
  // A carry out of the top means the offset wrapped the whole space; the
  // truncated digits are still a valid code, which is all a probe needs.
  return formatCode(digits.map((d) => CODE_ALPHABET[d]).join(''));
}

/** Human-readable placeholder shown in the empty code field. */
export const CODE_PLACEHOLDER = 'abc-defg-mnpq';

/** The share URL for a code on the current origin. */
export function codeToJoinUrl(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/meet/${normalizeCode(code) ?? code}`;
}
