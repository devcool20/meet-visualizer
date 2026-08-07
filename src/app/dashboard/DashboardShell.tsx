import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { hasChromeRuntime, probeExtensionPresence } from '@/lib/extension';
import { isMockMode } from '@/lib/env';
import { useAuth } from '@/app/auth/AuthContext';
import { useSetupStatus } from '@/app/hooks/useSetupStatus';
import { SetupChecklist } from '@/app/onboarding/SetupChecklist';

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: '/dashboard/cards', label: 'Cards' },
  { to: '/dashboard/integrations', label: 'Integrations' },
  { to: '/rehearse', label: 'Rehearse' },
  { to: '/dashboard/activity', label: 'Activity' },
  { to: '/dashboard/settings', label: 'Settings' },
];

/**
 * Dashboard shell (plan §4.3): sidebar with Cards / Integrations / Rehearse
 * / Activity / Settings, centered wordmark, global extension-status chip,
 * setup checklist banner, and demo mode pill.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const [extensionPresent, setExtensionPresent] = useState<boolean | null>(null);
  const { signals, loading } = useSetupStatus();

  useEffect(() => {
    if (!hasChromeRuntime()) {
      setExtensionPresent(false);
      return;
    }
    let cancelled = false;
    probeExtensionPresence().then((present) => {
      if (!cancelled) setExtensionPresent(present);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex" style={{ background: '#FBF9F6', color: '#1A1512' }}>
      <aside
        className="w-56 shrink-0 flex flex-col py-6 px-4 border-r"
        style={{ borderColor: 'rgba(26,21,18,0.06)' }}
      >
        <div className="flex justify-center items-center gap-2 mb-8">
          <span
            className="text-lg font-medium tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.35rem' }}
          >
            Stash Live
          </span>
          {isMockMode() && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(251,133,0,0.12)', color: '#fb8500' }}
            >
              Demo
            </span>
          )}
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <Link
                key={item.to}
                to={item.to}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? 'rgba(26,21,18,0.06)' : 'transparent',
                  color: active ? '#1A1512' : '#5A5550',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(26,21,18,0.04)', color: '#5A5550' }}
            data-testid="extension-status-chip"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background:
                  extensionPresent === null ? '#5A5550' : extensionPresent ? '#2e7d32' : '#d4183d',
              }}
            />
            {extensionPresent === null && 'Checking extension…'}
            {extensionPresent === true && 'Extension connected'}
            {extensionPresent === false && 'Extension not detected'}
          </div>
          <Link
            to="/dashboard/account"
            className="block px-3 py-2 rounded-lg text-sm text-center"
            style={{ color: '#5A5550' }}
          >
            Account
          </Link>
          <button
            className="w-full text-xs text-center"
            style={{ color: '#5A5550' }}
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8 max-w-5xl mx-auto w-full">
        {!loading && <SetupChecklist signals={signals} />}
        {children}
      </main>
    </div>
  );
}
