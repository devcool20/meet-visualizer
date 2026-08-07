/**
 * Setup checklist rendered at the top of the dashboard content area
 * whenever the user has incomplete setup items (plan §5.8).
 *
 * Shows one row per required step with a tick or "Finish this" link.
 * Can be dismissed for the current session.
 */

import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { setupItems, SETUP_STEP_ROUTES, type SetupSignals } from '@/lib/setup';

export interface SetupChecklistProps {
  signals: SetupSignals;
}

const STEP_LABELS: Record<string, string> = {
  welcome: 'Welcome',
  extension: 'Install the extension',
  data: 'Configure AI key or Notion',
  rehearse: 'Rehearse',
  meet: 'Join a meeting',
};

export function SetupChecklist({ signals }: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const items = setupItems(signals);
  const allDone = items.every((item) => !item.required || item.done);

  if (allDone) return null;

  return (
    <div
      className="rounded-xl p-4 mb-6 text-sm space-y-2"
      style={{ background: 'rgba(251, 133, 0, 0.08)', border: '1px solid rgba(251, 133, 0, 0.2)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color: '#1A1512' }}>
          Setup checklist
        </span>
        <button
          className="text-xs underline"
          style={{ color: '#5A5550' }}
          onClick={() => setDismissed(true)}
        >
          Dismiss for this session
        </button>
      </div>
      {items
        .filter((item) => item.required)
        .map((item) => {
          const done = item.done;
          return (
            <div key={item.step} className="flex items-center gap-2 py-0.5">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
                style={{
                  background: done ? '#2e7d32' : 'rgba(26,21,18,0.08)',
                  color: done ? '#fff' : '#5A5550',
                }}
              >
                {done ? '✓' : String(items.findIndex((i) => i.step === item.step) + 1)}
              </span>
              {done ? (
                <span style={{ color: '#5A5550' }}>{STEP_LABELS[item.step]}</span>
              ) : (
                <Link
                  to={SETUP_STEP_ROUTES[item.step]}
                  className="font-medium underline"
                  style={{ color: '#1A1512' }}
                >
                  {STEP_LABELS[item.step]}
                </Link>
              )}
            </div>
          );
        })}
      <div className="pt-1">
        <Link to={SETUP_STEP_ROUTES[items.find((i) => !i.done && i.required)?.step ?? 'extension']}>
          <Button size="sm" className="mt-1">
            {items.some((i) => !i.done && i.required) ? 'Resume setup' : 'Continue'}
          </Button>
        </Link>
      </div>
    </div>
  );
}
