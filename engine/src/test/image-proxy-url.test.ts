import { describe, it, expect } from 'vitest';
import { isAllowedImageHost, signImageUrl, verifyImageToken } from '../images/proxy-url.js';

/**
 * The SSRF boundary for proxied card images.
 *
 * `thumb.wikimedia.org` used to be missing from the allow-list, and Wikipedia's
 * REST summary API serves `thumbnail.source` from that CDN. Grounding therefore
 * rejected the thumbnail for essentially every real person or place, left
 * `imageUrl` null, and no card was ever assembled with an image block - the
 * failure was silent because a rejected host is indistinguishable from a page
 * that simply has no photo.
 */
describe('image host allow-list', () => {
  it('accepts the thumbnail CDN Wikipedia actually serves images from', () => {
    // Shape taken verbatim from a live /api/rest_v1/page/summary response.
    expect(
      isAllowedImageHost(
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Ranbir_Kapoor.jpg/330px-Ranbir_Kapoor.jpg',
      ),
    ).toBe(true);
  });

  it('still accepts the original-upload host', () => {
    expect(
      isAllowedImageHost(
        'https://upload.wikimedia.org/wikipedia/commons/4/48/Ranbir_at_LFW16.jpg',
      ),
    ).toBe(true);
  });

  it('keeps rejecting non-Wikimedia hosts (SSRF boundary intact)', () => {
    expect(isAllowedImageHost('https://example.com/cat.png')).toBe(false);
    expect(isAllowedImageHost('https://evil.com/wikipedia/commons/x.png')).toBe(false);
    expect(isAllowedImageHost('https://upload.wikimedia.org.evil.com/x.png')).toBe(false);
    expect(isAllowedImageHost('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('rejects malformed URLs rather than throwing', () => {
    expect(isAllowedImageHost('not-a-url')).toBe(false);
    expect(isAllowedImageHost('')).toBe(false);
  });
});

describe('signed image proxy URLs', () => {
  it('round-trips a thumb.wikimedia.org URL through sign/verify', () => {
    const upstream =
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Charlie_Chaplin_portrait.jpg/330px-x.jpg';
    const upstream2 = verifyImageToken(signImageUrl(upstream));
    expect(upstream2).toBe(upstream);
  });

  it('refuses a token minted for a host that is not on the allow-list', () => {
    const token = signImageUrl('https://example.com/not-allowed.png');
    expect(verifyImageToken(token)).toBeNull();
  });

  it('returns null for a tampered token', () => {
    expect(verifyImageToken('garbage')).toBeNull();
    expect(verifyImageToken(Buffer.from('123:deadbeef:https://example.com/x').toString('base64url'))).toBeNull();
  });
});