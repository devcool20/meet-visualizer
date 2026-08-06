import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiUser } from '@/lib/api';

/**
 * Account (plan §4.3): profile, sign-out. Billing deferred out of v1 —
 * deliberately no billing UI here.
 */
export default function AccountPage() {
  const { getAccessToken, signOut, session } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getMe().then(setUser);
  }, [getAccessToken]);

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Account
      </h1>
      <div className="space-y-1 text-sm" style={{ color: '#5A5550' }}>
        <p>Name: {user?.name ?? session?.user.name ?? '—'}</p>
        <p>Email: {user?.email ?? session?.user.email}</p>
      </div>
      <Button variant="outline" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  );
}
