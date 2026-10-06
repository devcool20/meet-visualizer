import { describe, it, expect, afterEach } from 'vitest';
import { isMockMode, apiBaseUrl, __setTestEnv } from './env';

/**
 * Guards the bug that made a Vercel deploy serve fixture cards instead of live
 * ones: mock mode used to be implied by a missing VITE_SUPABASE_URL, and because
 * `.env` is gitignored the `VITE_STASH_MOCK=0` that disables it never reached
 * Vercel. /rehearse rendered mock data while the engine was healthy.
 */
describe('isMockMode', () => {
  afterEach(() => __setTestEnv(null));

  it('never mocks a production build by default, even with no Supabase URL', () => {
    __setTestEnv({ DEV: false, VITE_SUPABASE_URL: undefined, VITE_STASH_MOCK: undefined });
    expect(isMockMode()).toBe(false);
  });

  it('honours an explicit opt-out in production', () => {
    __setTestEnv({ DEV: false, VITE_STASH_MOCK: '0' });
    expect(isMockMode()).toBe(false);
  });

  it('honours an explicit opt-in in production', () => {
    __setTestEnv({
      DEV: false,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_STASH_MOCK: '1',
    });
    expect(isMockMode()).toBe(true);
  });

  it('accepts the string forms of the flag', () => {
    __setTestEnv({ DEV: false, VITE_STASH_MOCK: 'true' });
    expect(isMockMode()).toBe(true);
    __setTestEnv({ DEV: false, VITE_STASH_MOCK: 'false' });
    expect(isMockMode()).toBe(false);
  });

  it('stays demoable in dev when nothing is configured', () => {
    __setTestEnv({ DEV: true, VITE_SUPABASE_URL: undefined, VITE_STASH_MOCK: undefined });
    expect(isMockMode()).toBe(true);
  });

  it('uses the real engine in dev once Supabase is configured', () => {
    __setTestEnv({ DEV: true, VITE_SUPABASE_URL: 'https://example.supabase.co' });
    expect(isMockMode()).toBe(false);
  });
});

describe('apiBaseUrl', () => {
  afterEach(() => __setTestEnv(null));

  it('prefers the configured engine URL', () => {
    __setTestEnv({ DEV: false, VITE_STASH_API_URL: 'https://engine.example.com' });
    expect(apiBaseUrl()).toBe('https://engine.example.com');
  });

  it('points dev at the local engine and production at same-origin', () => {
    __setTestEnv({ DEV: true });
    expect(apiBaseUrl()).toBe('http://localhost:5000');
    __setTestEnv({ DEV: false });
    expect(apiBaseUrl()).toBe('');
  });
});