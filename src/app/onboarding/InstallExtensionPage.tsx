/**
 * `/setup/extension` — step 2 of 5 (plan §5.4).
 *
 * Detects an absent extension, offers both install paths (Web Store when
 * configured, load-unpacked otherwise), polls for presence, pairs silently.
 * Includes origin-mismatch and service-unreachable diagnostics.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import { Action, Pill, StatusMessage, Surface, Telemetry } from '@/app/components/primitives';
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
import { StepHeader } from './StepHeader';

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
      <StepHeader
       className="mb-8"
        step="Step two"
        title="Set up your presentation mode"
        description="Choose how you want to present. The Meet add-on and the web studio both need zero installation — the Chrome extension is only for the ambient always-on mode."
      />

      {/* Recommended Zero-Install Option */}
      <Surface tone="brand" className="mb-6 space-y-3 p-6 text-left">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Recommended · zero install</span>
          <Pill tone="brand">New</Pill>
        </div>
        <h3 className="font-serif text-lg font-normal text-foreground">
          Google Meet add-on &amp; web studio
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Present directly in Google Meet without installing a Chrome extension. Works in the side
          panel, the main stage, or the web studio tab.
        </p>
        <div className="pt-2">
          <Button onClick={handleContinue} className="h-9 bg-brand text-xs text-white hover:bg-brand-hover">
            Continue with zero install
          </Button>
        </div>
      </Surface>

      {/* Origin mismatch */}
      {pageState.phase === 'origin-mismatch' && (
        <Surface tone="danger" className="mb-6 space-y-4 p-6 text-left">
          <p className="text-sm font-semibold text-destructive">Wrong origin</p>
          <p className="text-sm text-muted-foreground">
            This page is running on <strong>{pageState.actual}</strong>, but the extension was built for{' '}
            <strong>{pageState.expected}</strong>. Pairing is locked to one exact origin by the
            extension&apos;s <code>externally_connectable</code> setting.
          </p>
          <p className="text-sm text-muted-foreground">
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
        </Surface>
      )}

      {/* Checking */}
      {pageState.phase === 'checking' && (
        <p className="text-sm text-center text-muted-foreground">
          Looking for the Stash Live extension…
        </p>
      )}

      {/* Service unreachable */}
      {pageState.phase === 'service-unreachable' && (
        <Surface tone="danger" className="mb-6 space-y-4 p-6 text-left">
          <p className="text-sm font-semibold text-destructive">Service unreachable</p>
          <p className="text-sm text-muted-foreground">
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
        </Surface>
      )}

      {/* Absent: install panel */}
      {pageState.phase === 'absent' && (
        <div className="space-y-6">
          {/* Path A: Chrome Web Store */}
          <Surface className="space-y-3 p-6">
            <p className="text-sm font-semibold text-foreground">
              {extSource === 'webstore' ? 'Add to Chrome' : 'Chrome Web Store'}
            </p>
            {extSource === 'webstore' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Install from the Chrome Web Store, then come back to this tab.
                </p>
                <Action href={chromeWebStoreUrl()} size="sm">
                  Add to Chrome
                </Action>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The Chrome Web Store listing isn&apos;t live yet — install from source below.
              </p>
            )}
          </Surface>

          {/* Path B: Load unpacked */}
          <Surface className="space-y-3 p-6">
            <p className="text-sm font-semibold text-foreground">
              {extSource === 'webstore' ? 'Install from source instead' : 'Install from source'}
            </p>
            {extSource === 'webstore' && (
              <details>
                <summary className="text-sm">Show instructions</summary>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <InstallFromSourceSteps />
                </div>
              </details>
            )}
            {extSource !== 'webstore' && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <InstallFromSourceSteps />
              </div>
            )}
          </Surface>

          {/* Advanced extension ID override */}
          <div className="text-center">
            <button
              type="button"
             className="text-xs text-muted-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-foreground"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced: my extension has a different ID'}
            </button>
          </div>

          {showAdvanced && (
            <Surface tone="flat" className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                Current ID{" "}
                <Telemetry className="text-foreground">{resolveExtensionId()}</Telemetry> (
                {sourceInfo})
              </p>
              <div className="flex gap-2">
                <Input
                  value={advExtId}
                  onChange={(e) => setAdvExtId(e.target.value)}
                  placeholder="Extension ID"
                  aria-label="Extension ID"
                 className="flex-1"
                />
                <Button size="sm" onClick={handleAdvIdSubmit}>
                  Apply
                </Button>
              </div>
              <button
                type="button"
               className="text-xs text-muted-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-foreground"
                onClick={handleAdvIdReset}
              >
                Reset to default
              </button>
            </Surface>
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
        <p className="text-sm text-center text-muted-foreground">
          Pairing this browser…
        </p>
      )}

      {/* Paired */}
      {pageState.phase === 'paired' && (
        <div className="space-y-4 text-center">
          <Pill tone="success" className="px-3 py-1.5 text-xs">
            <Check className="size-3" strokeWidth={3} aria-hidden />
            Extension paired
          </Pill>
          <p className="text-sm text-muted-foreground">
            Your browser is now connected to the Stash Live extension.
          </p>
          <Button size="lg" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}

      {/* Nonce expired */}
      {pageState.phase === 'nonce-expired' && (
        <div className="space-y-3 text-center">
          <StatusMessage tone="danger">The pairing code expired. Try again.</StatusMessage>
          <Button variant="outline" onClick={retry}>
            Retry pairing
          </Button>
        </div>
      )}

      {/* Error */}
      {pageState.phase === 'error' && (
        <div className="space-y-3 text-center">
          <StatusMessage tone="danger">{pageState.message}</StatusMessage>
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
      <ol className="prose-body list-decimal space-y-1.5 pl-5 text-sm">
        <li>
          Copy{' '}
          <button
           className="text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:text-brand-hover"
            onClick={() => navigator.clipboard.writeText('chrome://extensions')}
          >
            chrome://extensions
          </button>{' '}
          and open it in a new tab.
        </li>
        <li className="text-sm">Toggle <strong className="font-medium text-foreground">Developer mode</strong> (top-right corner).</li>
        <li>Click <strong>Load unpacked</strong> and select the <code>extension/dist</code> folder.</li>
        <li>Come back to this tab — pairing will happen automatically.</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        An unpacked build pairs against the development extension ID. This is expected while the
        Web Store listing is in review.
      </p>
    </>
  );
}
