/**
 * Outage classification.
 *
 * This module decides what a person is told when a meeting will not start, and
 * the three cases have completely different remedies:
 *
 *  - the engine is running an older build  -> redeploy
 *  - nothing is answering                -> start the engine / check the URL
 *  - the engine is fine, the socket is not -> check the network
 *
 * Telling someone to "try again in a moment" for a 404 — which is what an
 * unclassified failure produced — is the worst possible answer, because no
 * amount of retrying can ever fix a missing route.
 *
 * `fetch` is stubbed rather than mocked at module level, so the real URL
 * construction is exercised: getting the probe path wrong would silently make
 * every deployment look outdated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setTestEnv } from '@/lib/env';
import { diagnoseMeetingOutage, supportsMeetings, MeetingUnavailableError } from './meeting-url';

const ENGINE = 'https://engine.example';
const ORIGIN = 'https://stash.live';

/** Records every request so a test can assert on what was actually asked. */
let requested: string[] = [];

function stubFetch(handler: (url: string) => { status: number; body?: string }) {
  requested = [];
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const { status, body = '' } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body || 'null'),
    } as unknown as Response;
  });
}

beforeEach(() => {
  __setTestEnv({ VITE_STASH_API_URL: ENGINE, VITE_STASH_MOCK: '0' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setTestEnv(null);
});

describe('supportsMeetings', () => {
  it('is true when the probe is rejected as a malformed code', async () => {
    // A current engine has the route, so it parses it and answers 400.
    vi.stubGlobal('fetch', stubFetch(() => ({ status: 400, body: '{"code":"invalid_code"}' })));
    expect(await supportsMeetings()).toBe(true);
    expect(requested[0]).toBe(`${ENGINE}/api/meeting/rooms/probe`);
  });

  it('is false when the route does not exist', async () => {
    // An older deploy answers 404 because it never had the route.
    vi.stubGlobal('fetch', stubFetch(() => ({ status: 404, body: 'Cannot GET' })));
    expect(await supportsMeetings()).toBe(false);
  });

  it('is false when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    expect(await supportsMeetings()).toBe(false);
  });

  it('is false when a gateway sits in front of a sleeping engine', async () => {
    // Render returns 502 while a free instance spins up. That is not evidence
    // the engine is outdated, but it is not evidence it works either, so the
    // caller goes and probes /health for the real answer.
    for (const status of [502, 503]) {
      vi.stubGlobal('fetch', stubFetch(() => ({ status })));
      expect(await supportsMeetings()).toBe(false);
    }
  });

  it('is false when no engine URL is configured at all', async () => {
    __setTestEnv({ VITE_STASH_MOCK: '0' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // In production an unset VITE_STASH_API_URL means same-origin, which has
    // no meeting routes either.
    expect(await supportsMeetings()).toBe(false);
  });
});

describe('diagnoseMeetingOutage', () => {
  it('blames an outdated deploy when the engine is healthy but has no routes', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch((url) =>
        // The probe 404s; /health is fine. That combination is the signature
        // of a build that predates the meeting platform.
        url.endsWith('/health') ? { status: 200, body: '{"status":"ok"}' } : { status: 404, body: 'Cannot GET' },
      ),
    );
    const outage = await diagnoseMeetingOutage();
    expect(outage).toBeInstanceOf(MeetingUnavailableError);
    expect(outage.outage).toBe('old-engine');
    // The remedy must lead with the actual action. Retrying is allowed only
    // as an *after* the redeploy — never as the whole answer, because no amount
    // of retrying can conjure a route that is not deployed.
    expect(outage.remedy).toMatch(/redeploy/i);
    expect(outage.remedy).toContain('engine.example');
    expect(outage.remedy.indexOf('Redeploy')).toBeLessThan(outage.remedy.search(/try again/i));
  });

  it('blames connectivity when nothing answers at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const outage = await diagnoseMeetingOutage();
    expect(outage.outage).toBe('unreachable');
    expect(outage.remedy).toMatch(/running|VITE_STASH_API_URL/);
    expect(outage.remedy).not.toMatch(/redeploy/i);
  });

  it('blames the network when the routes exist but the socket still failed', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ status: 400, body: '{"code":"invalid_code"}' })));
    const outage = await diagnoseMeetingOutage();
    // The engine has the routes, so an outdated deploy is ruled out and the
    // remaining explanation is the connection.
    expect(outage.outage).toBe('unreachable');
    expect(outage.remedy).toMatch(/connection/i);
  });

  it('reads like a sentence a person can act on', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => (url.endsWith('/health') ? { status: 200, body: '{}' } : { status: 404 })),
    );
    const outage = await diagnoseMeetingOutage();
    expect(outage.message.endsWith('.')).toBe(true);
    expect(outage.remedy.endsWith('.')).toBe(true);
    void ORIGIN;
  });
});