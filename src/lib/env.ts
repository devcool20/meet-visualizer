/**
 * Single place that decides whether the dashboard runs against mock
 * auth/data or the real engine backend.
 *
 * Mock mode is opt-in via `VITE_STASH_MOCK=1` (see `.env.example`).
 *
 * The zero-config default is deliberately asymmetric:
 *  - In dev, an unset Supabase URL still means mock mode, so the app is
 *    demoable with no backend at all.
 *  - In a production build it does NOT. This used to fall through to mock
 *    whenever `VITE_SUPABASE_URL` was missing, which meant a Vercel deploy
 *    without that one variable silently served fixtures instead of live data —
 *    `.env` is gitignored, so `VITE_STASH_MOCK=0` never reached Vercel and
 *    /rehearse rendered mock cards while the engine was healthy. Production
 *    data must never be faked; a missing config should fail loudly instead.
 *
 * Auth is unaffected: `getAuthClient()` independently falls back to
 * `MockAuthClient` when Supabase is unconfigured, so real engine data and the
 * demo session coexist exactly as they do in local dev.
 */

/** A Vite env value: `DEV`/`PROD` are booleans, `VITE_*` are strings. */
type ViteEnv = Record<string, string | boolean | undefined>;

/** Real Vite env, or a test override when one is installed. */
let testEnv: ViteEnv | null = null;

/** @internal — only for tests. Pass `null` to restore the real Vite env. */
export function __setTestEnv(env: ViteEnv | null): void {
  testEnv = env;
}

function env(): ViteEnv {
  if (testEnv !== null) return testEnv;
  return (import.meta as unknown as { env?: ViteEnv }).env ?? {};
}

/** Reads a `VITE_*` value as a non-empty string, or undefined. */
function str(e: ViteEnv, key: string): string | undefined {
  const v = e[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function isMockMode(): boolean {
  const e = env();
  const flag = e.VITE_STASH_MOCK;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  if (e.DEV) return !str(e, 'VITE_SUPABASE_URL');
  return false;
}

/** Base URL for the engine's REST API. Empty string = same-origin. */
export function apiBaseUrl(): string {
  const e = env();
  return str(e, 'VITE_STASH_API_URL') ?? (e.DEV ? 'http://localhost:5000' : '');
}

export function supabaseUrl(): string | undefined {
  return str(env(), 'VITE_SUPABASE_URL');
}

export function supabaseAnonKey(): string | undefined {
  return str(env(), 'VITE_SUPABASE_ANON_KEY');
}

/** The expected product origin from VITE_STASH_PRODUCT_ORIGIN or a default. */
export function expectedProductOrigin(): string {
  return str(env(), 'VITE_STASH_PRODUCT_ORIGIN') ?? 'https://meet-visualizer.vercel.app';
}

/** The engine origin derived from VITE_STASH_API_URL, for diagnostics. */
export function engineOrigin(): string {
  const base = apiBaseUrl();
  if (!base) return '';
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}