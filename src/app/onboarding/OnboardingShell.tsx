import type { ReactNode } from 'react';

/**
 * Shared chrome for onboarding pages (`/welcome`, `/rehearse`, etc.):
 * canvas background, centered column, small step indicator. Mirrors the
 * landing page's design tokens (plan §4.4 — no new UI library, reuse
 * `src/app/components/ui` + the confirmed palette).
 */
export function OnboardingShell({
  children,
  step,
  totalSteps,
}: {
  children: ReactNode;
  step: number;
  totalSteps: number;
}) {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-6 py-10"
      style={{ background: '#FBF9F6', color: '#1A1512' }}
    >
      <div className="w-full max-w-xl flex items-center justify-between mb-10">
        <span
          className="text-lg font-medium tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.35rem' }}
        >
          Stash Live
        </span>
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step - 1 ? '1.5rem' : '0.6rem',
                background: i <= step - 1 ? '#fb8500' : 'rgba(26,21,18,0.12)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
