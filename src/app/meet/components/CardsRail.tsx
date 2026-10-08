/**
 * The Stash Live rail.
 *
 * Everything about cards, in one place:
 *  - **On air** — the card currently composited into your video, with a
 *    dismissal. Rendered through `GlassCard`, which obeys the same
 *    `layoutCard` numbers as the canvas compositor, so this is a true preview
 *    and not an approximation.
 *  - **Ask for one** — a typed topic field, for a demo that has to be
 *    reproducible or for a browser without speech recognition.
 *  - **Your library** — approved cards, one tap onto air.
 *  - **In this meeting** — every card anybody in the room has put up, newest
 *    first. This is the bit the platform adds: because the pixels are burned
 *    into each participant's video, only a broadcast can tell the room that
 *    the numbers on somebody's shoulder are live data.
 */
import { useState } from 'react';
import { GlassCard } from '@stash/card-react';
import { parseCardSpec } from '@stash/card-spec';
import { AlertCircle, Library, Radio, Sparkles, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { useMeetingContext } from '../MeetingProvider';
type Tab = 'live' | 'library' | 'meeting';
export function CardsRail() {
  const ctx = useMeetingContext();
  const [tab, setTab] = useState<Tab>('live');
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = ctx.stash.phase === 'generating';
  const submitTopic = async () => {
    const text = topic.trim();
    if (!text || busy) return;
    setSubmitting(true);
    setTopic('');
    await ctx.stash.generateFrom(text);
    setSubmitting(false);
    setTab('live');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs tab={tab} onChange={setTab} meetingCount={ctx.roomCards.length} libraryCount={ctx.stash.library.length} />
      {tab === 'live' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {ctx.stash.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[0.8125rem] text-destructive"
            >
              <AlertCircle className="mt-px size-4 shrink-0" />
              <span>{ctx.stash.error.message}</span>
            </div>
          ) : null}
          {ctx.stash.card ? (
            <>
              <div className="overflow-hidden rounded-panel">
                <GlassCard spec={ctx.stash.card} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
                  {ctx.stash.lastPrompt ? `“${ctx.stash.lastPrompt}”` : 'Live'}
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={ctx.dismissCard} className="rounded-full">
                  <X className="size-3.5" />
                  Take off air
                </Button>
              </div>
            </>
          ) : ctx.stash.phase === 'generating' ? (
            <GeneratingCard />
          ) : (
            <EmptyLive />
          )}
          {/* Typed topic */}
          <form
            className="flex flex-col gap-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitTopic();
            }}
          >
            <label htmlFor="stash-topic" className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
              Or ask for a card
            </label>
            <div className="flex gap-2">
              <input
                id="stash-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="our Q3 revenue by region"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3 py-2 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand disabled:opacity-60"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void submitTopic()}
                disabled={busy || topic.trim().length < 2}
                className="shrink-0 rounded-lg"
              >
                {submitting || busy ? 'Building' : 'Build'}
              </Button>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
              Cards are composited into the video you are sending, so every participant sees them without opening
              anything.
            </p>
          </form>
        </div>
      ) : null}
      {tab === 'library' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {ctx.stash.library.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Library className="size-6 text-muted-foreground" />
              <p className="text-[0.8125rem] text-foreground">No approved cards yet</p>
              <p className="max-w-[24ch] text-[0.75rem] text-muted-foreground">
                Cards you approve in your library show up here, ready to put on air in one tap.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ctx.stash.library.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => void ctx.stash.generateFrom(card.title, { topicLabel: card.title })}
                    className="w-full rounded-lg border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-card"
                  >
                    <span className="block truncate text-[0.875rem] text-foreground">{card.title}</span>
                    <span className="block truncate text-[0.75rem] text-muted-foreground">
                      {card.spec.subtitle ?? card.phrases[0] ?? card.source}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ctx.stash.libraryError ? (
            <p className="mt-4 text-[0.75rem] text-warning">{ctx.stash.libraryError}</p>
          ) : null}
        </div>
      ) : null}
      {tab === 'meeting' ? <MeetingCards /> : null}
    </div>
  );
}
/* ------------------------------------------------------------------ */
function Tabs({
  tab,
  onChange,
  meetingCount,
  libraryCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  meetingCount: number;
  libraryCount: number;
}) {
  const items: { id: Tab; label: string; count?: number }[] = [
    { id: 'live', label: 'On air' },
    { id: 'library', label: 'Library', count: libraryCount },
    { id: 'meeting', label: 'Meeting', count: meetingCount },
  ];
  return (
    <div role="tablist" aria-label="Cards" className="flex shrink-0 gap-1 border-b border-border px-2 pt-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[0.8125rem] transition-colors',
            tab === item.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
          {item.count ? (
            <span className="telemetry text-[0.6875rem] text-muted-foreground">{item.count}</span>
          ) : null}
          {tab === item.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" /> : null}
        </button>
      ))}
    </div>
  );
}
function EmptyLive() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-brand/12">
        <Radio className="size-4 text-brand" />
      </span>
      <p className="text-[0.875rem] text-foreground">Nothing on air</p>
      <p className="max-w-[30ch] text-[0.75rem] leading-relaxed text-muted-foreground">
        Hold the Stash Live button in the control bar and say what you are talking about, or type a topic below.
      </p>
      <p className="telemetry text-[0.6875rem] text-muted-foreground">Alt + Shift + Space</p>
    </div>
  );
}
function GeneratingCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-panel border border-border bg-card/50 px-4 py-6">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-4 animate-pulse text-brand" />
          <span className="text-[0.875rem] text-foreground">Building your card</span>
        </div>
        <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
          {[100, 78, 92].map((w, i) => (
            <span
              key={i}
              className="h-2.5 rounded-full bg-foreground/8"
              style={{ width: `${w}%`, animation: `pulse-ring 1.6s ${i * 0.18}s ease-in-out infinite` }}
            />
          ))}
        </div>
      </div>
      <p className="text-[0.75rem] text-muted-foreground">
        Grounding your words against your connected sources, then composing the card.
      </p>
    </div>
  );
}
function MeetingCards() {
  const ctx = useMeetingContext();
  if (ctx.roomCards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Sparkles className="size-6 text-muted-foreground" />
        <p className="text-[0.875rem] text-foreground">No cards yet</p>
        <p className="max-w-[28ch] text-[0.75rem] text-muted-foreground">
          When anyone in this meeting puts a card on air, it is kept here so the room can read it properly.
        </p>
      </div>
    );
  }
  const newest = [...ctx.roomCards].reverse();
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {newest.map((entry) => {
        const parsed = parseCardSpec(entry.card);
        if (!parsed.ok) return null;
        return (
          <li key={entry.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[0.75rem] text-muted-foreground">
                {entry.id === ctx.selfId ? 'You' : entry.name} · {new Date(entry.at).toLocaleTimeString()}
              </span>
              {ctx.stash.phase === 'live' && entry.id === ctx.selfId ? (
                <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[0.625rem] uppercase tracking-wide text-brand">
                  On air
                </span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-panel">
              <GlassCard spec={parsed.value} />
            </div>
            {entry.topic ? <p className="text-[0.6875rem] italic text-muted-foreground">“{entry.topic}”</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
