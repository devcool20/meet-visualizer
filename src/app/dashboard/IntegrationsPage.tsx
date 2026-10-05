/**
 * Integrations.
 *
 * v1 is Notion-only and says so. The available integration and the coming-soon
 * ones are now visually distinct by weight rather than only by a badge — they
 * previously used two different surface recipes on the same page and carried
 * identical visual weight. Connection metadata is a definition list with
 * formatted dates rather than four bare paragraphs.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type NotionConnection } from "@/lib/api";
import { Pill, StatusMessage, Surface, Telemetry } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";
import { PageHeader } from "./PageHeader";

const COMING_SOON = ["Airtable", "Google Drive", "Google Sheets", "Salesforce", "HubSpot"];

export default function IntegrationsPage() {
  const { getAccessToken } = useAuth();
  const [connection, setConnection] = useState<NotionConnection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromOnboarding = params.get("from") === "onboarding";

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api
      .getNotionConnection()
      .then(setConnection)
      .finally(() => setLoaded(true));
  }, [getAccessToken]);

  async function handleConnect() {
    const api = getApiClient(getAccessToken);
    const { url } = await api.notionAuthorize();
    window.location.href = url;
  }

  async function handleResync() {
    setSyncing(true);
    const api = getApiClient(getAccessToken);
    try {
      await api.notionSync("default");
      setConnection(await api.getNotionConnection());
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    const api = getApiClient(getAccessToken);
    await api.deleteNotionConnection();
    setConnection(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Stash Live reads from the tools you already keep your numbers in, so the overlay always shows current data."
        actions={
          connection && (
            <>
              <Button variant="outline" size="sm" disabled={syncing} onClick={handleResync}>
                <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} strokeWidth={2} aria-hidden />
                {syncing ? "Syncing…" : "Resync now"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </>
          )
        }
      />

      {fromOnboarding && (
        <Surface tone="brand" className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-foreground">
            Connect Notion now, or skip — you can always do this later.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/meet")} className="shrink-0">
            Skip to next step
          </Button>
        </Surface>
      )}

      {/* ── Available ── */}
      <section aria-labelledby="available-heading" className="space-y-4">
        <h2 id="available-heading" className="eyebrow">
          Available now
        </h2>

        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-foreground" aria-hidden>
                  <path d="M4.6 2h14.8c1.4 0 2.6 1.2 2.6 2.6v14.8c0 1.4-1.2 2.6-2.6 2.6H4.6C3.2 22 2 20.8 2 19.4V4.6C2 3.2 3.2 2 4.6 2zm1.6 3.6v12.8h2.3V7.2l5.6 9.2h2.3V5.6h-2.3v9.2L8.5 5.6H6.2z" />
                </svg>
              </span>
              <div>
                <h3 className="font-serif text-lg font-normal text-foreground">Notion</h3>
                <p className="mt-1 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                  Sync database records and workspace tables so Stash Live can infer cards from what
                  you already maintain.
                </p>
              </div>
            </div>

            <div className="shrink-0">
              {connection ? (
                <Pill tone="success">Connected</Pill>
              ) : (
                <Pill>Not connected</Pill>
              )}
            </div>
          </div>

          {connection && (
            <dl className="grid gap-x-8 gap-y-4 border-t border-border bg-background-sunken/60 px-6 py-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-subtle">Workspace</dt>
                <dd className="mt-1 truncate text-sm text-foreground">
                  {connection.workspaceName}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-subtle">Sources</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {connection.selectedSources.length > 0 ? (
                    connection.selectedSources.join(", ")
                  ) : (
                    <span className="text-muted-subtle">None selected</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-subtle">Last synced</dt>
                <dd className="mt-1">
                  {connection.lastSyncedAt ? (
                    <Telemetry className="text-xs text-foreground">
                      {new Date(connection.lastSyncedAt).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Telemetry>
                  ) : (
                    <span className="text-sm text-muted-subtle">Never</span>
                  )}
                </dd>
              </div>
            </dl>
          )}

          {connection?.syncError && (
            <div className="border-t border-border px-6 py-4">
              <StatusMessage tone="danger">{connection.syncError}</StatusMessage>
            </div>
          )}

          {!connection && loaded && (
            <div className="border-t border-border px-6 py-5">
              <Button onClick={handleConnect}>
                Connect Notion
                <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
              </Button>
            </div>
          )}
        </Surface>
      </section>

      {/* ── Coming soon ── */}
      <section aria-labelledby="soon-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="soon-heading" className="eyebrow">
            On the roadmap
          </h2>
          <p className="text-xs text-muted-subtle">v1 ships with Notion only</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map((name) => (
            <li
              key={name}
             className="flex items-center justify-between gap-3 rounded-card border border-dashed border-border bg-accent/25 px-4 py-4"
            >
              <span className="text-sm text-muted-foreground">{name}</span>
              <Plug className="size-3.5 shrink-0 text-muted-subtle" strokeWidth={1.8} aria-hidden />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
