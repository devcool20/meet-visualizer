/**
 * `/meet` — step 5 of 5.
 *
 * Final meeting launch pad: Launch directly via Google Meet Add-on (zero install)
 * or Web Studio Tab Share, complete pre-flight checklist, and enter dashboard.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import { hasRehearsed, saveSetupStep } from '@/lib/setup';
import { OnboardingShell } from './OnboardingShell';

interface ChecklistItem {
  label: string;
  done: boolean;
}

export default function MeetStepPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { label: 'AI Key / Workspace configured', done: false },
    { label: 'Rehearsal studio verified', done: false },
    { label: 'Google Meet Add-on / Studio ready', done: true },
  ]);

  useEffect(() => {
    async function run() {
      const api = getApiClient(getAccessToken);
      let aiAvailable = false;
      try {
        const aiState = await api.getAiProvider();
        aiAvailable = aiState.source !== 'none';
      } catch {
        // Ignore
      }
      const rehearsed = hasRehearsed();

      setChecklist([
        { label: 'AI Key / Workspace configured', done: aiAvailable },
        { label: 'Rehearsal studio verified', done: rehearsed },
        { label: 'Google Meet Add-on / Studio ready', done: true },
      ]);
    }
    run();
  }, [getAccessToken]);

  function handleDone() {
    saveSetupStep('meet');
    navigate('/dashboard');
  }

  function handleOpenMeet() {
    window.open('https://meet.google.com/new', '_blank', 'noopener,noreferrer');
  }

  return (
    <OnboardingShell step={5} totalSteps={5}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          You&apos;re ready for live calls.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Step 5 of 5 — Pick how you want to present in Google Meet (Zero install required).
        </p>
      </div>

      {/* Two Presentation Choices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Choice A: In-Meeting Google Meet Add-on */}
        <div
          className="rounded-2xl p-5 text-left flex flex-col justify-between"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,21,18,0.08)' }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🎛️</span>
              <h2 className="text-sm font-semibold text-[#1A1512]">Google Meet Add-on</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fb8500]/15 text-[#fb8500] font-mono">
                RECOMMENDED
              </span>
            </div>
            <p className="text-xs text-[#5A5550] leading-relaxed">
              Runs directly inside Google Meet&apos;s <strong>Side Panel</strong> and can expand to the <strong>Main Stage</strong> for all attendees.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between">
            <Link to="/meet-addon" target="_blank">
              <Button size="sm" className="bg-[#fb8500] hover:bg-[#ea7700] text-white text-xs h-8">
                Open Add-on View ↗
              </Button>
            </Link>
          </div>
        </div>

        {/* Choice B: Web Studio Broadcaster */}
        <div
          className="rounded-2xl p-5 text-left flex flex-col justify-between"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,21,18,0.08)' }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📹</span>
              <h2 className="text-sm font-semibold text-[#1A1512]">Web Studio Broadcaster</h2>
            </div>
            <p className="text-xs text-[#5A5550] leading-relaxed">
              Full presenter camera feed with dynamic over-the-shoulder cards. Share this tab directly in Google Meet (1080p 60fps).
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between">
            <Link to="/studio" target="_blank">
              <Button size="sm" variant="outline" className="text-xs h-8 border-[#1A1512]/20">
                Launch Studio ↗
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Checklist Status */}
      <div
        className="rounded-2xl p-4 mb-6 text-left"
        style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[#5A5550]">
          Pre-flight Status
        </h2>
        <div className="space-y-1.5">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] font-bold"
                style={{
                  background: item.done ? '#2e7d32' : 'rgba(26,21,18,0.08)',
                  color: item.done ? '#fff' : '#5A5550',
                }}
              >
                {item.done ? '✓' : '•'}
              </span>
              <span style={{ color: item.done ? '#1A1512' : '#5A5550' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={handleOpenMeet}>
          Open Google Meet
        </Button>
        <Button onClick={handleDone} className="bg-[#1A1512] hover:bg-[#2D2520] text-white">
          Enter Dashboard
        </Button>
      </div>
    </OnboardingShell>
  );
}
