import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';
import { listGeneratedCards, removeGeneratedCard, type RecentAiCard } from '@/lib/rehearsal';

/**
 * Cards library (plan §4.3): tiles with live `GlassCard` previews, phrase
 * chips, source badge, enable toggle, and a draft badge for unapproved
 * Notion cards.
 *
 * Above the grid, a "Recent AI cards" strip appears when there are current-session
 * AI generations, each with "Save to library" and "Discard" buttons.
 */
export default function CardsLibraryPage() {
  const { getAccessToken } = useAuth();
  const [cards, setCards] = useState<ApiCard[] | null>(null);
  const [recentAiCards, setRecentAiCards] = useState<RecentAiCard[]>([]);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards().then(setCards);
    setRecentAiCards(listGeneratedCards());
  }, [getAccessToken]);

  async function toggleEnabled(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    const updated = await api.updateCard(card.id, { enabled: !card.enabled });
    setCards((prev) => prev?.map((c) => (c.id === card.id ? updated : c)) ?? null);
  }

  async function saveToLibrary(aiCard: RecentAiCard) {
    try {
      const api = getApiClient(getAccessToken);
      await api.createCard({
        title: aiCard.title,
        spec: aiCard.spec as any,
        phrases: [],
        source: 'ai',
        status: 'draft',
        enabled: false,
      });
      // Remove from recent cards and refresh list.
      removeGeneratedCard(aiCard.id);
      setRecentAiCards(listGeneratedCards());
      const updatedCards = await api.listCards();
      setCards(updatedCards);
    } catch {
      // Ignore.
    }
  }

  function discardAiCard(aiCard: RecentAiCard) {
    removeGeneratedCard(aiCard.id);
    setRecentAiCards(listGeneratedCards());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Cards
        </h1>
      </div>

      {/* Recent AI cards strip */}
      {recentAiCards.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#5A5550' }}>
            Recent AI cards
          </h2>
          <div className="flex flex-wrap gap-4">
            {recentAiCards.map((aiCard) => (
              <div
                key={aiCard.id}
                className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(251,133,0,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">AI</Badge>
                </div>
                <div className="flex justify-center">
                  <GlassCard spec={aiCard.spec as any} width={220} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveToLibrary(aiCard)}>
                    Save to library
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => discardAiCard(aiCard)}>
                    Discard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards === null && (
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Loading…
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {cards?.map((card) => (
          <div
            key={card.id}
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
            data-testid="card-tile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{card.source === 'sample' ? 'Sample' : card.source === 'ai' ? 'AI' : 'Notion'}</Badge>
                {card.status === 'draft' && <Badge variant="outline">Draft</Badge>}
              </div>
              <Switch checked={card.enabled} onCheckedChange={() => toggleEnabled(card)} />
            </div>
            <div className="flex justify-center">
              <GlassCard spec={card.spec} width={260} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {card.phrases.slice(0, 4).map((phrase) => (
                <span
                  key={phrase}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(26,21,18,0.06)', color: '#5A5550' }}
                >
                  &ldquo;{phrase}&rdquo;
                </span>
              ))}
            </div>
            <Link to={`/dashboard/cards/${card.id}`}>
              <Button variant="outline" className="w-full">
                Edit
              </Button>
            </Link>
          </div>
        ))}
      </div>

      {cards && cards.some((c) => c.status === 'draft') && (
        <div className="pt-4">
          <Link to="/dashboard/review">
            <Button>Review drafts</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
