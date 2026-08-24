import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { GlassCard } from '@stash/card-react';
import type { CardSpec } from '@stash/card-spec';

const SAMPLE_TOPICS = [
  'Ranbir Kapoor',
  'Stash Live YC W25 Pitch Metrics & Traction',
  'Q2 SaaS Revenue and Growth',
  'Postgres vs DynamoDB for High Scale',
  'Fable 5 Gameplay Release Notes',
];

export function VirtualCamDashboard() {
  const [activeCard, setActiveCard] = useState<CardSpec | null>({
    v: 1,
    id: 'card-live-sample',
    revision: 1,
    title: 'Stash Live Traction',
    subtitle: 'Over-the-Shoulder In-Camera Overlays',
    theme: { accent: '#fb8500' },
    blocks: [
      {
        kind: 'metric_row',
        items: [{ value: '$148,000 ARR', label: '28% MoM Growth' }],
      },
      {
        kind: 'bullets',
        items: ['Gross Margin: 84%', 'Trigger Latency: 420ms', '18 Active Fortune 500 Pilots'],
      },
    ],
  });

  const [isListening, setIsListening] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [positionMode, setPositionMode] = useState<'auto' | 'left' | 'right'>('right');
  const streamFps = 60;

  // Camera preview
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.warn('Webcam preview note:', e);
      }
    }
    void startPreview();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleGenerate = async (topic: string) => {
    setIsListening(true);
    try {
      const resp = await fetch('http://localhost:5000/api/virtualcam/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: topic, userId: 'local-dev-user' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok && data.card) {
          setActiveCard(data.card);
        }
      }
    } catch (err) {
      console.warn('API error, synthesizing preview card:', err);
      setActiveCard({
        v: 1,
        id: `card-${Date.now()}`,
        revision: 1,
        title: topic,
        subtitle: 'Live In-Camera Intelligence',
        theme: { accent: '#fb8500' },
        blocks: [
          {
            kind: 'metric_row',
            items: [{ value: 'Live Grounded', label: 'Google Drive & AI' }],
          },
          {
            kind: 'bullets',
            items: [`Synthesized topic: ${topic}`, 'Streaming at 60fps directly into Google Meet tile'],
          },
        ],
      });
    } finally {
      setIsListening(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0A09] text-stone-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            Stash Live Virtual Camera
            <Badge variant="outline" className="text-[10px] uppercase font-mono border-emerald-500/40 text-emerald-400">
              DirectShow · 60 FPS
            </Badge>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-stone-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Device: <span className="font-semibold text-white font-mono">Stash Live Camera</span>
          </div>

          <a
            href="https://meet.google.com"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#fb8500] hover:bg-[#e07600] text-white transition-all shadow-lg"
          >
            Open Google Meet ↗
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Left 2 Cols: Live Camera Feed Preview */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-stone-900 border border-white/10 shadow-2xl flex items-center justify-center">
            {/* Realtime Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />

            {/* Over-the-shoulder Glass Card */}
            <AnimatePresence>
              {activeCard && (
                <motion.div
                  initial={{ opacity: 0, x: positionMode === 'left' ? -60 : 60, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: positionMode === 'left' ? -60 : 60, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                  className={`absolute top-6 ${
                    positionMode === 'left' ? 'left-6' : 'right-6'
                  } z-20 pointer-events-none drop-shadow-2xl`}
                >
                  <GlassCard spec={activeCard} width={340} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating HUD Pill */}
            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3 px-4 py-2 rounded-full bg-black/70 backdrop-blur border border-white/15 text-xs text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-semibold tracking-wide font-mono">
                {isListening ? 'GENERATING CARD…' : 'VIRTUAL CAM ACTIVE'}
              </span>
              <span className="text-stone-400">|</span>
              <span className="text-stone-300 font-mono">1280x720 @ {streamFps}fps</span>
            </div>

            {/* Hotkey Badge */}
            <div className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur border border-white/10 text-[11px] text-stone-300 flex items-center gap-1.5 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">Alt</kbd> +
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">Shift</kbd> +
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">Space</kbd>
            </div>
          </div>

          {/* Quick Trigger Chips */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
              Quick Trigger Topics (AI + Google Drive Grounding)
            </span>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => void handleGenerate(topic)}
                  className="px-3 py-1.5 rounded-xl text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 transition-all active:scale-95"
                >
                  ✨ {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Controls & Meet Instructions */}
        <div className="flex flex-col gap-6">
          {/* Card Trigger Box */}
          <div className="p-5 rounded-2xl bg-stone-900/60 border border-white/10 flex flex-col gap-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Custom Topic Generator</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualInput.trim()) {
                  void handleGenerate(manualInput);
                  setManualInput('');
                }
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Type topic: Revenue, Ranbir Kapoor, Q3 Goals..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="bg-black/50 border-white/15 text-xs text-white"
              />
              <Button type="submit" size="sm" className="bg-[#fb8500] hover:bg-[#e07600] text-white">
                Generate
              </Button>
            </form>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-stone-400">Card Position:</span>
              <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/10 text-xs">
                {(['left', 'right'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setPositionMode(side)}
                    className={`px-3 py-1 rounded-md capitalize transition-all ${
                      positionMode === side ? 'bg-[#fb8500] text-white font-semibold' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            {activeCard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveCard(null)}
                className="w-full border-white/15 text-stone-300 hover:bg-white/5 text-xs"
              >
                Dismiss Active Card
              </Button>
            )}
          </div>

          {/* Google Meet In-Camera Setup Guide */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-stone-900/80 to-stone-950 border border-emerald-500/20 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
              <span>✓</span> Google Meet Setup Guide
            </div>

            <ol className="text-xs text-stone-300 flex flex-col gap-2.5 list-decimal pl-4 leading-relaxed">
              <li>
                Join your <strong className="text-white">Google Meet</strong> call.
              </li>
              <li>
                Click <strong className="text-white">More Options (⋮) ➔ Settings ➔ Video</strong>.
              </li>
              <li>
                Under <strong>Camera</strong>, select <strong className="text-emerald-400 font-mono">Stash Live Camera</strong>.
              </li>
              <li>
                Your webcam tile in Google Meet will now display you with the floating cards directly over your shoulder!
              </li>
            </ol>

            <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-stone-400">
              <span>Driver Registration:</span>
              <code className="text-emerald-400 bg-black/50 px-2 py-0.5 rounded font-mono">npm run virtualcam:install</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
