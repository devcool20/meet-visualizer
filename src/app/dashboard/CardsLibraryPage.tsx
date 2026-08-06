import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';

/**
 * Cards library (plan §4.3): tiles with live `GlassCard` previews, phrase
 * chips, source badge, enable toggle, and a draft badge for unapproved
 * Notion cards.
 */
export default function CardsLibraryPage() {
  const { getAccessToken } = useAuth();
  const [cards, setCards] = useState<ApiCard[] | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards().then(setCards);
  }, [getAccessToken]);

  async function toggleEnabled(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    const updated = await api.updateCard(card.id, { enabled: !card.enabled });
    setCards((prev) => prev?.map((c) => (c.id === card.id ? updated : c)) ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Cards
        </h1>
      </div>

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
                <Badge variant="secondary">{card.source === 'sample' ? 'Sample' : 'Notion'}</Badge>
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
