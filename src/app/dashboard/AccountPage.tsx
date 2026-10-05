/**
 * Account.
 *
 * Labels were string-interpolated into sentences ("Name: Jane"), so the value
 * and its label were typographically identical and neither was emphasised.
 * These are now real definition-list terms. Billing stays deliberately absent
 * out of v1.
 */
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiUser } from "@/lib/api";
import { Pill, SkeletonRows, StatusMessage, Surface, Telemetry } from "@/app/components/primitives";
import { PageHeader } from "./PageHeader";

export default function AccountPage() {
  const { getAccessToken, signOut, session } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api
      .getMe()
      .then(setUser)
      .catch(() => setError("Could not load your profile."));
  }, [getAccessToken]);

  const name = user?.name ?? session?.user.name ?? null;
  const email = user?.email ?? session?.user.email ?? null;
  const initials = (name ?? email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Who you are signed in as, and the session controls for this device."
      />

      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {user === null && !error && <SkeletonRows count={1} />}

      <Surface className="max-w-xl p-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-lg text-primary-foreground"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-xl font-normal text-foreground">
              {name ?? "—"}
            </p>
            <p className="truncate text-sm text-muted-foreground">{email ?? "—"}</p>
          </div>
          <Pill tone="success" className="ml-auto shrink-0">
            Signed in
          </Pill>
        </div>

        <dl className="mt-7 divide-y divide-border border-t border-border">
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted-foreground">Display name</dt>
            <dd className="min-w-0 truncate text-sm text-foreground">{name ?? "Not set"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="min-w-0 truncate text-sm text-foreground">{email ?? "Not set"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted-foreground">Plan</dt>
            <dd>
              <Pill tone="brand">Early access</Pill>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted-foreground">Session</dt>
            <dd>
              <Telemetry className="text-xs text-foreground">
                {session?.accessToken ? "Token active" : "No token"}
              </Telemetry>
            </dd>
          </div>
        </dl>
      </Surface>

      {/* Sign-out destroys the session immediately, so it gets its own zone. */}
      <Surface tone="outline" className="max-w-xl p-6">
        <h2 className="text-sm font-medium text-foreground">Session</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Signing out ends this session on this device. Your cards and connected workspaces are
          unaffected.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => signOut()}>
          <LogOut className="size-3.5" strokeWidth={2} aria-hidden />
          Sign out
        </Button>
      </Surface>
    </div>
  );
}
