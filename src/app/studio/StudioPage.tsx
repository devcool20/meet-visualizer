/**
 * Stash Live — Web Studio Broadcaster (`/studio`).
 *
 * Dedicated standalone presenter studio for browser-based presenting.
 * Allows presenters to stream camera + mic + live over-the-shoulder ambient cards
 * and broadcast directly to Google Meet (or any meeting platform) via tab share or virtual cam.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Mic } from 'lucide-react';
import { GlassCard } from '@stash/card-react';
import type { CardSpec } from '@stash/card-spec';
import { getApiClient } from '@/lib/api';
import { useAuth } from '@/app/auth/AuthContext';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Action,
  Pill,
  StatusDot,
  StatusMessage,
  Surface,
  Wordmark,
} from '@/app/components/primitives';

const QUICK_TOPICS = [
  { label: 'Ranbir Kapoor', prompt: 'Ranbir Kapoor' },
  { label: 'Q2 Revenue', prompt: 'our Q2 revenue is $240K with 40% growth' },
  { label: 'Fable 5', prompt: 'Fable 5 release date and features' },
  { label: 'Postgres vs Dynamo', prompt: 'Postgres vs DynamoDB trade-offs' },
  { label: 'Team Roster', prompt: 'team headcount and active roster' },
  { label: 'iPhone 16', prompt: 'iPhone 16 specifications' },
];

export default function StudioPage() {
  const { getAccessToken } = useAuth();

  const [activeCard, setActiveCard] = useState<CardSpec | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [engineConnected, setEngineConnected] = useState(false);

  const [positionMode, setPositionMode] = useState<'auto' | 'left' | 'right'>('auto');
  const [effectiveSide, setEffectiveSide] = useState<'left' | 'right'>('right');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showMeetHelp, setShowMeetHelp] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // 1. Initialize Camera & Audio Meter
  useEffect(() => {
    async function startMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Set up audio analyzer
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateMeter = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(updateMeter);
            };
            updateMeter();
          }
        } catch (e) {
          console.warn('Audio analyzer error:', e);
        }
      } catch (err) {
        console.warn('Camera/mic error:', err);
      }
    }

    void startMedia();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 2. Connect to Engine WebSocket
  useEffect(() => {
    const defaultEngineUrl = (import.meta.env.VITE_ENGINE_WS_URL || 'wss://stash-live-engine.onrender.com').replace(/^http/, 'ws');
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        socket = new WebSocket(defaultEngineUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          setEngineConnected(true);
          setErrorMessage(null);
          socket?.send(
            JSON.stringify({
              t: 'hello',
              token: 'studio-session',
              protocolVersion: 1,
            }),
          );
        };

        socket.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.t === 'show' && data.card) {
              setIsGenerating(false);
              setActiveCard(data.card);
            } else if (data.t === 'generating') {
              setIsGenerating(true);
            } else if (data.t === 'generate_failed') {
              setIsGenerating(false);
              setErrorMessage(data.message || 'Generation failed');
            }
          } catch (e) {}
        };

        socket.onerror = () => setEngineConnected(false);
        socket.onclose = () => {
          setEngineConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        setEngineConnected(false);
        reconnectTimer = setTimeout(connect, 4000);
      }
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  // 3. Speech Recognition Engine
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (event: any) => {
          let current = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            current += event.results[i][0].transcript;
          }
          if (current.trim()) {
            setInterimTranscript(current);
          }
        };

        recognitionRef.current = rec;
      } catch {}
    }
  }, []);

  const handleGenerate = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return;

      setIsGenerating(true);
      setErrorMessage(null);
      setInterimTranscript('');

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            t: 'generate',
            captureId: `cap_${Date.now()}`,
            text: query,
            ts: Date.now(),
          }),
        );
      } else {
        try {
          const api = getApiClient(getAccessToken);
          const result = await api.generateCard(query, 'rehearsal');
          setIsGenerating(false);
          setActiveCard(result.card);
        } catch (err: any) {
          setIsGenerating(false);
          setErrorMessage(err?.message || 'Failed to generate card');
        }
      }
    },
    [getAccessToken],
  );

  const startListening = useCallback(() => {
    if (isListening) return;
    setIsListening(true);
    isListeningRef.current = true;
    setInterimTranscript('');
    setErrorMessage(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {}
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!isListeningRef.current) return;
    setIsListening(false);
    isListeningRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (interimTranscript.trim()) {
      void handleGenerate(interimTranscript);
    }
  }, [interimTranscript, handleGenerate]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        startListening();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (isListeningRef.current && (e.code === 'Space' || !e.altKey || !e.shiftKey)) {
        stopListening();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startListening, stopListening]);

  // Handle position switching
  useEffect(() => {
    if (positionMode === 'left') setEffectiveSide('left');
    else if (positionMode === 'right') setEffectiveSide('right');
    else setEffectiveSide('right'); // default auto
  }, [positionMode]);

  return (
    // `.studio` re-points the shared tokens at dark values, so every colour
    // below is a token rather than a raw hex or a stock Tailwind grey.
    <div className="studio flex min-h-screen w-full flex-col bg-background text-foreground">
      {/* ── Studio Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/90 px-[var(--gutter)] py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-75">
            <Wordmark size="sm" className="block" />
            <Pill tone="brand">Studio</Pill>
          </Link>

          <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <StatusDot tone={engineConnected ? "success" : "brand"} pulse={!engineConnected} />
            {engineConnected ? "Engine live" : "Connecting…"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Audio visualiser */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/60 px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Mic</span>
            <div className="flex h-2 w-16 items-center overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-75"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

          {/* Position selector */}
          <div
            className="flex items-center gap-0.5 rounded-lg border border-border bg-accent/60 p-0.5 text-xs"
            role="group"
            aria-label="Card position"
          >
            {(["auto", "left", "right"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPositionMode(mode)}
                aria-pressed={positionMode === mode}
                className={`rounded-md px-2.5 py-1 capitalize transition-all duration-200 ${
                  positionMode === mode
                    ? "bg-brand font-medium text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            onClick={() => setShowMeetHelp(true)}
            className="h-8 bg-brand px-3.5 text-xs font-medium text-white hover:bg-brand-hover"
          >
            Present in Google Meet
          </Button>
        </div>
      </header>

      {/* ── Main Studio Presenter Stage ── */}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-[var(--gutter)] py-6">
        {/* Widescreen Video Frame Container */}
        <div className="relative flex aspect-video w-full max-w-5xl items-center justify-center overflow-hidden rounded-panel border border-border bg-black shadow-lifted">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="size-full -scale-x-100 object-cover"
          />
          {/* Live Camera Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />

          {/* Over-the-Shoulder Card Container */}
          <div
            className={`absolute top-8 ${
              effectiveSide === 'left' ? 'left-8' : 'right-8'
            } z-20 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]`}
          >
            <AnimatePresence mode="wait">
              {isGenerating && (
                <motion.div
                  key="generating-box"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center gap-3 rounded-card border border-border bg-black/60 p-4 text-xs shadow-lifted backdrop-blur-xl"
                  role="status"
                >
                  <Loader2 className="size-4 animate-spin text-brand" strokeWidth={2.2} aria-hidden />
                  <span>Synthesizing card…</span>
                </motion.div>
              )}

              {!isGenerating && activeCard && (
                <motion.div
                  key={activeCard.id || activeCard.title}
                  initial={{ opacity: 0, scale: 0.92, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <GlassCard spec={activeCard} width={220} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Presenter badge */}
          <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2 rounded-full border border-border bg-black/60 px-3 py-1.5 text-xs text-foreground backdrop-blur-md">
            <StatusDot tone="brand" pulse />
            <span>Studio broadcaster</span>
          </div>
        </div>

        {/* ── Studio Bottom Controls ── */}
        <div className="w-full max-w-3xl space-y-3">
          {/* Live Voice Indicator */}
          {isListening && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-xl border border-warning-border bg-warning-surface px-3 py-2.5 text-xs text-foreground shadow-brand"
              role="status"
            >
              <StatusDot tone="brand" pulse />
              <span className="font-medium text-brand">Listening</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {interimTranscript || "Speak an entity or topic…"}
              </span>
            </motion.div>
          )}

          {errorMessage && <StatusMessage tone="danger">{errorMessage}</StatusMessage>}

          <div className="flex items-center gap-3">
            {/* The product's signature control. Hold to talk. */}
            <button
              type="button"
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) startListening();
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") stopListening();
              }}
              onBlur={stopListening}
              aria-pressed={isListening}
              className={`group flex flex-1 select-none items-center justify-center gap-2.5 rounded-card px-6 py-3.5 text-sm font-medium transition-all duration-200 active:scale-[0.99] ${
                isListening
                  ? "bg-brand text-white shadow-brand-lg"
                  : "bg-foreground text-background hover:bg-foreground/90"
              }`}
            >
              <Mic className="size-4 shrink-0" strokeWidth={2} aria-hidden />
              <span>{isListening ? "Release to generate" : "Hold to speak"}</span>
              <kbd
                className={`telemetry ml-1 rounded px-2 py-0.5 text-[0.625rem] ${
                  isListening ? "bg-white/20 text-white" : "bg-background/15 text-background"
                }`}
              >
                Alt+Shift+Space
              </kbd>
            </button>

            {activeCard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveCard(null)}
                className="h-[3.25rem] border-border-strong px-4 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Clear card
              </Button>
            )}
          </div>

          {/* Quick Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualInput.trim()) {
                void handleGenerate(manualInput);
                setManualInput('');
              }
            }}
            className="flex items-center gap-2"
          >
            <Input
              type="text"
              placeholder="Or type a topic — Q2 revenue, team size, latency…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              aria-label="Type a topic to generate a card"
              className="h-10 border-border bg-input-background text-xs text-foreground placeholder:text-muted-subtle"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!manualInput.trim() || isGenerating}
              className="h-10 bg-brand px-4 text-xs text-white hover:bg-brand-hover"
            >
              Generate
            </Button>
          </form>

          {/* Suggested topics */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="eyebrow text-muted-subtle">Try</span>
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.label}
                type="button"
                onClick={() => void handleGenerate(topic.prompt)}
                className="rounded-full border border-border bg-accent/60 px-2.5 py-1 text-[0.6875rem] text-muted-foreground transition-colors duration-200 hover:border-brand/40 hover:text-brand"
              >
                {topic.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Google Meet presentation help ── */}
      <Dialog open={showMeetHelp} onOpenChange={setShowMeetHelp}>
        <DialogContent className="studio max-w-lg border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-normal">
              Broadcasting to Google Meet
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Two ways to get this stage into a Meet call. Neither needs an install.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Surface tone="outline" className="space-y-1.5 p-4">
              <p className="text-sm font-medium text-brand">Share this tab</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                In Google Meet choose <strong className="font-medium text-foreground">Present now
                {" → "}A tab</strong> and select this Stash Live Studio window. Your video and cards
                stream at full quality.
              </p>
            </Surface>

            <Surface tone="outline" className="space-y-1.5 p-4">
              <p className="text-sm font-medium text-brand">Meet add-on</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Launch Stash Live inside Meet&rsquo;s side panel or main stage using the official
                Google Meet SDK.
              </p>
              <Action
                href="/meet-addon"
                size="sm"
                variant="outline"
                className="mt-2"
                external
                trailingArrow
              >
                Open add-on preview
              </Action>
            </Surface>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowMeetHelp(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
