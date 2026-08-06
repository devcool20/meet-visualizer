import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';
import {
  CHROME_WEB_STORE_URL,
  hasChromeRuntime,
  pairingReducer,
  probeExtensionPresence,
  sendPairMessage,
  type PairingState,
} from '@/lib/extension';
import { saveOnboardingStep } from '@/lib/onboarding';
import { OnboardingShell } from './OnboardingShell';

type CameraState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'granted' }
  | { phase: 'denied' }
  | { phase: 'not-readable' };

/**
 * `/rehearse` — the core of plan §4.2. Detects the extension, walks the
 * "Add to Chrome" → reload → silent pairing seam, primes camera/mic on OUR
 * origin (so there is no second permission prompt in the extension's own
 * context, since the content script also runs here per the plan's
 * `content_scripts`/`host_permissions` decision), and shows a card once the
 * user says one of their sample cards' trigger phrases.
 *
 * Runs in a clearly labeled degraded/simulated mode when the extension is
 * absent, so the page is still useful (and the funnel not a dead end) for
 * anyone who hasn't installed it yet.
 */
export default function RehearsePage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [pairing, setPairing] = useState<PairingState>({ phase: 'idle' });
  const [camera, setCamera] = useState<CameraState>({ phase: 'idle' });
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [firedCard, setFiredCard] = useState<ApiCard | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards({ status: 'approved' }).then(setCards).catch(() => setCards([]));
  }, [getAccessToken]);

  const runProbe = useCallback(async () => {
    setPairing((s) => pairingReducer(s, { type: 'PROBE_START' }));
    const present = await probeExtensionPresence();
    setPairing((s) => pairingReducer(s, { type: 'PROBE_RESULT', present }));
    if (present) await runPairing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPairing = useCallback(async () => {
    setPairing((s) => pairingReducer(s, { type: 'NONCE_REQUESTED' }));
    try {
      const api = getApiClient(getAccessToken);
      const { nonce } = await api.requestPairingNonce();
      setPairing((s) => pairingReducer(s, { type: 'NONCE_RECEIVED' }));
      const result = await sendPairMessage(nonce);
      if (result.ok) {
        setPairing((s) => pairingReducer(s, { type: 'PAIR_SUCCEEDED' }));
      } else {
        setPairing((s) => pairingReducer(s, { type: 'PAIR_FAILED', message: result.error ?? 'pairing failed' }));
      }
    } catch (err) {
      setPairing((s) =>
        pairingReducer(s, { type: 'NONCE_REQUEST_FAILED', message: err instanceof Error ? err.message : 'network error' }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken]);

  useEffect(() => {
    runProbe();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddToChrome() {
    window.open(CHROME_WEB_STORE_URL, '_blank', 'noopener,noreferrer');
    // Poll for presence: CWS opens in a new tab per plan §4.2 seam, and the
    // reload after install triggers silent pairing automatically (step 5).
    const interval = setInterval(async () => {
      const present = await probeExtensionPresence();
      if (present) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 2000);
    // Stop polling after 2 minutes so we don't leak a timer forever if the
    // user abandons the install.
    setTimeout(() => clearInterval(interval), 120_000);
  }

  async function requestCameraAndMic() {
    setCamera({ phase: 'requesting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      setCamera({ phase: 'granted' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotReadableError') {
        setCamera({ phase: 'not-readable' });
      } else {
        setCamera({ phase: 'denied' });
      }
    }
  }

  function simulateTrigger(card: ApiCard) {
    setFiredCard(card);
  }

  function handleContinue() {
    saveOnboardingStep('notion');
    navigate('/notion-connect');
  }

  const extensionAbsent = pairing.phase === 'absent';
  const paired = pairing.phase === 'paired';

  return (
    <OnboardingShell step={2} totalSteps={4}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Let&apos;s rehearse.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          This runs the real pipeline on your own camera, before you ever join a meeting.
        </p>
      </div>

      {pairing.phase === 'probing' && (
        <p className="text-sm text-center" style={{ color: '#5A5550' }}>
          Checking for the Stash Live extension&hellip;
        </p>
      )}

      {extensionAbsent && (
        <div
          className="rounded-2xl p-6 text-center space-y-4 mb-6"
          style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#fb8500' }}>
            Extension not detected
          </p>
          <p className="text-sm" style={{ color: '#5A5550' }}>
            Install the Chrome extension to rehearse with the real pipeline. You can still preview
            in a simulated mode below.
          </p>
          <Button onClick={handleAddToChrome}>Add to Chrome</Button>
        </div>
      )}

      {(pairing.phase === 'requesting-nonce' || pairing.phase === 'pairing') && (
        <p className="text-sm text-center mb-6" style={{ color: '#5A5550' }}>
          Pairing your device&hellip;
        </p>
      )}

      {pairing.phase === 'nonce-expired' && (
        <div className="text-center space-y-3 mb-6">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            That pairing code expired. Let&apos;s try again.
          </p>
          <Button variant="outline" onClick={() => runPairing()}>
            Retry pairing
          </Button>
        </div>
      )}

      {pairing.phase === 'error' && (
        <div className="text-center space-y-3 mb-6">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            {pairing.message}
          </p>
          <Button variant="outline" onClick={() => runProbe()}>
            Retry
          </Button>
        </div>
      )}

      {paired && (
        <p className="text-sm text-center mb-6" style={{ color: '#1A1512' }}>
          Extension paired. {hasChromeRuntime() ? '' : ''}
        </p>
      )}

      <div className="flex flex-col items-center gap-4 mb-8">
        <div
          className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ background: '#1A1512' }}
        >
          {camera.phase === 'granted' ? (
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm" style={{ color: '#FBF9F6' }}>
              {camera.phase === 'requesting' && 'Requesting camera & microphone…'}
              {camera.phase === 'idle' && 'Camera preview'}
              {camera.phase === 'denied' && 'Camera/microphone permission denied'}
              {camera.phase === 'not-readable' &&
                'Could not access your camera — close other apps using it and retry.'}
            </span>
          )}
          {firedCard && (
            <div className="absolute right-4 top-4">
              <GlassCard spec={firedCard.spec} width={220} />
            </div>
          )}
        </div>

        {camera.phase === 'idle' && <Button onClick={requestCameraAndMic}>Allow camera &amp; microphone</Button>}
        {(camera.phase === 'denied' || camera.phase === 'not-readable') && (
          <Button variant="outline" onClick={requestCameraAndMic}>
            Retry
          </Button>
        )}
      </div>

      {camera.phase === 'granted' && cards.length > 0 && (
        <div className="space-y-3 mb-8">
          <p className="text-sm text-center" style={{ color: '#5A5550' }}>
            Say one of these phrases out loud{extensionAbsent ? ' (simulated — tap instead)' : ''}:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {cards.flatMap((card) => card.phrases.slice(0, 1)).map((phrase, i) => (
              <button
                key={phrase}
                className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                style={{ background: '#1A1512', color: '#FBF9F6' }}
                onClick={() => simulateTrigger(cards[i])}
              >
                &ldquo;{phrase}&rdquo;
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button size="lg" disabled={!firedCard} onClick={handleContinue}>
          {firedCard ? 'Continue' : 'Waiting for your first card…'}
        </Button>
      </div>
    </OnboardingShell>
  );
}
