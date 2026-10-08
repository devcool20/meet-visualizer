import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_ALPHABET_SIZE,
  CODE_GROUP_LENGTHS,
  CODE_LENGTH,
  CODE_PATTERN,
  DISPLAY_CODE_PATTERN,
  codeToJoinUrl,
  createCodeGenerator,
  formatCode,
  isValidCode,
  normalizeCode,
  offsetCode,
} from '../src/code.js';

/**
 * A canonical, alphabet-clean 3-4-4 code, derived from the alphabet so this
 * suite cannot drift away from a change to it. Hard-coding a literal here is
 * exactly how the suite ended up asserting on codes the product would reject.
 */
function canonicalCode(offset = 0): string {
  const n = CODE_ALPHABET_SIZE;
  const at = (i: number) => CODE_ALPHABET[(i + offset) % n];
  return formatCode(
    [
      [0, 1, 2], // 3
      [4, 5, 6, 7], // 4
      [9, 10, 11, 12], // 4
    ]
      .flat()
      .map(at)
      .join(''),
  );
}

const CODE = canonicalCode();
const FLAT = CODE.replace(/-/g, '');

/** Replaces the character at `index` of the flat code. */
function withChar(index: number, ch: string): string {
  const chars = FLAT.split('');
  chars[index] = ch;
  return formatCode(chars.join(''));
}

describe('normalizeCode', () => {
  it('accepts the canonical display form', () => {
    expect(normalizeCode(CODE)).toBe(CODE);
  });

  it('regroups an unhyphenated code', () => {
    expect(normalizeCode(FLAT)).toBe(CODE);
  });

  it('lowercases and tolerates surrounding and inner whitespace', () => {
    const spaced = CODE.replace(/-/g, ' ');
    expect(normalizeCode(`  ${spaced.toUpperCase()}  `)).toBe(CODE);
  });

  it('accepts unicode dashes from a copy-paste', () => {
    expect(normalizeCode(CODE.replace(/-/g, '–'))).toBe(CODE);
    expect(normalizeCode(CODE.replace(/-/g, '—'))).toBe(CODE);
  });

  it('rejects the wrong length', () => {
    expect(normalizeCode(FLAT.slice(0, -1))).toBeNull();
    expect(normalizeCode(`${FLAT}z`)).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });

  it('rejects digits entirely — the alphabet has none', () => {
    expect(normalizeCode(withChar(1, '3'))).toBeNull();
  });

  it('rejects every character outside the alphabet, at every position', () => {
    // Every position has to be validated, not just the first.
    for (const ch of 'oiulxyz01234567890') {
      for (const index of [0, 3, 7, 10]) {
        if (CODE_ALPHABET.includes(ch)) continue;
        expect(normalizeCode(withChar(index, ch)), `${ch} at ${index}`).toBeNull();
      }
    }
  });

  it('omits both halves of every homophone pair', () => {
    // 0/o and 1/i/l are the classic mishearings, so neither side is in the set.
    for (const ch of '0o1il') {
      expect(CODE_ALPHABET.includes(ch)).toBe(false);
    }
  });

  it('keeps exactly one half of each visually-identical pair', () => {
    // u/v and n/m are indistinguishable in most UI fonts at code size, so a
    // spoken code must not depend on telling them apart.
    for (const [a, b] of [
      ['u', 'v'],
      ['n', 'm'],
    ]) {
      expect(CODE_ALPHABET.includes(a) !== CODE_ALPHABET.includes(b)).toBe(true);
    }
  });

  it('rejects non-strings', () => {
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
    expect(normalizeCode(42 as unknown as string)).toBeNull();
  });

  it('only ever emits characters from the alphabet', () => {
    const next = createCodeGenerator();
    for (let i = 0; i < 500; i++) {
      for (const ch of next().replace(/-/g, '')) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it('is idempotent', () => {
    const once = normalizeCode(`  ${CODE.replace(/-/g, ' ').toUpperCase()}  `);
    expect(once).toBe(CODE);
    expect(normalizeCode(once)).toBe(once);
  });
});

describe('the regexes', () => {
  it('are built from the alphabet, so they cannot accept a forbidden character', () => {
    // A hand-written `[a-z]` pattern would happily pass `i`; these must not.
    const forbidden = withChar(10, 'i');
    expect(CODE_PATTERN.test(forbidden)).toBe(false);
    expect(DISPLAY_CODE_PATTERN.test(forbidden)).toBe(false);
    expect(CODE_PATTERN.test(CODE)).toBe(true);
    expect(DISPLAY_CODE_PATTERN.test(CODE)).toBe(true);
    expect(CODE_PATTERN.test(FLAT)).toBe(true);
  });

  it('exposes the group lengths it was built from', () => {
    expect(CODE_GROUP_LENGTHS.reduce((a, b) => a + b, 0)).toBe(CODE_LENGTH);
    expect(FLAT).toHaveLength(CODE_LENGTH);
  });
});

describe('createCodeGenerator', () => {
  it('produces display-form codes of the right shape', () => {
    const next = createCodeGenerator();
    for (let i = 0; i < 200; i++) {
      const code = next();
      expect(DISPLAY_CODE_PATTERN.test(code)).toBe(true);
      expect(CODE_PATTERN.test(code)).toBe(true);
      expect(code.replace(/-/g, '')).toHaveLength(CODE_LENGTH);
    }
  });

  it('is deterministic for a deterministic random source', () => {
    // A stub pinned to 0 selects the first alphabet character at every
    // position, which also proves the generator does not read past the end.
    expect(createCodeGenerator(() => 0)()).toBe('aaa-aaaa-aaaa');
  });

  it('survives a random source outside [0, 1)', () => {
    // `Math.floor` of a negative product indexes backwards and yields
    // `undefined`, so the generator has to wrap rather than trust its input.
    for (const bad of [0.999999, 1, 2, -0.5, -1]) {
      expect(isValidCode(createCodeGenerator(() => bad)()), String(bad)).toBe(true);
    }
  });

  it('does not collide across a large sample', () => {
    const next = createCodeGenerator();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(next());
    expect(seen.size).toBe(2000);
  });
});

describe('offsetCode', () => {
  it('produces a different but valid code', () => {
    const offset = offsetCode(CODE, 1);
    expect(offset).not.toBe(CODE);
    expect(isValidCode(offset)).toBe(true);
  });

  it('is a no-op for offset zero', () => {
    expect(offsetCode(CODE, 0)).toBe(CODE);
  });

  it('never leaves the alphabet, however far it is pushed', () => {
    let code = CODE;
    for (let i = 0; i < 500; i++) code = offsetCode(code, 37);
    expect(isValidCode(code)).toBe(true);
  });

  it('clamps a negative offset rather than producing garbage', () => {
    expect(offsetCode(CODE, -5)).toBe(CODE);
    expect(isValidCode(offsetCode(CODE, -5))).toBe(true);
  });

  it('returns the base unchanged when the base is not a code', () => {
    // Probing is an optimisation; inventing a code out of garbage would be a
    // worse failure than retrying the same candidate.
    expect(offsetCode('not-a-code', 3)).toBe(formatCode('notacode'));
  });

  it('walks sequentially without repeating', () => {
    const seen = new Set<string>();
    let code = CODE;
    for (let i = 0; i < 200; i++) {
      seen.add(code);
      code = offsetCode(code, 1);
    }
    expect(seen.size).toBe(200);
  });

  it('wraps rather than walking off the end of the space', () => {
    expect(isValidCode(offsetCode(CODE, CODE_ALPHABET_SIZE ** CODE_LENGTH))).toBe(true);
  });
});

describe('formatCode', () => {
  it('groups into 3-4-4', () => {
    expect(formatCode(FLAT)).toBe(CODE);
    expect(formatCode(FLAT.toUpperCase())).toBe(CODE);
  });
});

describe('codeToJoinUrl', () => {
  it('builds a shareable path', () => {
    expect(codeToJoinUrl(CODE, 'https://stash.live')).toBe(`https://stash.live/meet/${CODE}`);
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(codeToJoinUrl(CODE, 'https://stash.live/')).toBe(`https://stash.live/meet/${CODE}`);
  });

  it('normalises a code the user pasted with the hyphens stripped', () => {
    expect(codeToJoinUrl(FLAT.toUpperCase(), 'https://stash.live')).toBe(`https://stash.live/meet/${CODE}`);
  });
});