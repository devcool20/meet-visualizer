/**
 * Live captions and the reaction layer.
 *
 * Captions here are **participant-broadcast transcripts**, not server-side
 * speech recognition: each speaker recognises their own voice locally and
 * relays the text as data over the signalling socket. That keeps audio where it
 * belongs â€” on the peer connections â€” and avoids shipping anyone's speech
 * through an ASR provider mid-call. The trade-off is honest and visible: the
 * panel says captions come from speakers' devices.
 *
 * Interim lines are shown live and replaced by the final one; finalised lines
 * settle into a rolling transcript so a presenter who reads the captions can
 * actually find what was said.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/app/components/ui/utils';
import { useMeetingContext } from '../MeetingProvider';
import type { ReactionEntry } from '../hooks/useMeetingSocket';

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

export function CaptionsOverlay() {
  const ctx = useMeetingContext();

  const { interim, finals } = useMemo(() => {
    const lastInterim = [...ctx.captions].reverse().find((c) => !c.final) ?? null;
    return {
      interim: lastInterim,
      finals: ctx.captions.filter((c) => c.final).slice(-3),
    };
  }, [ctx.captions]);

  if (!ctx.captionsOn) return null;

  // Be explicit about the mechanism. A room of people assuming captions come
  // from a server would be badly misled if they did not.
  const note = 'Transcribed on this device only — your audio never leaves the peer connection.';

  const lines = interim
    ? [...finals, interim]
    : finals.slice(-2);

  if (lines.length === 0) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
        <p className="rounded-full bg-background/75 px-3.5 py-1.5 text-[0.75rem] text-muted-foreground backdrop-blur-md">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5 px-4"
      aria-live="polite"
      aria-label="Live captions"
    >
      <div className="flex max-w-[min(46rem,90vw)] flex-col items-center gap-1">
        {lines.map((line) => (
          <p
            key={line.key}
            className={cn(
              'max-w-full rounded-lg px-3 py-1 text-center text-[0.9375rem] leading-snug backdrop-blur-md',
              line.final ? 'bg-background/70 text-foreground/80' : 'bg-background/88 text-foreground font-medium',
            )}
          >
            <span className="mr-1.5 text-[0.75rem] font-medium text-brand">{line.name}</span>
            {line.text}
          </p>
        ))}
      </div>
      <p className="rounded-full bg-background/60 px-2.5 py-1 text-[0.6875rem] text-muted-foreground backdrop-blur-md">
        {note}
      </p>
    </div>
  );
}

/** The scrollable transcript, for a presenter who wants to read back. */
export function CaptionTranscript() {
  const ctx = useMeetingContext();
  const finals = ctx.captions.filter((c) => c.final);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [finals.length]);

  if (finals.length === 0) {
    return <p className="p-4 text-[0.8125rem] leading-relaxed text-muted-foreground">Nothing has been said yet.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {finals.map((line) => (
        <p key={line.key} className="text-[0.875rem] leading-relaxed text-foreground">
          <span className="mr-1.5 text-[0.75rem] font-medium text-brand">{line.name}</span>
          {line.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reactions                                                           */
/* ------------------------------------------------------------------ */

interface Floating extends ReactionEntry {
  drift: number;
}

/**
 * Reactions float up from the sender's tile and die on their own.
 *
 * Every reaction gets a deterministic horizontal drift and duration derived
 * from its key, so a burst of the same emoji fans out instead of stacking into
 * one illegible column.
 */
export function ReactionsLayer() {
  const ctx = useMeetingContext();
  const [floating, setFloating] = useState<Floating[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const fresh = ctx.reactions.filter((r) => !seenRef.current.has(r.key));
    if (fresh.length === 0) return;
    for (const r of fresh) seenRef.current.add(r.key);
    setFloating((prev) => [...prev, ...fresh.map((r) => ({ ...r, drift: driftFor(r.key) }))]);

    const timers = fresh.map((r) =>
      setTimeout(() => {
        setFloating((prev) => prev.filter((p) => p.key !== r.key));
      }, 2600),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [ctx.reactions]);

  if (floating.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center" aria-hidden="true">
      <AnimatePresence>
        {floating.map((f) => (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -140, scale: [0.6, 1.25, 1, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.5, ease: 'easeOut' }}
            className="absolute text-3xl"
            style={{ x: f.drift * 44 }}
          >
            {f.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function driftFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) % 1000;
  return (h / 1000) * 2 - 1;
}

