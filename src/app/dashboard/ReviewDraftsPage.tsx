import { useEffect, useState } from 'react';
import { GlassCard } from '@stash/card-react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';

/**
 * Review drafts (plan §4.3): the Notion inference approval screen,
 * `status: draft` → `approved`.
 */
export default function ReviewDraftsPage() {
  const { getAccessToken } = useAuth();
  const [drafts, setDrafts] = useState<ApiCard[] | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.listCards({ status: 'draft' }).then(setDrafts);
  }, [getAccessToken]);

  async function approve(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    await api.approveCard(card.id);
    setDrafts((prev) => prev?.filter((c) => c.id !== card.id) ?? null);
  }

  async function reject(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    await api.deleteCard(card.id);
    setDrafts((prev) => prev?.filter((c) => c.id !== card.id) ?? null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Review drafts
      </h1>
      <p className="text-sm" style={{ color: '#5A5550' }}>
        Cards Stash Live inferred from your connected sources. Nothing goes live until you approve
        it.
      </p>

      {drafts?.length === 0 && (
        <p className="text-sm" style={{ color: '#5A5550' }}>
          No drafts waiting for review.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {drafts?.map((card) => (
          <div
            key={card.id}
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(26,21,18,0.06)' }}
          >
            <div className="flex justify-center">
              <GlassCard spec={card.spec} width={260} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => approve(card)}>
                Approve
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => reject(card)}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
