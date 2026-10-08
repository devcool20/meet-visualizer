/**
 * Stash Live cards inside a meeting.
 *
 * This is the layer that turns a presenter *speaking* into a card burned into
 * the video they are transmitting. It reuses the exact machinery the rehearsal
 * page and the Chrome extension already use — `api.generateCard` against
 * `POST /api/ai/generate-card`, then a validated `CardSpec` — and adds what a
 * live room needs on top:
 *
 *  - **Four ways to put a card up.** Hold-to-talk (the rehearsal gesture,
 *    bound to a bar and to `Alt+Shift+Space`), ambient speech (the presenter
 *    just talks and the room decides), a card from the library, or a typed
 *    topic. Voice is the product; the rest are there because a demo has to be
 *    reproducible.
 *  - **Visible state.** `idle → listening → generating → live → dismissed` plus
 *    a typed failure, so the HUD never lies about what is happening.
 *  - **Latency hygiene.** Interim speech is debounced before it can trigger
 *    generation, a generation is capped by a timeout, and a newer request
 *    supersedes an older one. Without that, two people talking over each other
 *    produce two cards and the wrong one wins.
 *  - **Nothing invented.** The card comes from the engine, is validated with
 *    `parseCardSpec`, and a rejected card never reaches the compositor.
 *
 * Audio privacy: the Web Speech recogniser runs in this browser and its output
 * is sent to the engine as a short utterance for grounding. The room's audio
 * stream is never read by this hook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseCardSpec, type CardSpec, type UserSettings } from '@stash/card-spec';
import { getApiClient, ApiError, type ApiCard } from '@/lib/api';
import { recordGeneratedCard } from '@/lib/rehearsal';

export type CardPhase = 'idle' | 'listening' | 'generating' | 'live' | 'failed' | 'unsupported';

/** Debounce before an interim transcript is allowed to trigger a generation. */
const INTERIM_DEBOUNCE_MS = 450;

/** Hard ceiling on one generation. Beyond this the placeholder goes to error. */
const GENERATE_TIMEOUT_MS = 12_000;

/** Don't show the "generating" placeholder until the wait is actually visible. */
const PLACEHOLDER_DELAY_MS = 250;

/** How long a failure stays in the card slot before clearing itself. */
const ERROR_VISIBLE_MS = 4_500;

const MAX_TOPIC_CHARS = 220;

export interface StashCardState {
  /** The card currently on air. */
  card: CardSpec | null;
  phase: CardPhase;
  /** Interim text while listening. */
  interim: string;
  /** The utterance that produced the live card. */
  lastPrompt: string | null;
  /** Failure detail when `phase === 'failed'`. */
  error: { code: string; message: string } | null;
}

export interface UseStashLiveCardsOptions {
  /** Auth token supplier from `useAuth`. */
  getAccessToken: () => Promise<string | null>;
  /** Mirrored to the room so other participants know a card went up. */
  onBroadcast: (spec: CardSpec, topic?: string) => void;
  /** Mirrored to the room when the card comes off air. */
  onCleared: () => void;
  /** Resolves once the compositor can accept a card. */
  settings: Pick<UserSettings, 'reducedMotion' | 'position' | 'autoDismissMs'>;
  userId?: string;
  /** Injectable for tests. */
  RecognitionCtor?: SpeechRecognitionCtor;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The slice of the Web Speech API this hook uses, declared locally. */
export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export interface SpeechRecognitionResultEventLike extends Event {
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } };
  };
}

export interface UseStashLiveCardsResult extends StashCardState {
  supported: boolean;
  /** Begin listening. Safe to call when already listening. */
  startListening: () => void;
  stopListening: () => void;
  /** Generate from an explicit utterance (typed topic, library phrase, tests). */
  generateFrom: (text: string, opts?: { topicLabel?: string }) => Promise<CardSpec | null>;
  /** Put an existing card on air. */
  show: (spec: CardSpec, topic?: string) => void;
  /** Take the card off air. */
  dismiss: () => void;
  /** Library cards, for the picker's quick list. */
  library: ApiCard[];
  libraryError: string | null;
  refreshLibrary: () => Promise<void>;
  /** Arm/disarm ambient mode: every final utterance generates a card. */
  ambient: boolean;
  setAmbient: (on: boolean) => void;
}

function defaultRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : undefined;
}

/** The same chord set the rehearsal page uses, so the muscle memory carries. */
function isPushToTalkChord(e: KeyboardEvent): boolean {
  if (e.code !== 'Space') return false;
  return (e.altKey && !e.ctrlKey) || (e.ctrlKey && !e.altKey) || (e.altKey && e.shiftKey);
}

/** Plain-language copy for the engine's generation failure codes. */
export function describeFailure(code: string): string {
  switch (code) {
    case 'no_provider':
      return 'No AI provider is configured. Add a key in Settings to generate cards live.';
    case 'rate_limited':
      return 'You are generating cards faster than the limit allows. Give it a moment.';
    case 'empty':
      return 'I could not find anything worth putting on screen for that.';
    case 'timeout':
      return 'The card engine took too long to answer.';
    case 'invalid_output':
      return 'The card engine returned something I could not read.';
    default:
      return 'Card generation failed. Try rephrasing, or pick a card from your library.';
  }
}

export function useStashLiveCards(opts: UseStashLiveCardsOptions): UseStashLiveCardsResult {
  const RecognitionCtor = useMemo(
    () => opts.RecognitionCtor ?? defaultRecognition(),
    [opts.RecognitionCtor],
  );

  const [card, setCard] = useState<CardSpec | null>(null);
  const [phase, setPhase] = useState<CardPhase>('idle');
  const [interim, setInterim] = useState('');
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [ambient, setAmbient] = useState(false);
  const [library, setLibrary] = useState<ApiCard[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const heldRef = useRef(false);
  const captureRef = useRef(0);
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeholderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientRef = useRef(false);
  const settingsRef = useRef(opts.settings);
  settingsRef.current = opts.settings;
  const callbacksRef = useRef({ onBroadcast: opts.onBroadcast, onCleared: opts.onCleared });
  callbacksRef.current = { onBroadcast: opts.onBroadcast, onCleared: opts.onCleared };
  const userIdRef = useRef(opts.userId);
  userIdRef.current = opts.userId;

  ambientRef.current = ambient;

  const clearTimers = useCallback(() => {
    for (const t of [interimTimerRef, placeholderTimerRef, timeoutRef]) {
      if (t.current) clearTimeout(t.current);
      t.current = null;
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Generation                                                         */
  /* ------------------------------------------------------------------ */

  const generateFrom = useCallback(
    async (rawText: string, options: { topicLabel?: string } = {}): Promise<CardSpec | null> => {
      const text = rawText.trim().slice(0, MAX_TOPIC_CHARS);
      if (text.length < 2) {
        setPhase('failed');
        setError({ code: 'empty', message: 'Say or type a little more for me to work with.' });
        return null;
      }

      // A newer request supersedes an older one. Without this, two speakers
      // produce two cards and the slower one wins.
      const capture = ++captureRef.current;
      clearTimers();

      setPhase('generating');
      setError(null);
      setLastPrompt(text);

      placeholderTimerRef.current = setTimeout(() => {
        placeholderTimerRef.current = null;
        // Only surface the placeholder if we are still waiting on this capture.
        if (captureRef.current === capture) setPhase('generating');
      }, PLACEHOLDER_DELAY_MS);

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (captureRef.current !== capture) return;
        setPhase('failed');
        setError({ code: 'timeout', message: 'That took too long to put together. Try again.' });
      }, GENERATE_TIMEOUT_MS);

      try {
        const api = getApiClient(opts.getAccessToken);
        const result = await api.generateCard(text, 'meeting');
        if (captureRef.current !== capture) return null; // superseded

        clearTimers();

        // The engine's response is untrusted until `parseCardSpec` says so.
        const parsed = parseCardSpec(result.card);
        if (!parsed.ok) {
          setPhase('failed');
          setError({ code: 'invalid_output', message: 'That card came back malformed.' });
          return null;
        }

        setCard(parsed.value);
        setPhase('live');
        setInterim('');
        callbacksRef.current.onBroadcast(parsed.value, options.topicLabel ?? text);
        try {
          recordGeneratedCard(
            { title: parsed.value.title, spec: parsed.value, provider: result.provider ?? 'engine' },
            userIdRef.current,
          );
        } catch {
          /* the rehearsal log is a convenience, never a blocker */
        }
        return parsed.value;
      } catch (err) {
        if (captureRef.current !== capture) return null;
        clearTimers();
        // `ApiError` carries the engine's own failure code (`no_provider`,
        // `rate_limited`, `empty`, …). Anything else is a transport problem,
        // and the two need different copy.
        if (err instanceof ApiError) {
          setPhase('failed');
          setError({ code: err.code, message: err.message || describeFailure(err.code) });
          return null;
        }
        setPhase('failed');
        setError({
          code: 'internal',
          message: err instanceof Error ? err.message : 'Could not reach the card engine.',
        });
        return null;
      }
    },
    [clearTimers, opts.getAccessToken],
  );

  /* ------------------------------------------------------------------ */
  /* Direct control                                                     */
  /* ------------------------------------------------------------------ */

  const show = useCallback((spec: CardSpec, topic?: string) => {
    // A card coming out of the library is authored by us, not the engine, but
    // the compositor still deserves a validated spec.
    const parsed = parseCardSpec(spec);
    if (!parsed.ok) {
      setPhase('failed');
      setError({ code: 'invalid_output', message: 'That card could not be shown.' });
      return;
    }
    setError(null);
    setCard(parsed.value);
    setPhase('live');
    setLastPrompt(topic ?? parsed.value.title);
    callbacksRef.current.onBroadcast(parsed.value, topic ?? parsed.value.title);
  }, []);

  const dismiss = useCallback(() => {
    captureRef.current++;
    clearTimers();
    setCard(null);
    setPhase('idle');
    setError(null);
    setInterim('');
    setLastPrompt(null);
    callbacksRef.current.onCleared();
  }, [clearTimers]);

  /* ------------------------------------------------------------------ */
  /* Speech                                                             */
  /* ------------------------------------------------------------------ */

  const stopListening = useCallback(() => {
    heldRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const startListening = useCallback(() => {
    if (!RecognitionCtor) {
      setPhase('unsupported');
      return;
    }
    if (heldRef.current) return;
    heldRef.current = true;
    setInterim('');
    setError(null);
    setPhase('listening');

    let rec: SpeechRecognitionLike;
    try {
      rec = new RecognitionCtor();
    } catch (err) {
      heldRef.current = false;
      setPhase('failed');
      setError({ code: 'speech', message: err instanceof Error ? err.message : 'Speech recognition failed to start.' });
      return;
    }
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let full = '';
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        full += result[0].transcript;
        if (result.isFinal) finalText += result[0].transcript;
      }
      const trimmed = full.trim();
      setInterim(trimmed);

      // Interim text must not trigger a generation on its own: the recogniser
      // revises words constantly, and a card built from "our revenue is up
      // twen…" is worse than no card. Only debounced interims and final
      // results get through.
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (!finalText) {
        if (ambientRef.current && trimmed.length > 8) {
          interimTimerRef.current = setTimeout(() => {
            interimTimerRef.current = null;
            void generateFrom(trimmed);
          }, INTERIM_DEBOUNCE_MS);
        }
        return;
      }

      const utterance = finalText.trim();
      setInterim(utterance);
      stopListening();
      void generateFrom(utterance);
    };

    rec.onerror = (event) => {
      heldRef.current = false;
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setPhase((p) => (p === 'listening' ? 'idle' : p));
        return;
      }
      setPhase('failed');
      setError({
        code: event.error || 'speech',
        message:
          event.error === 'not-allowed'
            ? 'Microphone permission was denied for speech recognition.'
            : `Speech recognition error: ${event.error}`,
      });
    };

    rec.onend = () => {
      heldRef.current = false;
      recognitionRef.current = null;
      setPhase((p) => (p === 'listening' ? 'idle' : p));
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch {
      heldRef.current = false;
      setPhase('failed');
      setError({ code: 'speech', message: 'Could not start listening. Try again.' });
    }
  }, [RecognitionCtor, generateFrom, stopListening]);

  // Push-to-talk chord. Held, not tapped, matching the rehearsal page so the
  // gesture is identical everywhere in the product.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPushToTalkChord(e)) return;
      const target = e.target as HTMLElement | null;
      // Never hijack the chord while someone is typing.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const busy = phase === 'generating' || phase === 'listening';
      if (busy) return;
      e.preventDefault();
      startListening();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isPushToTalkChord(e) && e.code !== 'Alt' && e.code !== 'Shift' && e.code !== 'Control') return;
      if (phase === 'listening') stopListening();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase, startListening, stopListening]);

  /* ------------------------------------------------------------------ */
  /* Library                                                            */
  /* ------------------------------------------------------------------ */

  const refreshLibrary = useCallback(async () => {
    try {
      const api = getApiClient(opts.getAccessToken);
      const cards = await api.listCards({ status: 'approved' });
      setLibrary(cards);
      setLibraryError(null);
    } catch (err) {
      // A library failure must never block live generation — the room is still
      // fully usable with speech.
      setLibrary([]);
      setLibraryError(err instanceof Error ? err.message : 'Could not load your card library.');
    }
  }, [opts.getAccessToken]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  /**
   * A failed generation leaves an error placeholder in the card slot. It has to
   * leave on its own: a card-shaped "Card failed" that a presenter does not
   * know how to remove is worse than no card at all.
   */
  useEffect(() => {
    if (phase !== 'failed') return;
    const timer = setTimeout(() => {
      setPhase('idle');
      setError(null);
    }, ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    return () => {
      clearTimers();
      try {
        recognitionRef.current?.abort?.();
      } catch {
        /* best effort */
      }
    };
  }, [clearTimers]);

  return {
    card,
    phase,
    interim,
    lastPrompt,
    error,
    supported: !!RecognitionCtor,
    startListening,
    stopListening,
    generateFrom,
    show,
    dismiss,
    library,
    libraryError,
    refreshLibrary,
    ambient,
    setAmbient,
  };
}