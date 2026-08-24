/**
 * Auth wrapper (plan §4.5 `src/lib/auth.ts`).
 *
 * Two implementations behind one interface:
 *  - `SupabaseAuthClient` — real Google OAuth via `@supabase/supabase-js`.
 *    Supabase's browser client persists the session in `localStorage`, NOT
 *    a cookie — this is *why* the extension pairing flow (see
 *    `src/lib/extension.ts`) uses a nonce handshake instead of
 *    `credentials: 'include'`: the extension has no access to the
 *    dashboard's localStorage.
 *  - `MockAuthClient` — mirrors the engine's `MockAuthProvider` exactly
 *    (`engine/src/auth/*`): a single fake user signed in with the token
 *    `'local-dev-token'`, email `dev@stash.local`. This makes the whole
 *    dashboard demoable with zero Supabase project configured
 *    (`VITE_STASH_MOCK=1`, see `src/lib/env.ts`).
 *
 * Both implementations are exposed through the same `AuthClient` interface
 * so the rest of the app (routes, `AuthProvider`) never branches on mode.
 */
import { createClient } from '@supabase/supabase-js';
import { isMockMode, supabaseAnonKey, supabaseUrl } from './env';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export type AuthChangeListener = (session: AuthSession | null) => void;

export interface AuthClient {
  /** Resolves once, with whatever session (if any) is currently active. */
  getSession(): Promise<AuthSession | null>;
  /** Starts the Google sign-in flow. Real client redirects; mock client resolves immediately. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Fires whenever the session changes (sign-in, sign-out, token refresh). */
  onChange(listener: AuthChangeListener): () => void;
}

const MOCK_STORAGE_KEY = 'stash_mock_session';
/** Same literal token the engine's `MockAuthProvider.addUser` pre-seeds. */
const MOCK_TOKEN = 'local-dev-token';
const MOCK_USER: AuthUser = {
  id: 'local-dev-user',
  email: 'dev@stash.local',
  name: 'Local Dev',
};

/**
 * In-memory + localStorage-persisted mock session so a page reload during
 * onboarding/rehearsal (which the funnel relies on for silent pairing,
 * plan §4.2 step 5) does not sign the demo user back out.
 */
class MockAuthClient implements AuthClient {
  private listeners = new Set<AuthChangeListener>();

  private readSession(): AuthSession | null {
    try {
      const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  }

  private writeSession(session: AuthSession | null): void {
    if (session) {
      window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(MOCK_STORAGE_KEY);
    }
    for (const listener of this.listeners) listener(session);
  }

  async getSession(): Promise<AuthSession | null> {
    return this.readSession();
  }

  async signInWithGoogle(): Promise<void> {
    this.writeSession({ user: MOCK_USER, accessToken: MOCK_TOKEN });
  }

  async signOut(): Promise<void> {
    this.writeSession(null);
  }

  onChange(listener: AuthChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Minimal shape of the `@supabase/supabase-js` client this module depends
 * on, kept narrow so it is easy to fake in tests without importing the real
 * package.
 */
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: SupabaseSessionLike | null } }>;
    signInWithOAuth(args: {
      provider: 'google';
      options?: { redirectTo?: string };
    }): Promise<{ error: { message: string } | null }>;
    signOut(): Promise<{ error: { message: string } | null }>;
    onAuthStateChange(
      callback: (event: string, session: SupabaseSessionLike | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface SupabaseSessionLike {
  access_token: string;
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string; name?: string } };
}

function toAuthSession(session: SupabaseSessionLike | null): AuthSession | null {
  if (!session) return null;
  const name = session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null;
  return {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      name,
    },
  };
}

class SupabaseAuthClient implements AuthClient {
  constructor(private readonly client: SupabaseLike) {}

  async getSession(): Promise<AuthSession | null> {
    const { data } = await this.client.auth.getSession();
    return toAuthSession(data.session);
  }

  async signInWithGoogle(): Promise<void> {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin + '/welcome' : undefined;
    const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  onChange(listener: AuthChangeListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(toAuthSession(session));
    });
    return () => data.subscription.unsubscribe();
  }
}

let cachedClient: AuthClient | null = null;

/**
 * Lazily builds the singleton `AuthClient` for the app. Real Supabase
 * client is constructed on first use (not at module load) so importing
 * this module never throws in mock mode / tests even without
 * `@supabase/supabase-js` env vars configured.
 */
export function getAuthClient(): AuthClient {
  if (cachedClient) return cachedClient;
  if (isMockMode() || !supabaseUrl() || !supabaseAnonKey()) {
    cachedClient = new MockAuthClient();
    return cachedClient;
  }
  const client = createClient(supabaseUrl()!, supabaseAnonKey()!) as unknown as SupabaseLike;
  cachedClient = new SupabaseAuthClient(client);
  return cachedClient;
}

/** Test-only escape hatch to reset the memoized client between tests. */
export function __resetAuthClientForTests(): void {
  cachedClient = null;
}

export { MockAuthClient, SupabaseAuthClient, MOCK_TOKEN, MOCK_USER };
