/**
 * `/setup/extension` — step 2 of 5 (plan §5.4).
 *
 * Detects an absent extension, offers both install paths (Web Store when
 * configured, load-unpacked otherwise), polls for presence, pairs silently.
 * Includes origin-mismatch and service-unreachable diagnostics.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import {
  probeExtensionPresence,
  resolveExtensionId,
  extensionIdSource,
  setUserExtensionId,
  clearUserExtensionId,
  extensionSourceMode,
  chromeWebStoreUrl,
  extensionZipUrl,
  expectedProductOrigin,
  engineOrigin,
  isProductOrigin,
} from '@/lib/extension';
import { saveSetupStep } from '@/lib/setup';
import { useExtensionPairing } from '@/app/hooks/useExtensionPairing';
import { OnboardingShell } from './OnboardingShell';

type PageState =
  | { phase: 'origin-mismatch'; actual: string; expected: string }
  | { phase: 'checking' }
  | { phase: 'absent' }
  | { phase: 'pairing' }
  | { phase: 'paired' }
  | { phase: 'nonce-expired' }
  | { phase: 'error'; message: string }
  | { phase: 'service-unreachable'; origin: string };

export default function InstallExtensionPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const { state: pairingState, probe, pair, retry } = useExtensionPairing();
  const [pageState, setPageState] = useState<PageState>({ phase: 'checking' });
  const [advExtId, setAdvExtId] = useState(resolveExtensionId());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check origin first.
  useEffect(() => {
    if (!isProductOrigin()) {
      setPageState({
        phase: 'origin-mismatch',
        actual: window.location.origin,
        expected: expectedProductOrigin(),
      });
      return;
    }
    runInitialCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect pairing state machine onto page state.
  useEffect(() => {
    if (pageState.phase === 'origin-mismatch') return;

    switch (pairingState.phase) {
      case 'idle':
      case 'probing':
        setPageState({ phase: 'checking' });
        break;
      case 'absent':
        setPageState({ phase: 'absent' });
        startPolling();
        break;
      case 'requesting-nonce':
      case 'pairing':
        setPageState({ phase: 'pairing' });
        break;
      case 'paired':
        stopPolling();
        setPageState({ phase: 'paired' });
        break;
      case 'nonce-expired':
        setPageState({ phase: 'nonce-expired' });
        break;
      case 'error':
        if (pairingState.message.toLowerCase().includes('unreachable') ||
            pairingState.message.toLowerCase().includes('cors')) {
          setPageState({ phase: 'service-unreachable', origin: engineOrigin() });
        } else {
          setPageState({ phase: 'error', message: pairingState.message });
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairingState]);

  async function runInitialCheck() {
    setPageState({ phase: 'checking' });
    // First, health check against engine.
    try {
      const api = getApiClient(getAccessToken);
      await api.health();
    } catch {
      setPageState({ phase: 'service-unreachable', origin: engineOrigin() });
      return;
    }
    await probe();
  }

  function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const present = await probeExtensionPresence();
      if (present) {
        stopPolling();
        await pair();
      }
    }, 2000);
    // Stop polling after 2 minutes.
    setTimeout(() => stopPolling(), 120_000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  function handleContinue() {
    saveSetupStep('data');
    navigate('/setup/data');
  }

  function handleSkip() {
    saveSetupStep('data');
    navigate('/setup/data');
  }

  function handleAdvIdSubmit() {
    setUserExtensionId(advExtId);
    // Re-probe with the new ID.
    stopPolling();
    runInitialCheck();
  }

  function handleAdvIdReset() {
    clearUserExtensionId();
    setAdvExtId(resolveExtensionId());
    stopPolling();
    runInitialCheck();
  }

  const extSource = extensionSourceMode();
  const sourceInfo = extensionIdSource() === 'default' ? 'default (development)' : extensionIdSource();

  return (
    <OnboardingShell step={2} totalSteps={5}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Setup your presentation mode
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Step 2 of 5 — Choose your meeting mode. Google Meet Add-on and Web Studio require zero installation.
        </p>
      </div>

      {/* Recommended Zero-Install Option */}
      <div
        className="rounded-2xl p-6 space-y-3 mb-6 text-left"
        style={{
          background: 'rgba(251,133,0,0.06)',
          border: '1px solid rgba(251,133,0,0.3)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#fb8500]">
            ⚡ Recommended (Zero Install)
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fb8500] text-white font-medium">
            New
          </span>
        </div>
        <h3 className="text-sm font-semibold text-[#1A1512]">
          Google Meet Add-on & Web Studio
        </h3>
        <p className="text-xs text-[#5A5550] leading-relaxed">
          Present directly in Google Meet without installing Chrome extensions or browser add-ons. Works in the Side Panel, Main Stage, or Web Studio tab.
        </p>
        <div className="pt-2">
          <Button onClick={handleContinue} className="bg-[#fb8500] hover:bg-[#ea7700] text-white text-xs h-9">
            Continue with Zero-Install →
          </Button>
        </div>
      </div>

      {/* Origin mismatch */}
      {pageState.phase === 'origin-mismatch' && (
        <div
          className="rounded-2xl p-6 space-y-4 mb-6"
          style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(212,24,61,0.2)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#d4183d' }}>
            Wrong origin
          </p>
          <p className="text-sm" style={{ color: '#5A5550' }}>
            This page is running on <strong>{pageState.actual}</strong>, but the extension was built for{' '}
            <strong>{pageState.expected}</strong>. Pairing is locked to one exact origin by the
            extension&apos;s <code>externally_connectable</code> setting.
          </p>
          <p className="text-sm" style={{ color: '#5A5550' }}>
            Use the hosted app at{' '}
            <a href={pageState.expected} target="_blank" rel="noopener noreferrer" className="underline">
              {pageState.expected}
            </a>
            , or edit <code>extension/src/shared/constants.ts</code> (<code>PRODUCT_ORIGIN</code>),
            the three <code>matches</code> arrays in <code>extension/manifest.json</code>, and rebuild.
          </p>
          <Button variant="outline" onClick={handleSkip}>
            Continue anyway (no pairing)
          </Button>
        </div>
      )}

      {/* Checking */}
      {pageState.phase === 'checking' && (
        <p className="text-sm text-center" style={{ color: '#5A5550' }}>
          Looking for the Stash Live extension…
        </p>
      )}

      {/* Service unreachable */}
      {pageState.phase === 'service-unreachable' && (
        <div
          className="rounded-2xl p-6 space-y-4 mb-6"
          style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(212,24,61,0.2)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#d4183d' }}>
            Service unreachable
          </p>
          <p className="text-sm" style={{ color: '#5A5550' }}>
            The Stash Live service at <strong>{pageState.origin}</strong> did not answer. This may be
            a CORS configuration issue — check that the engine&apos;s CORS allowlist includes the
            dashboard origin, or see the deploy guide in /docs.
          </p>
          <Button variant="outline" onClick={runInitialCheck}>
            Retry
          </Button>
          <Button variant="outline" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      )}

      {/* Absent: install panel */}
      {pageState.phase === 'absent' && (
        <div className="space-y-6">
          {/* Path A: Chrome Web Store */}
          <div
            className="rounded-2xl p-6 space-y-3"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#fb8500' }}>
              {extSource === 'webstore' ? 'Add to Chrome' : 'Chrome Web Store'}
            </p>
            {extSource === 'webstore' ? (
              <>
                <p className="text-sm" style={{ color: '#5A5550' }}>
                  Install from the Chrome Web Store, then come back to this tab.
                </p>
                <a href={chromeWebStoreUrl()} target="_blank" rel="noopener noreferrer">
                  <Button>Add to Chrome</Button>
                </a>
              </>
            ) : (
              <p className="text-sm" style={{ color: '#5A5550' }}>
                The Chrome Web Store listing isn&apos;t live yet — install from source below.
              </p>
            )}
          </div>

          {/* Path B: Load unpacked */}
          <div
            className="rounded-2xl p-6 space-y-3"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#1A1512' }}>
              {extSource === 'webstore' ? 'Install from source instead' : 'Install from source'}
            </p>
            {extSource === 'webstore' && (
              <details>
                <summary className="text-sm cursor-pointer" style={{ color: '#5A5550' }}>
                  Show instructions
                </summary>
                <div className="mt-3 space-y-2 text-sm" style={{ color: '#5A5550' }}>
                  <InstallFromSourceSteps />
                </div>
              </details>
            )}
            {extSource !== 'webstore' && (
              <div className="space-y-2 text-sm" style={{ color: '#5A5550' }}>
                <InstallFromSourceSteps />
              </div>
            )}
          </div>

          {/* Advanced extension ID override */}
          <div className="text-center">
            <button
              className="text-xs underline"
              style={{ color: '#5A5550' }}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced: my extension has a different ID'}
            </button>
          </div>

          {showAdvanced && (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
            >
              <p className="text-xs" style={{ color: '#5A5550' }}>
                Current ID: <code>{resolveExtensionId()}</code> ({sourceInfo})
              </p>
              <div className="flex gap-2">
                <Input
                  value={advExtId}
                  onChange={(e) => setAdvExtId(e.target.value)}
                  placeholder="Extension ID"
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAdvIdSubmit}>
                  Apply
                </Button>
              </div>
              <button
                className="text-xs underline"
                style={{ color: '#5A5550' }}
                onClick={handleAdvIdReset}
              >
                Reset to default
              </button>
            </div>
          )}

          <div className="flex justify-center gap-4 pt-2">
            <Button variant="outline" onClick={handleSkip}>
              Skip for now
            </Button>
            <Button onClick={handleContinue}>
              Continue Setup →
            </Button>
          </div>
        </div>
      )}

      {/* Pairing */}
      {pageState.phase === 'pairing' && (
        <p className="text-sm text-center" style={{ color: '#5A5550' }}>
          Pairing this browser…
        </p>
      )}

      {/* Paired */}
      {pageState.phase === 'paired' && (
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(46,125,50,0.1)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#2e7d32' }} />
            <span className="text-sm font-medium" style={{ color: '#2e7d32' }}>
              Extension paired
            </span>
          </div>
          <p className="text-sm" style={{ color: '#5A5550' }}>
            Your browser is now connected to the Stash Live extension.
          </p>
          <Button size="lg" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}

      {/* Nonce expired */}
      {pageState.phase === 'nonce-expired' && (
        <div className="text-center space-y-3">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            The pairing code expired. Try again.
          </p>
          <Button variant="outline" onClick={retry}>
            Retry pairing
          </Button>
        </div>
      )}

      {/* Error */}
      {pageState.phase === 'error' && (
        <div className="text-center space-y-3">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            {pageState.message}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={runInitialCheck}>
              Retry
            </Button>
            <Button variant="outline" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}

function InstallFromSourceSteps() {
  const zipUrl = extensionZipUrl();

  return (
    <>
      {zipUrl && (
        <a href={zipUrl} download>
          <Button variant="outline" size="sm" className="mb-2">
            Download the extension (.zip)
          </Button>
        </a>
      )}
      {!zipUrl && (
        <p>Build the extension from the repo (see <code>/docs</code> for instructions).</p>
      )}
      <ol className="list-decimal list-inside space-y-1">
        <li>
          Copy{' '}
          <button
            className="underline"
            style={{ color: '#fb8500' }}
            onClick={() => navigator.clipboard.writeText('chrome://extensions')}
          >
            chrome://extensions
          </button>{' '}
          and open it in a new tab.
        </li>
        <li>Toggle <strong>Developer mode</strong> (top-right corner).</li>
        <li>Click <strong>Load unpacked</strong> and select the <code>extension/dist</code> folder.</li>
        <li>Come back to this tab — pairing will happen automatically.</li>
      </ol>
      <p className="text-xs" style={{ color: '#5A5550' }}>
        An unpacked build pairs against the development extension ID. This is expected while the
        Web Store listing is in review.
      </p>
    </>
  );
}
