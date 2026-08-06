/**
 * The extension must reject a malformed inbound ServerMsg/CardSpec BEFORE it
 * ever reaches the render loop that owns the outbound camera (frozen
 * contract note in card-spec/validate.ts, plan §5.2). These tests exercise
 * `@stash/card-spec`'s validators the way the service worker and MAIN-world
 * script actually use them.
 */
import { describe, expect, it } from 'vitest';
import { parseCardSpec, parseServerMsg } from '@stash/card-spec';

describe('parseServerMsg rejects malformed inbound frames', () => {
  it('rejects a completely unknown message shape', () => {
    const result = parseServerMsg({ t: 'not-a-real-type' });
    expect(result.ok).toBe(false);
  });

  it('rejects a "show" frame whose card is missing required fields', () => {
    const result = parseServerMsg({
      t: 'show',
      card: { v: 1, id: 'x' /* missing revision, title, blocks */ },
      matchedPhrase: 'hello',
      score: 0.9,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a card block with an unknown kind', () => {
    const result = parseServerMsg({
      t: 'show',
      card: {
        v: 1,
        id: 'x',
        revision: 1,
        title: 'Test',
        blocks: [{ kind: 'not_a_real_block' }],
      },
      matchedPhrase: 'hello',
      score: 0.9,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an image block whose url is not https', () => {
    const result = parseCardSpec({
      v: 1,
      id: 'x',
      revision: 1,
      title: 'Test',
      blocks: [{ kind: 'image', url: 'http://insecure.example.com/a.png' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a card with zero blocks', () => {
    const result = parseCardSpec({ v: 1, id: 'x', revision: 1, title: 'Test', blocks: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects an "error" frame with an unrecognised error code', () => {
    const result = parseServerMsg({ t: 'error', code: 'made_up_code', message: 'oops' });
    expect(result.ok).toBe(false);
  });

  it('rejects a "hide" frame missing cardId', () => {
    const result = parseServerMsg({ t: 'hide' });
    expect(result.ok).toBe(false);
  });

  it('rejects raw non-object JSON (e.g. a bare number or string)', () => {
    expect(parseServerMsg(42).ok).toBe(false);
    expect(parseServerMsg('hello').ok).toBe(false);
    expect(parseServerMsg(null).ok).toBe(false);
  });

  it('accepts a well-formed "show" frame with a valid card', () => {
    const result = parseServerMsg({
      t: 'show',
      card: {
        v: 1,
        id: 'card-1',
        revision: 1,
        title: 'Revenue',
        blocks: [{ kind: 'metric_row', items: [{ label: 'MRR', value: '$10k' }] }],
      },
      matchedPhrase: 'let’s look at revenue',
      score: 0.91,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a well-formed "pong" frame', () => {
    expect(parseServerMsg({ t: 'pong' }).ok).toBe(true);
  });
});
