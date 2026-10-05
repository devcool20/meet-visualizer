/**
 * Activity — the match log.
 *
 * This is a timeline, so it is now presented as one: events grouped by day,
 * each row carrying a real relative timestamp, the card title as the primary
 * identifier rather than muted grey, and the confidence score in telemetry
 * mono. Previously the primary identifier was the least prominent thing on the
 * row, there were no timestamps at all, and "Add phrase" gave no feedback.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity as ActivityIcon, Plus, Check } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiActivityEvent, type ApiCard } from "@/lib/api";
import {
  EmptyState,
  Pill,
  SkeletonRows,
  StatusMessage,
  Surface,
  Telemetry,
} from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";
import { PageHeader } from "./PageHeader";

/** Plain-language outcome, never an internal token. */
const KIND_COPY: Record<
  ApiActivityEvent["kind"],
  { label: string; tone: "brand" | "neutral"; note: string }
> = {
  fired: { label: "Fired", tone: "brand", note: "Card projected onto the feed" },
  near_miss: { label: "Near miss", tone: "neutral", note: "Close, but below the confidence threshold" },
  suppressed_cooldown: {
    label: "Held back",
    tone: "neutral",
    note: "Same card fired moments earlier, so it was held",
  },
};

/** "4m ago" / "3h ago" / "12 Mar" — a log needs recency, not an ISO string. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export default function ActivityPage() {
  const { getAccessToken } = useAuth();
  const [events, setEvents] = useState<ApiActivityEvent[] | null>(null);
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api
      .listActivity()
      .then(setEvents)
      .catch(() => setError("Could not load activity. Check your connection and try again."));
    api.listCards().then(setCards).catch(() => setCards([]));
  }, [getAccessToken]);

  const grouped = useMemo(() => {
    if (!events) return [];
    const buckets = new Map<string, ApiActivityEvent[]>();
    for (const event of [...events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )) {
      const key = dayKey(event.createdAt);
      const list = buckets.get(key);
      if (list) list.push(event);
      else buckets.set(key, [event]);
    }
    return [...buckets.entries()];
  }, [events]);

  async function addPhraseToCard(event: ApiActivityEvent) {
    if (!event.snippet || !event.cardId) return;
    const card = cards.find((c) => c.id === event.cardId);
    if (!card) return;
    const api = getApiClient(getAccessToken);
    // Optimistic local update — otherwise the row silently changes nothing and
    // the button appears broken.
    const nextPhrases = card.phrases.includes(event.snippet)
      ? card.phrases
      : [...card.phrases, event.snippet];
    const updated = await api.updateCard(card.id, { phrases: nextPhrases });
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSavedIds((prev) => [...prev, event.id]);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Telemetry"
        title="Activity"
        description="Every time the engine considered a card, whether or not it fired. Near misses are the fastest way to tune your phrases."
      />

      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {events === null && !error && <SkeletonRows count={4} />}

      {events !== null && events.length === 0 && (
        <EmptyState
          icon={<ActivityIcon className="size-5" strokeWidth={1.7} />}
          title="No activity yet"
          description="Once you speak in a rehearsal or a live meeting, every match decision will be logged here with its confidence score."
          action={
            <Button asChild variant="outline">
              <a href="/rehearse">Open rehearsal</a>
            </Button>
          }
        />
      )}

      {grouped.map(([day, dayEvents]) => (
        <section key={day} aria-label={day} className="space-y-3">
          <h2 className="eyebrow">{day}</h2>
          <ul className="space-y-2">
            {dayEvents.map((event) => {
              const card = cards.find((c) => c.id === event.cardId);
              const copy = KIND_COPY[event.kind];
              const saved = savedIds.includes(event.id);

              return (
                <li key={event.id}>
                  <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Pill tone={copy.tone}>{copy.label}</Pill>
                        {/* The card is the subject of the row — give it the
                            strongest type on the line. */}
                        <span className="truncate font-medium text-foreground">
                          {card?.title ?? "Unknown card"}
                        </span>
                        {event.score !== null && (
                          <Telemetry className="text-xs text-muted-foreground">
                            {Math.round(event.score * 100)}%
                          </Telemetry>
                        )}
                        <Telemetry className="ml-auto shrink-0 text-xs text-muted-subtle">
                          {relativeTime(event.createdAt)}
                        </Telemetry>
                      </div>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {event.snippet ? (
                          <p className="min-w-0 truncate text-sm italic text-muted-foreground">
                            &ldquo;{event.snippet}&rdquo;
                          </p>
                        ) : (
                          <p className="text-sm text-muted-subtle">Transcript snippet not recorded</p>
                        )}
                        <span className="text-xs text-muted-subtle">{copy.note}</span>
                      </div>
                    </div>

                    {event.snippet && event.cardId && (
                      <Button
                        variant={saved ? "ghost" : "outline"}
                        size="sm"
                        disabled={saved}
                        onClick={() => addPhraseToCard(event)}
                        className={cn("shrink-0", saved && "text-success")}
                      >
                        {saved ? (
                          <>
                            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                            Phrase added
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
                            Add phrase to card
                          </>
                        )}
                      </Button>
                    )}
                  </Surface>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
