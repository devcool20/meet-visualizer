/**
 * React auth context wrapping `src/lib/auth.ts`'s `AuthClient`.
 *
 * Exposes `useAuth()` for consumers and `ProtectedRoute` for gating
 * `/dashboard/*`, `/rehearse`, `/welcome` behind a session. Kept separate
 * from `src/lib/auth.ts` (pure, framework-agnostic) so the state machine
 * around "loading vs signed-in vs signed-out" is unit-testable without
 * mounting a router.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getAuthClient, type AuthSession } from '@/lib/auth';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const client = getAuthClient();
    let cancelled = false;
    client.getSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setStatus(s ? 'signed-in' : 'signed-out');
    });
    const unsubscribe = client.onChange((s) => {
      if (cancelled) return;
      setSession(s);
      setStatus(s ? 'signed-in' : 'signed-out');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      signInWithGoogle: () => getAuthClient().signInWithGoogle(),
      signOut: () => getAuthClient().signOut(),
      getAccessToken: async () => (await getAuthClient().getSession())?.accessToken ?? null,
    }),
    [status, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/**
 * Gates a route behind a signed-in session. Redirects to `/signup`,
 * preserving the attempted location in router state so sign-in can return
 * the user to where they meant to go.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null;
  }
  if (status === 'signed-out') {
    return <Navigate to="/signup" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
