/**
 * Review drafts — the Notion inference approval screen.
 *
 * Two problems this fixes from the previous version: the tile gave you no way
 * to tell which draft you were approving (no title, no source, no phrases),
 * and "Reject" was a plain outline button that permanently deleted a card with
 * no confirmation.
 */
import { useEffect, useState } from "react";
import { GlassCard } from "@stash/card-react";
import { Check, Inbox, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiCard } from "@/lib/api";
import { EmptyState, Pill, SkeletonRows, StatusMessage, Surface } from "@/app/components/primitives";
import { PageHeader } from "./PageHeader";

export default function ReviewDraftsPage() {
  const { getAccessToken } = useAuth();
  const [drafts, setDrafts] = useState<ApiCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<ApiCard | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api
      .listCards({ status: "draft" })
      .then(setDrafts)
      .catch(() => setError("Could not load drafts. Check your connection and try again."));
  }, [getAccessToken]);

  const remove = (id: string) =>
    setDrafts((prev) => prev?.filter((c) => c.id !== id) ?? null);

  async function approve(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    await api.approveCard(card.id);
    remove(card.id);
  }

  async function reject(card: ApiCard) {
    const api = getApiClient(getAccessToken);
    await api.deleteCard(card.id);
    remove(card.id);
    setPendingReject(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Review"
        title="Drafts"
        description="Cards Stash Live inferred from your connected sources. Nothing goes live on your feed until you approve it here."
      />

      {error && <StatusMessage tone="danger">{error}</StatusMessage>}

      {drafts === null && !error && <SkeletonRows count={2} />}

      {drafts !== null && drafts.length === 0 && (
        <EmptyState
          icon={<Inbox className="size-5" strokeWidth={1.7} />}
          title="Nothing to review"
          description="Drafts appear here when Stash Live infers a card from Notion. Yours will show up the next time you connect a workspace."
          action={
            <Button asChild variant="outline">
              <a href="/dashboard/cards">Back to cards</a>
            </Button>
          }
        />
      )}

      {drafts !== null && drafts.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {drafts.map((card) => (
            <li key={card.id}>
              <Surface className="flex h-full flex-col gap-4 p-5">
                {/* Identity first — previously you had to read the card to
                    know what you were approving. */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-serif text-lg font-normal text-foreground">
                      {card.spec.title}
                    </h2>
                    {card.spec.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{card.spec.subtitle}</p>
                    )}
                  </div>
                  <Pill tone="brand">{card.source === "ai" ? "AI" : "Notion"}</Pill>
                </div>

                <div className="flex justify-center py-1">
                  <GlassCard spec={card.spec} width={248} />
                </div>

                {card.phrases.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {card.phrases.slice(0, 3).map((phrase) => (
                      <li
                        key={phrase}
                       className="rounded-full bg-accent px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        &ldquo;{phrase}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto flex gap-2">
                  <Button className="flex-1" onClick={() => approve(card)}>
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                   className="flex-1 text-destructive hover:border-destructive/40 hover:bg-destructive-surface"
                    onClick={() => setPendingReject(card)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                    Reject
                  </Button>
                </div>
              </Surface>
            </li>
          ))}
        </ul>
      )}

      {/* Rejection is destructive and irreversible — confirm before deleting. */}
      <AlertDialog
        open={pendingReject !== null}
        onOpenChange={(open) => !open && setPendingReject(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject “{pendingReject?.spec.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the draft. Nothing goes live either way — rejecting just
              means Stash Live will not infer it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingReject && reject(pendingReject)}>
              Reject and delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
