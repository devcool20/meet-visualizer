/**
 * Google Meet Add-on — Stash Live In-Meeting Application.
 *
 * Runs inside Google Meet's Side Panel (`SIDE_PANEL`) or Main Stage (`MAIN_STAGE`).
 * Also runs seamlessly in standalone mode for local development and direct testing.
 *
 * Features:
 * - Real-time speech recognition & hold-to-talk voice capture
 * - Live CardSpec generation via Stash Live Engine WebSocket
 * - Responsive GlassCard rendering with entity portrait images and topic recipes
 * - 1-Click "Promote to Main Stage" via Google Meet Add-ons SDK
 * - Live CoDoing state synchronization between all meeting participants
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard } from '@stash/card-react';
import type { CardSpec } from '@stash/card-spec';
import {
  meetAddonManager,
  type EffectiveFrameType,
  type MeetSessionState,
} from '@/lib/meet-addon-sdk';
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

export default function MeetAddonApp() {
  const [searchParams] = useSearchParams();
  const { getAccessToken } = useAuth();

  const [sessionState, setSessionState] = useState<MeetSessionState>({
    isMeetContext: false,
    frameType: (searchParams.get('frame') as EffectiveFrameType) || 'STANDALONE',
  });

  const [engineStatus, setEngineStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [activeCard, setActiveCard] = useState<CardSpec | null>(null);
  const [cardHistory, setCardHistory] = useState<CardSpec[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // 1. Initialize Google Meet Add-on SDK
  useEffect(() => {
    async function initSdk() {
      const state = await meetAddonManager.initialize();
      // If query param explicitly asks for a frame (e.g. testing main stage), honor it
      const frameQuery = searchParams.get('frame') as EffectiveFrameType | null;
      if (frameQuery) {
        state.frameType = frameQuery;
      }
      setSessionState(state);
    }
    void initSdk();

    // Listen for remote state updates broadcast by other participants in the call
    const unsubscribe = meetAddonManager.onRemoteCardUpdate((remoteState) => {
      if (remoteState.activeCard) {
        setActiveCard(remoteState.activeCard);
        setCardHistory((prev) => [remoteState.activeCard!, ...prev.filter((c) => c.id !== remoteState.activeCard!.id)]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [searchParams]);

  // 2. Connect to Stash Live Engine WebSocket
  useEffect(() => {
    const defaultEngineUrl = (import.meta.env.VITE_ENGINE_WS_URL || 'ws://localhost:5000').replace(/^http/, 'ws');
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setEngineStatus('connecting');
      try {
        socket = new WebSocket(defaultEngineUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          setEngineStatus('connected');
          setErrorMessage(null);
          socket?.send(
            JSON.stringify({
              t: 'hello',
              token: 'meet-addon-session',
              protocolVersion: 1,
            }),
          );
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.t === 'show' && data.card) {
              setIsGenerating(false);
              setActiveCard(data.card);
              setCardHistory((prev) => [data.card, ...prev.filter((c) => c.id !== data.card.id)]);
              // Broadcast to other participants in Google Meet
              meetAddonManager.broadcastCard(data.card, 'Presenter', data.captureId);
            } else if (data.t === 'generating') {
              setIsGenerating(true);
            } else if (data.t === 'generate_failed') {
              setIsGenerating(false);
              setErrorMessage(data.message || 'Generation failed');
            }
          } catch (e) {
            console.warn('[Stash Meet Add-on] Error handling message:', e);
          }
        };

        socket.onerror = () => {
          setEngineStatus('error');
        };

        socket.onclose = () => {
          setEngineStatus('error');
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        setEngineStatus('error');
        reconnectTimer = setTimeout(connect, 4000);
      }
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  // 3. Speech Recognition Engine (Web Speech API)
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

        rec.onerror = (e: any) => {
          if (e.error !== 'no-speech') {
            console.warn('[Stash Meet Add-on] Speech error:', e.error);
          }
        };

        rec.onend = () => {
          if (isListeningRef.current) {
            try {
              rec.start();
            } catch {}
          }
        };

        recognitionRef.current = rec;
      } catch (err) {
        console.warn('[Stash Meet Add-on] Speech init error:', err);
      }
    }
  }, []);

  const handleGenerate = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return;

      setIsGenerating(true);
      setErrorMessage(null);
      setInterimTranscript('');

      // Send via WebSocket to engine
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
        // Fallback: REST API
        try {
          const api = getApiClient(getAccessToken);
          const result = await api.generateCard(query, 'rehearsal');
          setIsGenerating(false);
          setActiveCard(result.card);
          setCardHistory((prev) => [result.card, ...prev.filter((c) => c.id !== result.card.id)]);
          meetAddonManager.broadcastCard(result.card, 'Presenter');
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

  // Global Keyboard Shortcuts (Hold Alt+Shift+Space or Hold Spacebar inside input)
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

  const handlePromoteToMainStage = async () => {
    const success = await meetAddonManager.promoteToMainStage();
    if (!success) {
      // In local dev, switch mode directly
      setSessionState((prev) => ({ ...prev, frameType: 'MAIN_STAGE' }));
    }
  };

  const isMainStage = sessionState.frameType === 'MAIN_STAGE';

  return (
    <div
      className="min-h-screen w-full flex flex-col text-[#1A1512] select-none"
      style={{
        background: isMainStage ? '#12100E' : '#FBF9F6',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ── Top Bar / Header ── */}
      <header
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{
          borderColor: isMainStage ? 'rgba(255,255,255,0.08)' : 'rgba(26,21,18,0.06)',
          background: isMainStage ? 'rgba(26,21,18,0.95)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: engineStatus === 'connected' ? '#22c55e' : engineStatus === 'connecting' ? '#fb8500' : '#ef4444',
            }}
          />
          <div>
            <h1
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}
            >
              Stash Live
            </h1>
            <span className="text-[10px]" style={{ color: isMainStage ? '#9CA3AF' : '#5A5550' }}>
              {sessionState.isMeetContext ? `Google Meet · ${sessionState.meetingCode || 'Live'}` : 'Standalone Studio'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Frame Type Badge */}
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{
              background: isMainStage ? 'rgba(251,133,0,0.2)' : 'rgba(26,21,18,0.06)',
              color: isMainStage ? '#fb8500' : '#5A5550',
            }}
          >
            {isMainStage ? 'Main Stage' : 'Side Panel'}
          </span>

          {!isMainStage && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePromoteToMainStage}
              className="text-[11px] h-7 px-2.5 border-[#fb8500]/40 text-[#fb8500] hover:bg-[#fb8500]/10"
              title="Expand to meeting main stage for all participants"
            >
              Expand to Stage
            </Button>
          )}

          {isMainStage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSessionState((prev) => ({ ...prev, frameType: 'SIDE_PANEL' }))}
              className="text-[11px] h-7 px-2 text-gray-300 border-gray-700 hover:bg-white/10"
            >
              Side View
            </Button>
          )}
        </div>
      </header>

      {/* ── Main Workspace Body ── */}
      <main className="flex-1 flex flex-col p-4 overflow-y-auto max-w-4xl mx-auto w-full">
        {/* Dynamic Card Display Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[340px] relative py-2">
          <AnimatePresence mode="wait">
            {isGenerating && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center p-6 rounded-2xl text-center space-y-3"
                style={{
                  background: isMainStage ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
                  backdropFilter: 'blur(16px)',
                  border: isMainStage ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(26,21,18,0.06)',
                  width: isMainStage ? '360px' : '280px',
                }}
              >
                <div className="w-8 h-8 rounded-full border-2 border-[#fb8500] border-t-transparent animate-spin" />
                <p className="text-xs font-medium" style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}>
                  Synthesizing card…
                </p>
                <p className="text-[11px]" style={{ color: isMainStage ? '#9CA3AF' : '#5A5550' }}>
                  Grounding entity details via Drive & Wikipedia
                </p>
              </motion.div>
            )}

            {!isGenerating && activeCard && (
              <motion.div
                key={activeCard.id || activeCard.title}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex justify-center w-full"
              >
                <GlassCard
                  spec={activeCard}
                  width={isMainStage ? 358 : 280}
                  className="shadow-2xl"
                />
              </motion.div>
            )}

            {!isGenerating && !activeCard && (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center p-6 rounded-2xl space-y-2 max-w-sm"
                style={{
                  background: isMainStage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.4)',
                  border: isMainStage ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed rgba(26,21,18,0.1)',
                }}
              >
                <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center bg-[#fb8500]/10 text-[#fb8500] text-lg font-bold">
                  🎛️
                </div>
                <h3 className="text-sm font-semibold" style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}>
                  Ready for Presentation
                </h3>
                <p className="text-xs" style={{ color: isMainStage ? '#9CA3AF' : '#5A5550' }}>
                  Hold the button below or speak naturally to materialize visual cards into Google Meet.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {errorMessage && (
            <div className="mt-3 text-xs text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
              {errorMessage}
            </div>
          )}
        </div>

        {/* ── Hold-to-Talk / Interaction Control Footer ── */}
        <div className="mt-auto space-y-3 pt-3">
          {/* Live Speech HUD Bar */}
          {isListening && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-xl flex items-center gap-3 border shadow-sm"
              style={{
                background: isMainStage ? 'rgba(251,133,0,0.15)' : '#FFF7ED',
                borderColor: '#fb8500',
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#fb8500] animate-pulse" />
              <div className="flex-1 text-xs">
                <span className="font-semibold text-[#fb8500]">Listening: </span>
                <span style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}>
                  {interimTranscript || 'Speak topic, entity, or metric…'}
                </span>
              </div>
            </motion.div>
          )}

          {/* Controls: Voice Button & Topic Text Input */}
          <div className="flex items-center gap-2">
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all flex-1 select-none ${
                isListening
                  ? 'bg-[#fb8500] text-white shadow-lg scale-[0.98]'
                  : 'bg-[#1A1512] text-white hover:bg-[#2D2520] active:scale-[0.98]'
              }`}
              style={{
                boxShadow: isListening ? '0 0 20px rgba(251,133,0,0.5)' : 'none',
              }}
            >
              <span>{isListening ? '🎙️ Release to Generate' : '🎙️ Hold to Speak'}</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-mono">
                Alt+Shift+Space
              </kbd>
            </button>

            {cardHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="h-10 px-3 text-xs"
                style={{
                  color: isMainStage ? '#FBF9F6' : '#1A1512',
                  borderColor: isMainStage ? 'rgba(255,255,255,0.15)' : 'rgba(26,21,18,0.1)',
                }}
              >
                Cards ({cardHistory.length})
              </Button>
            )}
          </div>

          {/* Quick Query Input Bar */}
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
              placeholder="Or type a topic: e.g. Ranbir Kapoor, Q2 Revenue, Fable 5…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="text-xs h-9"
              style={{
                background: isMainStage ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                color: isMainStage ? '#FBF9F6' : '#1A1512',
                borderColor: isMainStage ? 'rgba(255,255,255,0.15)' : 'rgba(26,21,18,0.1)',
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!manualInput.trim() || isGenerating}
              className="h-9 px-3 text-xs bg-[#fb8500] hover:bg-[#ea7700] text-white"
            >
              Send
            </Button>
          </form>

          {/* Topic Suggestion Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-gray-500 mr-1">Try:</span>
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.label}
                type="button"
                onClick={() => void handleGenerate(topic.prompt)}
                className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:border-[#fb8500] hover:text-[#fb8500]"
                style={{
                  background: isMainStage ? 'rgba(255,255,255,0.04)' : 'rgba(26,21,18,0.03)',
                  borderColor: isMainStage ? 'rgba(255,255,255,0.08)' : 'rgba(26,21,18,0.06)',
                  color: isMainStage ? '#D1D5DB' : '#5A5550',
                }}
              >
                {topic.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Card History Drawer ── */}
        {showHistory && cardHistory.length > 0 && (
          <div
            className="mt-4 p-3 rounded-xl border space-y-2"
            style={{
              background: isMainStage ? 'rgba(255,255,255,0.04)' : 'rgba(26,21,18,0.02)',
              borderColor: isMainStage ? 'rgba(255,255,255,0.1)' : 'rgba(26,21,18,0.08)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}>
                Recent Meeting Cards
              </span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cardHistory.map((card) => (
                <button
                  key={card.id || card.title}
                  onClick={() => {
                    setActiveCard(card);
                    meetAddonManager.broadcastCard(card, 'Presenter');
                  }}
                  className="text-left p-2 rounded-lg border text-xs transition-colors hover:border-[#fb8500]"
                  style={{
                    background: isMainStage ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                    borderColor: isMainStage ? 'rgba(255,255,255,0.08)' : 'rgba(26,21,18,0.06)',
                  }}
                >
                  <p className="font-semibold truncate" style={{ color: isMainStage ? '#FBF9F6' : '#1A1512' }}>
                    {card.title}
                  </p>
                  {card.subtitle && (
                    <p className="text-[10px] truncate text-gray-500">{card.subtitle}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
