import { describe, it, expect } from 'vitest';
import {
  maskKey,
  looksLikeKeyFor,
  aiErrorCopy,
  AI_ERROR_COPY,
} from './ai-provider';

describe('maskKey', () => {
  it('shows only the last 4 characters', () => {
    expect(maskKey('AIzaSyDeadBeef1234a91f')).toBe('••••a91f');
  });

  it('returns "••••" for a 3-char key', () => {
    expect(maskKey('abc')).toBe('••••abc');
  });

  it('handles an empty string', () => {
    expect(maskKey('')).toBe('');
  });

  it('never leaks more than the last 4 chars', () => {
    const masked = maskKey('sk-0123456789abcdef');
    expect(masked).toBe('••••cdef');
    expect(masked).not.toContain('sk-');
  });
});

describe('looksLikeKeyFor', () => {
  it('detects Gemini keys starting with AIza', () => {
    expect(looksLikeKeyFor('gemini', 'AIzaSyD...')).toBe(true);
  });

  it('detects OpenAI keys starting with sk-', () => {
    expect(looksLikeKeyFor('openai', 'sk-proj-abc123')).toBe(true);
  });

  it('detects Anthropic keys starting with sk-ant-', () => {
    expect(looksLikeKeyFor('anthropic', 'sk-ant-abc123')).toBe(true);
  });

  it('rejects a Gemini key typed into the OpenAI field', () => {
    expect(looksLikeKeyFor('openai', 'AIzaSyD...')).toBe(false);
  });

  it('rejects a key that matches no prefix', () => {
    expect(looksLikeKeyFor('gemini', 'some-random-key')).toBe(false);
  });
});

describe('aiErrorCopy', () => {
  it('provides copy for every declared error code', () => {
    const codes = Object.keys(AI_ERROR_COPY);
    expect(codes.sort()).toEqual([
      'internal',
      'invalid_key',
      'no_provider',
      'provider_unreachable',
      'rate_limited',
      'unsafe_content',
      'unsupported_provider',
    ]);
  });

  it('returns the specific copy for invalid_key', () => {
    const msg = aiErrorCopy('invalid_key');
    expect(msg).toContain('rejected by the provider');
  });

  it('falls back to generic for unknown codes', () => {
    const msg = aiErrorCopy('some_unknown_code');
    expect(msg).toBe('An unexpected error occurred. Please try again.');
  });
});
