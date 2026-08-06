import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Auth boundary (plan §2.2: "Supabase Auth, Google OAuth").
 *
 * Session cookies/tokens from the dashboard's Supabase browser client are
 * verified here via the Supabase service-role client's `auth.getUser(jwt)`.
 * This never touches Postgres RLS — it's independent token verification
 * against Supabase's auth server, which is why it works regardless of the
 * Prisma/RLS caveat in §2.1.
 */
export interface AuthProvider {
  verifyAccessToken(jwt: string): Promise<AuthenticatedUser | null>;
}

export class SupabaseAuthProvider implements AuthProvider {
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey);
  }

  async verifyAccessToken(jwt: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser(jwt);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      name: (data.user.user_metadata?.name as string | undefined) ?? null,
    };
  }
}

/**
 * Local/test auth provider — accepts any non-empty token and maps it to a
 * seeded fake user (STASH_LOCAL=1), or is fed an explicit user map in tests.
 */
export class MockAuthProvider implements AuthProvider {
  constructor(private users: Map<string, AuthenticatedUser> = new Map()) {}

  addUser(token: string, user: AuthenticatedUser): void {
    this.users.set(token, user);
  }

  async verifyAccessToken(jwt: string): Promise<AuthenticatedUser | null> {
    return this.users.get(jwt) ?? null;
  }
}

export function createAuthProvider(): AuthProvider {
  if (config.useMockSupabase) {
    const provider = new MockAuthProvider();
    provider.addUser('local-dev-token', { id: 'local-dev-user', email: 'dev@stash.local', name: 'Local Dev' });
    return provider;
  }
  return new SupabaseAuthProvider(config.supabaseUrl, config.supabaseServiceRoleKey);
}
