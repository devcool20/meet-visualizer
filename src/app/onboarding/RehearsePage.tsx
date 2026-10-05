/**
 * `/rehearse` — step 4 of 5 (plan §5.6).
 *
 * Full real-data pipeline: live camera preview, hold-to-talk speech recognition,
 * AI card generation grounded via Google Drive / Wikipedia, and pixel-perfect
 * over-the-shoulder presentation preview.
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
import { Loader2 } from 'lucide-react';
import { OnboardingShell } from './OnboardingShell';
import { StepHeader } from './StepHeader';

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
  const [generatedCard, setGeneratedCard] = useState<{ spec: any; provider: string } | null>(null);
  const [anyCardShown, setAnyCardShown] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [positionPreference, setPositionPreference] = useState<'auto' | 'right' | 'left'>('auto');
  const [effectiveSide, setEffectiveSide] = useState<'right' | 'left'>('right');
  const [isExpandedStage, setIsExpandedStage] = useState(true);

  useEffect(() => {
    if (positionPreference === 'left') setEffectiveSide('left');
    else if (positionPreference === 'right') setEffectiveSide('right');
    else setEffectiveSide('right');
  }, [positionPreference]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const h2t = useHoldToTalk();

  // Auto-request camera on mount and probe extension presence
  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards({ status: 'approved' }).then(setCards).catch(() => setCards([]));
    if (hasChromeRuntime()) {
      probeExtensionPresence().then(setExtensionPresent);
    } else {
      setExtensionPresent(false);
    }

    void requestCameraAndMic();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken]);

  // When transcript becomes available and state is transcribing, generate.
  useEffect(() => {
    if (h2t.state.phase === 'transcribing' && h2t.transcript) {
      void generateFromTranscript(h2t.transcript);
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

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  async function requestCameraAndMic(deviceId?: string) {
    setCamera({ phase: 'requesting' });
    try {
      // Stop any existing tracks before starting a new stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: true,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: true,
          });
        } catch {
          // If combined video+audio fails, request video-only so presenter is visible
          stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
          });
        }
      }

      streamRef.current = stream;

      // Enumerate devices to populate camera selection dropdown
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vDevices = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(vDevices);
        const currentTrack = stream.getVideoTracks()[0];
        if (currentTrack) {
          const currentSettings = currentTrack.getSettings();
          if (currentSettings.deviceId) {
            setSelectedDeviceId(currentSettings.deviceId);
          }
        }
      } catch {
        // Enumerate optional
      }

      if (videoRef.current) {
        const el = videoRef.current;
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        el.srcObject = stream;
        try {
          await el.play();
        } catch {
          // Ignore
        }
      }

      // Initialize audio level meter if audio tracks exist
      try {
        if (stream.getAudioTracks().length > 0) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length / 255;
              setAudioLevel(avg);
              animFrameRef.current = requestAnimationFrame(tick);
            };
            tick();
          }
        }
      } catch {
        // Audio metering optional
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

  // Ensure the video element gets the stream when it mounts or phase updates
  useEffect(() => {
    if (camera.phase === 'granted' && videoRef.current && streamRef.current) {
      const el = videoRef.current;
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
      if (el.srcObject !== streamRef.current) {
        el.srcObject = streamRef.current;
      }
      el.play().catch(() => {});
    }
  }, [camera.phase]);

  function simulateTrigger(card: ApiCard) {
    setGeneratedCard({ spec: card.spec, provider: 'fixture' });
    setAnyCardShown(true);
  }

  function handleContinue() {
    markRehearsed();
    saveSetupStep('meet');
    navigate('/meet');
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = textInput.trim();
    if (!q) return;
    void generateFromTranscript(q);
    setTextInput('');
  }

  return (
    <OnboardingShell step={4} totalSteps={5} maxWidth={isExpandedStage ? 'max-w-5xl' : 'max-w-3xl'}>
      <StepHeader
        className="mb-6"
        step="Step four"
        title="Let's rehearse"
        description="Turn your camera on, hold the key, and say what you would say in a real call. Your card synthesises instantly and floats over your shoulder in live video. Nothing is broadcast anywhere."
      />

      {/* Status strip */}
      <div className="telemetry mb-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${extensionPresent ? 'bg-success' : 'bg-muted-subtle'}`} />
          Extension: {extensionPresent === null ? 'checking…' : extensionPresent ? 'paired' : 'virtual cam mode'}
        </span>
        <span>·</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${camera.phase === 'granted' ? 'bg-success animate-pulse' : 'bg-warning'}`} />
          Camera &amp; Mic: {camera.phase === 'granted' ? 'active' : 'connecting…'}
        </span>
      </div>

      {/* Presentation Stage Widescreen Container (Expanded Meeting View) */}
      <div className="flex flex-col items-center gap-3 mb-6 w-full">
        {/* Placement & Mode toolbar */}
        <div className="flex flex-wrap items-center justify-between w-full px-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">Card Position:</span>
              <div className="inline-flex rounded-lg bg-accent p-0.5 border border-border-strong">
                {(['auto', 'right', 'left'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPositionPreference(pos)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                      positionPreference === pos
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {pos === 'auto' ? '⚡ Auto-detect' : pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Switcher Dropdown */}
            {videoDevices.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">Camera:</span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const devId = e.target.value;
                    setSelectedDeviceId(devId);
                    void requestCameraAndMic(devId);
                  }}
                  className="px-2 py-1 rounded-lg bg-accent border border-border-strong text-foreground text-xs font-sans max-w-[170px] truncate outline-none hover:bg-accent transition-colors"
                >
                  {videoDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsExpandedStage((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent hover:bg-accent text-foreground border border-border-strong transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isExpandedStage ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11-5l5 0m0 0l-5 5m5-5l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5m16 5l-5-5m5 5l0-5m0 5l-5 0" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
            {isExpandedStage ? 'Compact view' : 'Maximize meeting stage'}
          </button>
        </div>

        {/* Video Canvas Stage */}
        <div
          className="relative w-full transition-all duration-300 aspect-video rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-border bg-background-sunken"
        >
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                el.srcObject = streamRef.current;
                el.play().catch(() => {});
              }
            }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              el.play().catch(() => {});
            }}
            muted
            playsInline
            autoPlay
            className="size-full -scale-x-100 object-cover"
          />
          {camera.phase !== 'granted' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground bg-background-sunken/90 z-10">
              <span className="text-sm">
                {camera.phase === 'requesting' && 'Connecting to your camera & microphone…'}
                {camera.phase === 'idle' && 'Click below to start your camera stream'}
                {camera.phase === 'denied' && 'Camera/microphone access was denied in browser permissions.'}
                {camera.phase === 'not-readable' &&
                  'Camera in use by another application. Close it and click retry.'}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void requestCameraAndMic()} className="bg-accent text-foreground border-border-strong hover:bg-accent">
                  {camera.phase === 'requesting' ? 'Retrying…' : 'Start / Retry Camera'}
                </Button>
              </div>
            </div>
          )}

          {/* Live Audio Visualizer Overlay (bottom left of video) */}
          {camera.phase === 'granted' && (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] text-foreground border border-border font-mono">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span>LIVE</span>
              <div className="flex items-center gap-0.5 ml-1">
                {[0.3, 0.6, 0.9].map((thresh, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      audioLevel > thresh * 0.4 ? 'bg-success' : 'bg-foreground/20'
                    }`}
                    style={{
                      height: `${Math.max(4, Math.min(14, audioLevel * 25 + (idx + 1) * 3))}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Over-the-shoulder Card Placement with Adaptive Left/Right Auto-positioning */}
          {generatedCard && (() => {
            const currentSide = positionPreference === 'auto' ? effectiveSide : positionPreference;
            const oppositeSide = currentSide === 'left' ? 'right' : 'left';
            const cardWidth = isExpandedStage ? 215 : 195;

            // Find if card has an image block to display on the anti-side
            const imageBlock = generatedCard.spec.blocks.find((b: any) => b.kind === 'image');
            // Card without image block for clean, spacious typography
            const textOnlySpec = {
              ...generatedCard.spec,
              blocks: generatedCard.spec.blocks.filter((b: any) => b.kind !== 'image'),
            };

            return (
              <>
                {/* Main Information Card */}
                <div
                  className={`absolute top-6 md:top-8 z-20 transition-all duration-300 drop-shadow-2xl ${
                    currentSide === 'left' ? 'left-4 md:left-6' : 'right-4 md:right-6'
                  }`}
                >
                  <div className="relative group">
                    <GlassCard
                      spec={textOnlySpec as any}
                      width={cardWidth}
                    />
                    <button
                      onClick={() => setGeneratedCard(null)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-card/90 text-foreground hover:bg-accent text-xs flex items-center justify-center border border-border-strong shadow-md opacity-80 hover:opacity-100 transition-opacity z-30"
                      title="Dismiss card"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Anti-Side Companion Image Card (if card has an image) */}
                {imageBlock && (
                  <div
                    className={`absolute top-6 md:top-8 z-20 transition-all duration-300 drop-shadow-2xl ${
                      oppositeSide === 'left' ? 'left-4 md:left-6' : 'right-4 md:right-6'
                    }`}
                  >
                    {/* The same glass material as every other card, via the
                        `glass-strong` utility rather than a hand-written
                        backdrop-filter block. */}
                    <div
                      className="glass-strong flex flex-col gap-2 overflow-hidden p-2.5"
                      style={{ width: `${cardWidth}px` }}
                    >
                      <div
                        className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-background-sunken p-1"
                        style={{ height: `${Math.round(cardWidth * 0.95)}px` }}
                      >
                        <img
                          src={imageBlock.url}
                          alt={imageBlock.alt || generatedCard.spec.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain',
                            display: 'block',
                            borderRadius: '6px',
                          }}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-foreground truncate">
                          {generatedCard.spec.title}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                          Visual
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* HUD State Indicator */}
          {h2t.state.phase === 'generating' && (
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-border bg-black/70 px-3 py-2 text-xs text-foreground backdrop-blur">
              <Loader2 className="size-3 animate-spin text-warning" strokeWidth={2.4} aria-hidden />
              <span>Synthesizing card…</span>
            </div>
          )}

          {/* Preview Tag */}
          <div className="absolute bottom-3 right-3 z-10 text-[11px] px-2.5 py-1 rounded bg-black/60 backdrop-blur text-muted-foreground border border-border">
            {positionPreference === 'auto' ? `Auto-placed (${effectiveSide})` : `${positionPreference} shoulder`} · 16:9
          </div>
        </div>
      </div>

      {/* Speech & Manual Interaction Controls */}
      <div className="flex flex-col items-center gap-4 mb-6">
        {/* Hold to talk button */}
        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            type="button"
            aria-pressed={h2t.state.phase === 'listening'}
            onPointerDown={() => h2t.startListening()}
            onPointerUp={() => h2t.stopListening()}
            onPointerLeave={() => h2t.stopListening()}
            className={`h-auto rounded-full px-12 py-5 text-sm font-medium text-white shadow-brand transition-transform active:scale-95 ${
              h2t.state.phase === 'listening' ? 'bg-brand-hover' : 'bg-brand'
            }`}
          >
            {h2t.state.phase === 'listening' ? 'Listening to your voice…' : 'Hold to talk'}
          </Button>
          <span className="text-xs text-muted-foreground">
            or hold{" "}
            <kbd className="telemetry rounded bg-accent px-1.5 py-0.5 text-[0.625rem] text-foreground">
              Alt+Shift+Space
            </kbd>
            {" "}
            <span className="text-muted-subtle">(Alt+Space and Ctrl+Space also work)</span>
          </span>
        </div>

        {/* Live transcript readout */}
        {h2t.transcript && (
          <p className="text-sm font-medium italic text-foreground bg-accent px-4 py-1.5 rounded-full border border-border-strong">
            &ldquo;{h2t.transcript}&rdquo;
          </p>
        )}

        {/* Direct Text Search / Prompt Input */}
        <form onSubmit={handleManualSubmit} className="flex items-center gap-2 w-full max-w-md mt-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or type a topic: Fable 5, Ranbir Kapoor, ARR metrics…"
            className="flex-1 rounded-full px-4 py-2 text-sm bg-input-background border border-border-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-brand text-foreground"
          />
          <Button type="submit" size="sm" variant="secondary" className="rounded-full px-4">
            Generate
          </Button>
        </form>

        {/* Error Feedback */}
        {h2t.state.phase === 'failed' && (
          <div className="text-center space-y-1">
            <p className="text-sm text-destructive">
              {h2t.state.error === 'no_provider'
                ? 'No AI provider configured. Add an API key in Settings.'
                : `Generation error: ${h2t.state.error}`}
            </p>
          </div>
        )}
      </div>

      {/* Suggested Topic Chips */}
      <div className="space-y-2 mb-8">
        <p className="text-xs text-center font-medium text-muted-foreground uppercase tracking-wider">
          Suggested Topics
        </p>
        <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
          {[
            'Fable 5',
            'Ranbir Kapoor',
            'Our ARR and Gross Margin',
            'Playground Games',
            'YC W25 Pitch Metrics',
          ].map((topic) => (
            <button
              key={topic}
              className="text-xs px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent text-foreground border border-border-strong transition-colors font-medium"
              onClick={() => generateFromTranscript(topic)}
            >
              &ldquo;{topic}&rdquo;
            </button>
          ))}
          {cards.length > 0 &&
            cards.flatMap((c) => c.phrases.slice(0, 1)).slice(0, 2).map((phrase, i) => (
              <button
                key={phrase}
                className="text-xs px-3.5 py-1.5 rounded-full bg-foreground hover:bg-accent text-background transition-colors font-medium"
                onClick={() => simulateTrigger(cards[i])}
              >
                &ldquo;{phrase}&rdquo;
              </button>
            ))}
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="flex justify-center pb-6">
        <Button size="lg" disabled={!anyCardShown} onClick={handleContinue} className="px-8">
          {anyCardShown ? 'Continue to Google Meet' : 'Generate a card to continue'}
        </Button>
      </div>
    </OnboardingShell>
  );
}
