/**
 * Minimal SpeechRecognition types for the Web Speech API.
 * These are available in Chromium browsers but may not be in TS lib.
 */
declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

/**
 * Hold-to-talk hook for `/rehearse` (D4).
 *
 * Starts `webkitSpeechRecognition` on key/pointer press, stops on release,
 * returns the final transcript. Designed to be the sole speech owner on the
 * product origin.
 *
 * DUPLICATE-LISTENER HAZARD (see plan §11 Q1):
 * The extension content script matches `https://meet-visualizer.vercel.app/*`
 * and starts `WebSpeechProvider` unconditionally at load. If it binds
 * Alt+Shift+Space, `/rehearse` will have two independent recognizers
 * competing for the same microphone — two transcripts, potentially two
 * generate calls.
 *
 * Preferred fix when unifying (extension-owned):
 * The extension skips its keybinding and speech provider when
 * `location.origin === PRODUCT_ORIGIN` (the dashboard is not a meeting
 * surface), and this dashboard hook remains the single owner on that origin.
 *
 * This hook injects an optional SpeechRecognition constructor for testing
 * and provides a fallback to textarea input on non-Chromium browsers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type HoldToTalkState =
  | { phase: 'idle' }
  | { phase: 'listening' }
  | { phase: 'transcribing' }
  | { phase: 'generating' }
  | { phase: 'shown' }
  | { phase: 'failed'; error: string }
  | { phase: 'unsupported' };

export interface HoldToTalkOptions {
  /** Inject a custom SpeechRecognition constructor (for tests). */
  SpeechRecognition?: new () => SpeechRecognition;
}

function isChordPressed(e: KeyboardEvent): boolean {
  // Support Alt+Space, Ctrl+Space, Alt+Shift+Space, or Ctrl+Shift+Space (avoids OS Alt+Space system menu conflict)
  if (e.code !== 'Space') return false;
  return (e.altKey && !e.ctrlKey) || (e.ctrlKey && !e.altKey) || (e.altKey && e.shiftKey);
}

export function useHoldToTalk(opts: HoldToTalkOptions = {}) {
  const [state, setState] = useState<HoldToTalkState>({ phase: 'idle' });
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const heldRef = useRef(false);

  // Detect speech recognition support.
  const RecognitionCtor = opts.SpeechRecognition ??
    (typeof window !== 'undefined'
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined) as (new () => SpeechRecognition) | undefined;

  const startListening = useCallback(() => {
    if (!RecognitionCtor) {
      setState({ phase: 'unsupported' });
      return;
    }
    if (heldRef.current) return;
    heldRef.current = true;
    setTranscript('');
    setState({ phase: 'listening' });

    try {
      const recognition = new RecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        if (fullTranscript.trim()) {
          setTranscript(fullTranscript.trim());
        }
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          setState({ phase: 'transcribing' });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        heldRef.current = false;
        // Ignore 'no-speech' or 'aborted' if we already captured transcript
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setState((prev) => (prev.phase === 'listening' ? { phase: 'transcribing' } : prev));
          return;
        }
        setState({ phase: 'failed', error: event.error || 'recognition error' });
      };

      recognition.onend = () => {
        heldRef.current = false;
        // If we were listening, transition to transcribing so generation triggers
        setState((prev) => (prev.phase === 'listening' ? { phase: 'transcribing' } : prev));
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      heldRef.current = false;
      setState({
        phase: 'failed',
        error: err instanceof Error ? err.message : 'Failed to start speech recognition',
      });
    }
  }, [RecognitionCtor]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
      recognitionRef.current = null;
    }
    heldRef.current = false;
  }, []);

  const startGenerating = useCallback(() => {
    setState({ phase: 'generating' });
  }, []);

  const markShown = useCallback(() => {
    setState({ phase: 'shown' });
  }, []);

  const markFailed = useCallback((error: string) => {
    setState({ phase: 'failed', error });
    heldRef.current = false;
  }, []);

  const reset = useCallback(() => {
    setState({ phase: 'idle' });
    setTranscript('');
    heldRef.current = false;
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Keyboard event handlers.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const currentPhase = stateRef.current.phase;
      if (isChordPressed(e) && (currentPhase === 'idle' || currentPhase === 'shown' || currentPhase === 'failed')) {
        e.preventDefault();
        startListening();
      }
    },
    [startListening],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if ((e.key === 'Alt' || e.key === 'Shift' || e.key === 'Control' || e.code === 'Space') && stateRef.current.phase === 'listening') {
        stopListening();
      }
    },
    [stopListening],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    state,
    setState,
    transcript,
    startListening,
    stopListening,
    startGenerating,
    markShown,
    markFailed,
    reset,
  };
}
