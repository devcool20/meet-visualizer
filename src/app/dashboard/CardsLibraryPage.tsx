/**
 * Cards library.
 *
 * Tiles now use the shared glass surface, one radius, and one badge treatment.
 * The two tile types that previously differed only by a hand-tuned border
 * alpha are now distinguished by an actual affordance: an accent rule on AI
 * cards.
 */
import { useEffect, useState } from "react";
import { GlassCard } from "@stash/card-react";
import { Layers } from "lucide-react";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiCard } from "@/lib/api";
import { listGeneratedCards, removeGeneratedCard, type RecentAiCard } from "@/lib/rehearsal";
import {
  Action,
  EmptyState,
  Pill,
  SkeletonRows,
  StatusMessage,
  Surface,
} from "@/app/components/primitives";
import { PageHeader } from "./PageHeader";

const SOURCE_LABEL: Record<string, string> = {
  sample: "Sample",
  ai: "AI",
  notion: "Notion",
};

export default function CardsLibraryPage() {
  const { getAccessToken } = useAuth();
  const [cards, setCards] = useState<ApiCard[] | null>(null);
  const [recentAiCards, setRecentAiCards] = useState<RecentAiCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api
      .listCards()
      .then(setCards)
      .catch(() => setError("Could not load your cards. Check your connection and try again."));
    setRecentAiCards(listGeneratedCards());
  }, [getAccessToken]);

  async function toggleEnabled(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    const updated = await api.updateCard(card.id, { enabled: !card.enabled });
    setCards((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
  }

  async function saveToLibrary(aiCard: RecentAiCard) {
    const api = getApiClient(getAccessToken);
    await api.createCard({
      title: aiCard.title,
      spec: aiCard.spec as never,
      phrases: [],
      source: "ai",
      status: "draft",
      enabled: false,
    });
    removeGeneratedCard(aiCard.id);
    setRecentAiCards(listGeneratedCards());
    setCards(await api.listCards());
  }

  function discardAiCard(aiCard: RecentAiCard) {
    removeGeneratedCard(aiCard.id);
    setRecentAiCards(listGeneratedCards());
  }

  const hasDrafts = cards?.some((c) => c.status === "draft") ?? false;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Library"
        title="Cards"
        description="Every card Stash Live can project on your feed. Toggle one on and it becomes matchable the moment you speak."
        actions={
          hasDrafts ? (
            <Button asChild variant="outline">
              <a href="/dashboard/review">Review drafts</a>
            </Button>
          ) : undefined
        }
      />

      {error && <StatusMessage tone="danger">{error}</StatusMessage>}

      {/* Recent AI generations — a transient shelf above the permanent library. */}
      {recentAiCards.length > 0 && (
        <section aria-labelledby="recent-ai-heading" className="space-y-4">
          <h2 id="recent-ai-heading" className="eyebrow">
            Generated this session
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {recentAiCards.map((aiCard) => (
              <Surface
                key={aiCard.id}
                tone="brand"
               className="relative flex flex-col gap-4 overflow-hidden p-5"
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand" />
                <div className="flex justify-center py-1">
                  <GlassCard spec={aiCard.spec as never} width={230} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveToLibrary(aiCard)}>
                    Save to library
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => discardAiCard(aiCard)}>
                    Discard
                  </Button>
                </div>
              </Surface>
            ))}
          </div>
        </section>
      )}

      {/* Library */}
      <section aria-labelledby="library-heading" className="space-y-5">
        <h2 id="library-heading" className="sr-only">
          Your cards
        </h2>

        {cards === null && !error && <SkeletonRows count={3} />}

        {cards !== null && cards.length === 0 && (
          <EmptyState
            icon={<Layers className="size-5" strokeWidth={1.7} />}
            title="No cards yet"
            description="Rehearse with a prompt and Stash Live will draft your first card for you to review."
            action={<Action to="/rehearse" variant="primary">Create your first card</Action>}
          />
        )}

        {cards !== null && cards.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {cards.map((card) => (
              <Surface key={card.id} className="flex flex-col gap-4 p-5" data-testid="card-tile">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={card.source === "ai" ? "brand" : "neutral"}>
                      {SOURCE_LABEL[card.source] ?? card.source}
                    </Pill>
                    {card.status === "draft" && <Pill tone="brand">Draft</Pill>}
                  </div>
                  <Switch
                    checked={card.enabled}
                    onCheckedChange={() => toggleEnabled(card)}
                    aria-label={`Enable ${card.title}`}
                  />
                </div>

                <div className="flex justify-center py-1">
                  <GlassCard spec={card.spec} width={252} />
                </div>

                {card.phrases.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {card.phrases.slice(0, 4).map((phrase) => (
                      <li
                        key={phrase}
                       className="rounded-full bg-accent px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        &ldquo;{phrase}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <a href={`/dashboard/cards/${card.id}`}>Edit card</a>
                  </Button>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
