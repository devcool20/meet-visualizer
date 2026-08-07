/**
 * `/meet` — step 5 of 5 (plan §5.7).
 *
 * Pre-join checklist, join instructions with camera re-selection guidance,
 * and post-join verification with "I saw it work".
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import { hasChromeRuntime, probeExtensionPresence } from '@/lib/extension';
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
    { label: 'Extension is installed and paired', done: false },
    { label: 'AI key or Notion is configured', done: false },
    { label: 'Rehearsal completed', done: false },
    { label: 'Close any other tab that is already in a Meet call', done: false },
  ]);

  useEffect(() => {
    async function run() {
      const api = getApiClient(getAccessToken);
      let extensionPaired = false;
      if (hasChromeRuntime()) {
        extensionPaired = await probeExtensionPresence();
      }
      let aiAvailable = false;
      try {
        const aiState = await api.getAiProvider();
        aiAvailable = aiState.source !== 'none';
      } catch {
        // Ignore.
      }
      const rehearsed = hasRehearsed();

      setChecklist([
        { label: 'Extension is installed and paired', done: extensionPaired },
        { label: 'AI key or Notion is configured', done: aiAvailable },
        { label: 'Rehearsal completed', done: rehearsed },
        { label: 'Close any other tab that is already in a Meet call', done: false },
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

  const allAutoTicked = checklist.slice(0, 3).every((c) => c.done);

  return (
    <OnboardingShell step={5} totalSteps={5}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          You&apos;re ready.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Step 5 of 5 — One last checklist, then join a real Google Meet.
        </p>
      </div>

      {/* Block 1: Before you join */}
      <div
        className="rounded-2xl p-6 mb-6 text-left"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1512' }}>
          Before you join
        </h2>
        <div className="space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
                style={{
                  background: item.done ? '#2e7d32' : 'rgba(26,21,18,0.08)',
                  color: item.done ? '#fff' : '#5A5550',
                }}
              >
                {item.done ? '✓' : ''}
              </span>
              <span style={{ color: item.done ? '#5A5550' : '#1A1512' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Block 2: Joining (permission-chip mock) */}
      <div
        className="rounded-2xl p-6 mb-6 text-center"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1512' }}>
          Joining
        </h2>
        <p className="text-sm mb-3" style={{ color: '#5A5550' }}>
          When you join, Chrome will ask you to allow camera and microphone access for meet.google.com
          — this is Meet&apos;s own prompt, separate from the one you already granted here.
        </p>
        <div className="flex justify-center">
          <div
            className="rounded-xl shadow-lg p-4 text-left text-sm w-72"
            style={{ background: '#ffffff', border: '1px solid rgba(26,21,18,0.12)' }}
          >
            <p className="font-medium mb-2">meet.google.com wants to</p>
            <p style={{ color: '#5A5550' }}>Use your camera</p>
            <p style={{ color: '#5A5550' }}>Use your microphone</p>
            <div className="flex gap-2 mt-3 justify-end">
              <span className="text-xs px-3 py-1 rounded-full" style={{ color: '#5A5550' }}>
                Block
              </span>
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: '#1a73e8', color: '#fff' }}>
                Allow
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Block 3: Inside the call */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1512' }}>
          Inside the call
        </h2>
        <div className="space-y-2 text-sm" style={{ color: '#5A5550' }}>
          <p>
            There is no separate "Stash Live" camera device. <strong>Keep your normal webcam selected</strong>.
          </p>
          <p>
            Stash Live must be installed <em>before</em> Meet asks for your camera. If you installed
            it while a Meet tab was already open, <strong>reload that tab</strong>.
          </p>
          <p>
            If your self-view looks normal but no card appears, open Meet&apos;s ⋮ → Settings →
            Video and re-pick the same camera; that makes Meet ask for the camera again and Stash
            Live attaches.
          </p>
          <p>
            Hold <strong>Alt+Shift+Space</strong> and say your sentence. Alt+Shift+D dismisses,
            Alt+Shift+S hides the HUD. The HUD is visible only to you.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={handleOpenMeet}>
          Open Google Meet
        </Button>
        <Button onClick={handleDone} disabled={!allAutoTicked}>
          I saw it work
        </Button>
        <Link to="/help#troubleshooting">
          <Button variant="outline">It didn&apos;t work</Button>
        </Link>
      </div>
    </OnboardingShell>
  );
}
