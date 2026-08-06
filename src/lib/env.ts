/**
 * Single place that decides whether the dashboard runs against mock
 * auth/data or the real Supabase + engine backend.
 *
 * Mock mode is on when `VITE_STASH_MOCK=1` is set, OR when
 * `VITE_SUPABASE_URL` is unset — i.e. by default, with no configuration at
 * all, the whole dashboard is demoable (task requirement: "your work must
 * be viewable in a browser at the end of this task" with zero live
 * backend). See `.env.example`.
 */
export function isMockMode(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (env.VITE_STASH_MOCK === "1" || env.VITE_STASH_MOCK === "true") return true;
  if (!env.VITE_SUPABASE_URL) return true;
  return false;
}

/** Base URL for the engine's REST API. Empty string = same-origin. */
export function apiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (env.VITE_STASH_API_URL) return env.VITE_STASH_API_URL;
  if (env.DEV) return "http://localhost:5000";
  return "";
}

export function supabaseUrl(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_SUPABASE_URL || undefined;
}

export function supabaseAnonKey(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_SUPABASE_ANON_KEY || undefined;
}
