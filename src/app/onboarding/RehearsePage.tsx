/**
 * `/rehearse` — step 4 of 5 (plan §5.6).
 *
 * Full real-data pipeline: hold-to-talk via `useHoldToTalk`, send transcript
 * to `POST /api/ai/generate-card`, show the card. Supports the compositor
 * when extension is active, or a fixture-card preview otherwise.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';
import { hasChromeRuntime, probeExtensionPresence } from '@/lib/extension';
import { saveSetupStep, markRehearsed } from '@/lib/setup';
import { recordGeneratedCard } from '@/lib/rehearsal';
import { useHoldToTalk } from '@/app/hooks/useHoldToTalk';
import { OnboardingShell } from './OnboardingShell';

type CameraState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'granted' }
  | { phase: 'denied' }
  | { phase: 'not-readable' };

export default function RehearsePage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [camera, setCamera] = useState<CameraState>({ phase: 'idle' });
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [extensionPresent, setExtensionPresent] = useState<boolean | null>(null);
  const [generatedCard, setGeneratedCard] = useState<{ spec: unknown; provider: string } | null>(null);
  const [anyCardShown, setAnyCardShown] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const h2t = useHoldToTalk();

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards({ status: 'approved' }).then(setCards).catch(() => setCards([]));
    if (hasChromeRuntime()) {
      probeExtensionPresence().then(setExtensionPresent);
    } else {
      setExtensionPresent(false);
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [getAccessToken]);

  // When transcript becomes available and state is transcribing, generate.
  useEffect(() => {
    if (h2t.state.phase === 'transcribing' && h2t.transcript) {
      generateFromTranscript(h2t.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h2t.state.phase, h2t.transcript]);

  const generateFromTranscript = useCallback(
    async (transcript: string) => {
      h2t.startGenerating();
      try {
        const api = getApiClient(getAccessToken);
        const result = await api.generateCard(transcript, 'rehearsal');
        setGeneratedCard({ spec: result.card, provider: result.provider });
        setAnyCardShown(true);
        recordGeneratedCard({
          title: result.card.title ?? 'AI Card',
          spec: result.card,
          provider: result.provider,
        });
        h2t.markShown();
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? 'internal';
        h2t.markFailed(code);
      }
    },
    [getAccessToken, h2t],
  );

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

  // Fallback: click a fixture card to simulate.
  function simulateTrigger(card: ApiCard) {
    setGeneratedCard({ spec: card.spec, provider: 'fixture' });
    setAnyCardShown(true);
  }

  function handleContinue() {
    markRehearsed();
    saveSetupStep('meet');
    navigate('/meet');
  }

  return (
    <OnboardingShell step={4} totalSteps={5}>
      <div className="text-center space-y-3 mb-8">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          Let&apos;s rehearse.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Step 4 of 5 — Hold Alt+Shift+Space and say a sentence. The card generated from your voice
          will appear on screen.
        </p>
      </div>

      {/* Status strip */}
      <div
        className="flex items-center justify-center gap-4 mb-6 text-xs"
        style={{ color: '#5A5550' }}
      >
        <span>
          Extension:{' '}
          {extensionPresent === null
            ? 'checking…'
            : extensionPresent
              ? 'paired'
              : 'not detected'}
        </span>
        <span>·</span>
        <span>Mic: {camera.phase === 'granted' ? 'ready' : 'not started'}</span>
      </div>

      {/* Video stage */}
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

          {/* Generated card overlay */}
          {generatedCard && (
            <div className="absolute right-4 top-4">
              <GlassCard spec={generatedCard.spec as any} width={220} />
            </div>
          )}

          {/* Compositor/preview label */}
          {generatedCard && (
            <div className="absolute bottom-3 left-3 text-xs px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: '#FBF9F6' }}>
              {extensionPresent
                ? 'This is your real outbound video'
                : 'Preview — install the extension to composite this into your video'}
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

      {/* Hold to talk button */}
      {camera.phase === 'granted' && (
        <div className="text-center space-y-3 mb-8">
          {(h2t.state.phase === 'idle' || h2t.state.phase === 'shown' || h2t.state.phase === 'failed') && (
            <>
              <Button
                size="lg"
                onPointerDown={() => h2t.startListening()}
                onPointerUp={() => h2t.stopListening()}
                onPointerLeave={() => h2t.stopListening()}
                style={{
                  background: '#fb8500',
                  color: '#fff',
                  borderRadius: '9999px',
                  padding: '1rem 2.5rem',
                }}
              >
                Hold to talk
              </Button>
              <p className="text-xs" style={{ color: '#5A5550' }}>
                or hold Alt+Shift+Space
              </p>
            </>
          )}

          {h2t.state.phase === 'listening' && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(251,133,0,0.1)' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#fb8500' }} />
                <span className="text-sm" style={{ color: '#fb8500' }}>Listening…</span>
              </div>
              {h2t.transcript && (
                <p className="text-sm italic" style={{ color: '#5A5550' }}>
                  &ldquo;{h2t.transcript}&rdquo;
                </p>
              )}
            </div>
          )}

          {h2t.state.phase === 'transcribing' && (
            <p className="text-sm" style={{ color: '#5A5550' }}>
              Processing…
            </p>
          )}

          {h2t.state.phase === 'generating' && (
            <p className="text-sm" style={{ color: '#5A5550' }}>
              Building your card…
            </p>
          )}

          {h2t.state.phase === 'failed' && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: '#d4183d' }}>
                {h2t.state.error === 'no_provider'
                  ? 'No AI provider configured. Go back to set up a key.'
                  : h2t.state.error === 'not-allowed'
                    ? 'Microphone access was denied. Check your browser permissions.'
                    : `Generation failed: ${h2t.state.error}`}
              </p>
              {h2t.state.error === 'no_provider' && (
                <Button variant="outline" onClick={() => navigate('/setup/data')}>
                  Set up AI key
                </Button>
              )}
            </div>
          )}

          {h2t.state.phase === 'unsupported' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: '#5A5550' }}>
                Speech recognition is not supported in this browser. Type a sentence instead:
              </p>
              <div className="flex gap-2 justify-center">
                <input
                  type="text"
                  className="rounded-lg px-3 py-2 text-sm border"
                  style={{ border: '1px solid rgba(26,21,18,0.12)', minWidth: '240px' }}
                  placeholder="Type a sentence to generate from…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value) generateFromTranscript(value);
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('input[type="text"]');
                    if (input?.value.trim()) generateFromTranscript(input.value.trim());
                  }}
                >
                  Generate
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fixture chips fallback */}
      {cards.length > 0 && (
        <div className="space-y-3 mb-8">
          <p className="text-sm text-center" style={{ color: '#5A5550' }}>
            No extension? Preview a sample card:
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

      {/* Footer */}
      <div className="flex justify-center">
        <Button size="lg" disabled={!anyCardShown} onClick={handleContinue}>
          {anyCardShown ? 'Continue' : 'Generate a card to continue'}
        </Button>
      </div>
    </OnboardingShell>
  );
}
