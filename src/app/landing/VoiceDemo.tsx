/**
 * The interactive voice demo — the landing page's proof of work.
 *
 * Uses the real Web Speech API where available and falls back to a typed
 * simulator otherwise, so the demo always responds. The projected card is the
 * same renderer the extension uses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, TriangleAlert, Info } from "lucide-react";
import { GlassCard } from "@stash/card-react";
import { Pill, Surface, StatusMessage, StatusDot, Telemetry } from "@/app/components/primitives";
import { EASE, DURATION, useReducedMotion } from "@/app/motion";
import { matchTopic, TOPIC_CARDS, TOPIC_KEYS, TOPIC_METRICS, type TopicKey } from "./content";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceDemo() {
  const reduced = useReducedMotion();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speechLive, setSpeechLive] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const topic = matchTopic(input);
  const active = listening || speechLive;

  /* ── Typed simulator, used when the Web Speech API is unavailable ── */
  useEffect(() => {
    if (!listening || speechLive) return;

    setInput("");
    const keyword = TOPIC_KEYS[Math.floor(Math.random() * TOPIC_KEYS.length)];
    let char = 0;
    let typing: ReturnType<typeof setTimeout>;
    let hold: ReturnType<typeof setTimeout>;

    const step = () => {
      char += 1;
      setInput(keyword.slice(0, char));
      if (char < keyword.length) {
        typing = setTimeout(step, 150);
      } else {
        hold = setTimeout(() => {
          setInput("");
          setListening(false);
        }, 5000);
      }
    };
    typing = setTimeout(step, 320);

    return () => {
      clearTimeout(typing);
      clearTimeout(hold);
    };
  }, [listening, speechLive]);

  // Transient messages clear themselves rather than lingering as page furniture.
  useEffect(() => {
    if (!warning && !notice) return;
    const id = setTimeout(() => {
      setWarning(null);
      setNotice(null);
    }, 5000);
    return () => clearTimeout(id);
  }, [warning, notice]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* recognition already stopped */
    }
    recognitionRef.current = null;
    setListening(false);
    setSpeechLive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      stop();
      return;
    }

    setWarning(null);
    setNotice(null);
    setInput("");

    const Recognition = getRecognitionCtor();
    if (!Recognition) {
      setNotice("Speech recognition is unavailable in this browser — running the typed simulator.");
      setListening(true);
      return;
    }

    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setSpeechLive(true);
        setListening(true);
      };
      recognition.onerror = (event) => {
        setSpeechLive(false);
        setListening(true);
        setNotice(
          `Speech input is unavailable (${event.error ?? "unknown"}). Running the typed simulator.`,
        );
      };
      recognition.onend = () => setSpeechLive(false);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        const matched = matchTopic(transcript);
        if (matched) {
          setInput(matched);
          setWarning(null);
        } else {
          setInput(transcript.toLowerCase());
          setWarning(`No card matched “${transcript}”. Try: revenue, team, product, or growth.`);
        }
        setListening(false);
      };

      recognition.start();
    } catch {
      setNotice("Could not start speech input — running the typed simulator.");
      setListening(true);
    }
  }, [active, stop]);

  // Type a keyword by clicking it. The demo should never require a keyboard.
  const pickTopic = (key: TopicKey) => {
    setWarning(null);
    setNotice(null);
    setInput(key);
    if (!active) setListening(false);
  };

  return (
    <Surface tone="default" className="overflow-hidden p-6 sm:p-7">
      {/* Input row */}
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor="voice-demo-input" className="eyebrow">
          Try saying
        </label>
        <Telemetry className="text-[0.625rem] text-muted-subtle">
          {topic ? "matched" : "engine idle"}
        </Telemetry>
      </div>

      <div className="relative mt-3 flex items-center border-b border-border-strong">
        <input
          id="voice-demo-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setWarning(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") stop();
          }}
          placeholder={active ? "Listening…" : "revenue, team, product, growth"}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent py-3 pr-12 text-[1.0625rem] text-foreground outline-none placeholder:text-muted-subtle"
        />

        {/* Listening halo */}
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 size-8 -translate-y-1/2 rounded-full bg-brand/25"
            style={
              reduced
                ? undefined
                : { animation: "pulse-ring 1.7s cubic-bezier(0.16,1,0.3,1) infinite" }
            }
          />
        )}

        <button
          type="button"
          onClick={toggle}
          aria-pressed={active}
          aria-label={active ? "Stop listening" : "Start listening"}
          title={active ? "Stop listening" : "Start listening"}
         className="absolute right-0 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        >
          {active ? (
            <Mic className="size-4 text-brand" strokeWidth={2} />
          ) : (
            <Mic strokeWidth={2} className="size-4" />
          )}
        </button>
      </div>

      {/* Keyword chips double as buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {TOPIC_KEYS.map((key) => {
          const isMatch = topic === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickTopic(key)}
              aria-pressed={isMatch}
              className={`interactive rounded-full border px-3.5 py-1.5 text-[0.8125rem] capitalize ${
                isMatch
                  ? "border-brand/30 bg-warning-surface text-brand-ink"
                  : "border-border bg-accent/60 text-muted-foreground hover:border-border-strong hover:text-foreground"
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Metric strip — appears only on a match */}
      <AnimatePresence initial={false}>
        {topic && (
          <motion.div
            key={topic}
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0, marginTop: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1, marginTop: 20 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0, marginTop: 0 }}
            transition={
              reduced
                ? { duration: 0.01 }
                : { height: { duration: 0.34, ease: EASE }, opacity: { duration: 0.2 } }
            }
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2">
              {TOPIC_METRICS[topic].map((m) => (
                <div key={m.label} className="rounded-lg bg-background-sunken px-3 py-2.5">
                  <p className="text-[0.625rem] uppercase tracking-wider text-muted-subtle">{m.label}</p>
                  <p
                    className={`telemetry mt-1 text-[0.9375rem] ${
                      m.emphasis ? "text-brand" : "text-foreground"
                    }`}
                  >
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The card that would land in the call */}
      <div className="mt-6 border-t border-border pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="eyebrow">Stream overlay preview</span>
          <Pill tone={topic ? "brand" : "neutral"}>
            <StatusDot tone={topic ? "brand" : "neutral"} pulse={Boolean(topic)} />
            {topic ? "Live in meeting" : "Standing by"}
          </Pill>
        </div>

        <div className="flex min-h-[280px] items-center justify-center rounded-card bg-background-sunken p-4">
          <AnimatePresence mode="wait" initial={false}>
            {topic ? (
              <motion.div
                key={topic}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.95 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.96 }}
                transition={reduced ? { duration: 0.01 } : { duration: DURATION.base, ease: EASE }}
              >
                <GlassCard spec={TOPIC_CARDS[topic]} width={330} reducedMotion={reduced} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={reduced ? undefined : { opacity: 0 }}
                animate={reduced ? undefined : { opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0 }}
               className="flex flex-col items-center gap-3 text-center"
              >
                <div className="flex size-11 items-center justify-center rounded-full bg-accent text-muted-foreground">
                  {active ? (
                    <Mic className="size-5 text-brand" strokeWidth={1.8} />
                  ) : (
                    <MicOff className="size-5" strokeWidth={1.8} />
                  )}
                </div>
                <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                  {active
                    ? "Listening. Say a keyword, or tap one above — the card projects the moment it matches."
                    : "Speak a keyword and the matching card appears here, exactly as it would beside your shoulder in a call."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Transient state messages */}
      {(warning || notice) && (
        <div className="mt-5">
          {warning ? (
            <StatusMessage tone="danger">
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {warning}
              </span>
            </StatusMessage>
          ) : (
            <StatusMessage tone="neutral">
              <span className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {notice}
              </span>
            </StatusMessage>
          )}
        </div>
      )}
    </Surface>
  );
}
