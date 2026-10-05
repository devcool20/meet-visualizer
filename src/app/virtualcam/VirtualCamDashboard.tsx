import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { GlassCard } from '@stash/card-react';
import type { CardSpec } from '@stash/card-spec';
import { Pill, StatusDot, Surface, Telemetry } from '@/app/components/primitives';
import { useReducedMotion } from '@/app/motion';

const SAMPLE_TOPICS = [
  'Ranbir Kapoor',
  'Stash Live YC W25 Pitch Metrics & Traction',
  'Q2 SaaS Revenue and Growth',
  'Postgres vs DynamoDB for High Scale',
  'Fable 5 Gameplay Release Notes',
];

export function VirtualCamDashboard() {
  const reduced = useReducedMotion();
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
    <div className="studio flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-[var(--gutter)] py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <StatusDot tone="success" pulse />
          <h1 className="flex items-center gap-2.5 font-serif text-lg font-normal tracking-tight text-foreground">
            Virtual camera
            <Pill tone="success">DirectShow · 60 FPS</Pill>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusDot tone="success" />
            Device <Telemetry className="text-foreground">Stash Live Camera</Telemetry>
          </span>

          <a
            href="https://meet.google.com"
            target="_blank"
            rel="noopener noreferrer"
           className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-brand transition-all hover:bg-brand-hover"
          >
            Open Google Meet ↗
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-[var(--gutter)] py-6 lg:grid-cols-3">
        {/* Left 2 Cols: Live Camera Feed Preview */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-card border border-border bg-card shadow-lifted">
            {/* Realtime Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full -scale-x-100 object-cover"
            />

            {/* Over-the-shoulder Glass Card */}
            <AnimatePresence>
              {activeCard && (
                <motion.div
                  initial={{ opacity: 0, x: positionMode === 'left' ? -60 : 60, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: positionMode === 'left' ? -60 : 60, scale: 0.95 }}
                  transition={
                    reduced
                      ? { duration: 0.01 }
                      : { type: 'spring', damping: 22, stiffness: 260 }
                  }
                  className={`pointer-events-none absolute top-6 z-20 drop-shadow-2xl ${
                    positionMode === 'left' ? 'left-6' : 'right-6'
                  }`}
                >
                  <GlassCard spec={activeCard} width={340} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating HUD pill */}
            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3 rounded-full border border-border bg-black/70 px-4 py-2 text-xs text-foreground backdrop-blur">
              <StatusDot tone={isListening ? "brand" : "success"} pulse />
              <Telemetry className="font-medium tracking-wide">
                {isListening ? "Generating card…" : "Virtual cam active"}
              </Telemetry>
              <span aria-hidden className="text-muted-subtle">|</span>
              <Telemetry className="text-muted-foreground">
                1280x720 @ {streamFps}fps
              </Telemetry>
            </div>

            {/* Hotkey badge */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-md border border-border bg-black/60 px-3 py-1.5 text-[0.6875rem] text-muted-foreground backdrop-blur">
              <Telemetry className="rounded bg-accent px-1.5 py-0.5 font-bold text-foreground">Alt</Telemetry>+
              <Telemetry className="rounded bg-accent px-1.5 py-0.5 font-bold text-foreground">Shift</Telemetry>+
              <Telemetry className="rounded bg-accent px-1.5 py-0.5 font-bold text-foreground">Space</Telemetry>
            </div>
          </div>

          {/* Quick trigger topics */}
          <div className="flex flex-col gap-2.5">
            <span className="eyebrow text-muted-subtle">Quick triggers</span>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => void handleGenerate(topic)}
                 className="rounded-full border border-border bg-accent/60 px-3 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:border-brand/40 hover:text-brand active:scale-95"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Controls & Meet Instructions */}
        <div className="flex flex-col gap-6">
          {/* Card trigger box */}
          <Surface className="flex flex-col gap-4 p-5">
            <h2 className="eyebrow">Custom topic generator</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualInput.trim()) {
                  void handleGenerate(manualInput);
                  setManualInput("");
                }
              }}
              className="flex items-center gap-2"
            >
              <Input
                placeholder="Revenue, team size, Q3 goals…"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                aria-label="Topic to generate a card for"
               className="border-border bg-input-background text-xs text-foreground"
              />
              <Button type="submit" size="sm" className="bg-brand text-white hover:bg-brand-hover">
                Generate
              </Button>
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Card position</span>
              <div
               className="flex gap-1 rounded-md border border-border bg-accent/60 p-1 text-xs"
                role="group"
                aria-label="Card position"
              >
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setPositionMode(side)}
                    aria-pressed={positionMode === side}
                    className={`rounded-sm px-3 py-1 capitalize transition-all duration-200 ${
                      positionMode === side
                        ? "bg-brand font-semibold text-white"
                        : "text-muted-foreground hover:text-foreground"
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
               className="w-full border-border-strong text-xs text-muted-foreground hover:bg-accent"
              >
                Dismiss card
              </Button>
            )}
          </Surface>

          {/* Google Meet setup guide */}
          <Surface className="flex flex-col gap-3 rounded-card p-5">
            <div className="flex items-center gap-2">
              <StatusDot tone="success" />
              <h2 className="eyebrow text-success">Google Meet setup</h2>
            </div>

            <ol className="prose-body flex list-decimal flex-col gap-2.5 pl-4 text-xs leading-relaxed">
              <li>
                Join your <strong className="text-foreground">Google Meet</strong> call.
              </li>
              <li>
                Click <strong className="text-foreground">More options → Settings → Video</strong>.
              </li>
              <li>
                Under <strong className="text-foreground">Camera</strong>, select{" "}
                <Telemetry className="text-success">Stash Live Camera</Telemetry>.
              </li>
              <li>Your tile in Meet now shows you with cards over your shoulder.</li>
            </ol>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
              <span>Driver registration</span>
              <Telemetry className="rounded bg-background-sunken px-2 py-0.5 text-foreground">
                npm run virtualcam:install
              </Telemetry>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
