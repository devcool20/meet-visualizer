import { useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiActivityEvent, type ApiCard } from '@/lib/api';

const KIND_LABEL: Record<ApiActivityEvent['kind'], string> = {
  fired: 'Fired',
  near_miss: 'Near miss',
  suppressed_cooldown: 'Suppressed (cooldown)',
};

/**
 * Activity (plan §4.3): fired/near-miss/suppressed events with scores;
 * text snippets only if opted in. One-click "add this phrase to that card".
 */
export default function ActivityPage() {
  const { getAccessToken } = useAuth();
  const [events, setEvents] = useState<ApiActivityEvent[]>([]);
  const [cards, setCards] = useState<ApiCard[]>([]);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listActivity().then(setEvents);
    api.listCards().then(setCards);
  }, [getAccessToken]);

  async function addPhraseToCard(event: ApiActivityEvent) {
    if (!event.snippet || !event.cardId) return;
    const card = cards.find((c) => c.id === event.cardId);
    if (!card) return;
    const api = getApiClient(getAccessToken);
    await api.updateCard(card.id, { phrases: [...card.phrases, event.snippet] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Activity
      </h1>

      {events.length === 0 && (
        <p className="text-sm" style={{ color: '#5A5550' }}>
          No activity yet. Once you speak in a rehearsal or a meeting, events will show up here.
        </p>
      )}

      <div className="space-y-2">
        {events.map((event) => {
          const card = cards.find((c) => c.id === event.cardId);
          return (
            <div
              key={event.id}
              className="rounded-xl p-3 flex items-center justify-between text-sm"
              style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
            >
              <div className="flex items-center gap-3">
                <Badge variant={event.kind === 'fired' ? 'default' : 'outline'}>{KIND_LABEL[event.kind]}</Badge>
                {card && <span style={{ color: '#5A5550' }}>{card.title}</span>}
                {event.score !== null && <span style={{ color: '#5A5550' }}>{Math.round(event.score * 100)}%</span>}
                {event.snippet && <span className="italic" style={{ color: '#5A5550' }}>&ldquo;{event.snippet}&rdquo;</span>}
              </div>
              {event.snippet && event.cardId && (
                <Button variant="outline" size="sm" onClick={() => addPhraseToCard(event)}>
                  Add phrase to card
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
