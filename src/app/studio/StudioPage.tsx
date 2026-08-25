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
import { GlassCard } from '@stash/card-react';
import type { CardSpec } from '@stash/card-spec';
import { getApiClient } from '@/lib/api';
import { useAuth } from '@/app/auth/AuthContext';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

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
    <div
      className="min-h-screen w-full flex flex-col select-none"
      style={{
        background: '#12100E',
        fontFamily: "'Inter', sans-serif",
        color: '#FBF9F6',
      }}
    >
      {/* ── Studio Header ── */}
      <header className="px-6 py-3.5 flex items-center justify-between border-b border-white/10 bg-[#1A1512]/90 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
            <span className="text-sm font-bold tracking-wider uppercase font-serif">Stash Live</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#fb8500]/20 text-[#fb8500] font-mono">
              STUDIO
            </span>
          </Link>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: engineConnected ? '#22c55e' : '#fb8500' }}
            />
            <span>{engineConnected ? 'Engine Live' : 'Connecting…'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Visualizer Meter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
            <span className="text-gray-400">Mic</span>
            <div className="w-16 h-2 rounded-full bg-white/10 overflow-hidden flex items-center">
              <div
                className="h-full bg-[#fb8500] transition-all duration-75"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

          {/* Position Selector */}
          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            <button
              onClick={() => setPositionMode('auto')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                positionMode === 'auto' ? 'bg-[#fb8500] text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setPositionMode('left')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                positionMode === 'left' ? 'bg-[#fb8500] text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              Left
            </button>
            <button
              onClick={() => setPositionMode('right')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                positionMode === 'right' ? 'bg-[#fb8500] text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              Right
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => setShowMeetHelp(true)}
            className="bg-[#fb8500] hover:bg-[#ea7700] text-white text-xs px-3.5 h-8 font-medium"
          >
            Present in Google Meet
          </Button>
        </div>
      </header>

      {/* ── Main Studio Presenter Stage ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Widescreen Video Frame Container */}
        <div
          className="relative w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border border-white/15 aspect-video bg-black flex items-center justify-center"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >
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
                  className="p-4 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 flex items-center gap-3 text-xs shadow-2xl"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-[#fb8500] border-t-transparent animate-spin" />
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

          {/* Presenter Name Badge */}
          <div className="absolute bottom-6 left-6 z-20 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#fb8500] animate-pulse" />
            <span>Stash Live Studio Broadcaster</span>
          </div>
        </div>

        {/* ── Studio Bottom Controls ── */}
        <div className="w-full max-w-3xl mt-4 space-y-3">
          {/* Live Voice Indicator */}
          {isListening && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-xl bg-[#fb8500]/15 border border-[#fb8500] flex items-center gap-3 text-xs shadow-lg"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#fb8500] animate-ping" />
              <span className="font-semibold text-[#fb8500]">Listening:</span>
              <span>{interimTranscript || 'Speak entity or topic…'}</span>
            </motion.div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-xs transition-all flex-1 select-none ${
                isListening
                  ? 'bg-[#fb8500] text-white shadow-2xl scale-[0.98]'
                  : 'bg-white text-[#1A1512] hover:bg-gray-200 active:scale-[0.98]'
              }`}
            >
              <span>{isListening ? '🎙️ Release to Generate' : '🎙️ Hold to Speak'}</span>
              <kbd className="text-[10px] px-2 py-0.5 rounded bg-black/10 font-mono">
                Alt+Shift+Space
              </kbd>
            </button>

            {activeCard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveCard(null)}
                className="h-12 px-4 text-xs border-white/20 text-gray-300 hover:bg-white/10"
              >
                Clear Card
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
              placeholder="Or type a topic: Ranbir Kapoor, Q2 Revenue, Fable 5, Postgres vs Dynamo…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 text-xs h-10"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!manualInput.trim() || isGenerating}
              className="h-10 px-4 text-xs bg-[#fb8500] hover:bg-[#ea7700] text-white"
            >
              Generate
            </Button>
          </form>

          {/* Suggested Topics */}
          <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
            <span className="text-[11px] text-gray-500">Quick queries:</span>
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.label}
                type="button"
                onClick={() => void handleGenerate(topic.prompt)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:border-[#fb8500] hover:text-white transition-colors"
              >
                {topic.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Google Meet Presentation Modal ── */}
      {showMeetHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#1A1512] border border-white/15 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Broadcasting to Google Meet</h3>
              <button onClick={() => setShowMeetHelp(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              You can broadcast your Stash Live stage directly into any Google Meet call with 0 installations:
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="font-semibold text-[#fb8500]">Option 1: Share this Tab (Instant 1080p 60fps)</span>
                <p className="text-gray-400">
                  In Google Meet, click <strong>Present now ➔ A Tab</strong> and select this <strong>Stash Live Studio</strong> tab. Your video and dynamic cards stream with crystal clarity.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="font-semibold text-[#fb8500]">Option 2: Google Meet In-Meeting Add-on</span>
                <p className="text-gray-400">
                  Launch the Stash Live Add-on inside Meet&apos;s Side Panel or Main Stage using the official Google Meet SDK.
                </p>
                <Link
                  to="/meet-addon"
                  target="_blank"
                  className="inline-block mt-2 text-[#fb8500] underline font-medium"
                >
                  Open In-Meeting Add-on Preview ↗
                </Link>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMeetHelp(false)}
                className="border-white/20 text-white"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
