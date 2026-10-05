/**
 * Settings.
 *
 * The previous version was eight undifferentiated `space-y-3` blocks with no
 * grouping, two competing layout idioms for the same kind of control, and two
 * "Saving…" messages stacked on top of each other (this page and
 * `TriggerModePanel` each rendered one). Sections are now grouped, the
 * card-position buttons have icons and proper labels, and saving is announced
 * once.
 */
import { useEffect, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ShieldCheck } from "lucide-react";
import { Slider } from "@/app/components/ui/slider";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiDevice, type ApiUser } from "@/lib/api";
import type { UserSettings, CardPosition } from "@stash/card-spec";
import {
  SENSITIVITY_STOPS,
  sensitivityToStopIndex,
  stopIndexToSensitivity,
} from "@/lib/sensitivity";
import { Pill, SkeletonRows, StatusMessage, Surface, Telemetry } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";
import { AiProviderPanel } from "./AiProviderPanel";
import { TriggerModePanel } from "./TriggerModePanel";
import { PageHeader } from "./PageHeader";

const POSITIONS: { value: CardPosition; label: string; Icon: typeof AlignLeft; hint: string }[] = [
  { value: "auto", label: "Auto", Icon: AlignCenter, hint: "Pick the side with less of your face on it" },
  { value: "left", label: "Left", Icon: AlignLeft, hint: "Always on your left" },
  { value: "right", label: "Right", Icon: AlignRight, hint: "Always on your right" },
];

const SENSITIVITY_HINT: Record<UserSettings["sensitivity"], string> = {
  certain: "Only fires on a near-exact phrase match. Fewest false positives.",
  balanced: "Fires on clear topical matches. Recommended for most calls.",
  eager: "Fires on loose topical matches. More cards, more chances to be wrong.",
};

const DATA_PROCESSORS = [
  { name: "Google", role: "Sign-in, and camera/microphone access while a meeting is open." },
  {
    name: "Your embedding provider",
    role: "Turns your Notion content into searchable card matches.",
  },
  { name: "Your configured LLM", role: "Generates cards from what you say during a call." },
];

/** One label/description/control row, used for every switch in this page. */
function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="mb-4">
        <h2
          id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
         className="font-serif text-lg font-normal text-foreground"
        >
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Surface className="px-6">{children}</Surface>
    </section>
  );
}

export default function SettingsPage() {
  const { getAccessToken } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getMe().then(setUser);
    api.listDevices().then(setDevices).catch(() => setDevices([]));
  }, [getAccessToken]);

  async function patchSettings(patch: Partial<UserSettings>) {
    if (!user) return;
    setSaving(true);
    try {
      const api = getApiClient(getAccessToken);
      setUser(await api.updateSettings(patch));
    } catch {
      /* the server is the source of truth; a failed write leaves state unchanged */
    } finally {
      setSaving(false);
    }
  }

  async function revoke(device: ApiDevice) {
    const api = getApiClient(getAccessToken);
    await api.revokeDevice(device.id);
    setDevices((prev) =>
      prev.map((d) => (d.id === device.id ? { ...d, revokedAt: new Date().toISOString() } : d)),
    );
  }

  if (!user) {
    return (
      <div className="space-y-8">
        <PageHeader title="Settings" />
        <SkeletonRows count={4} />
      </div>
    );
  }

  const stopIndex = sensitivityToStopIndex(user.settings.sensitivity);
  const triggerMode =
    (user.settings as UserSettings & { triggerMode?: "hold-to-talk" | "ambient" }).triggerMode ===
    "ambient"
      ? "ambient"
      : "hold-to-talk";

  return (
    <div className="max-w-2xl space-y-10">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="These apply straight away — including in a meeting you are already in. There is nothing to rejoin."
      />

      {/* Announced once, centrally, rather than per-panel. */}
      <div aria-live="polite" className="sr-only">
        {saving ? "Saving settings" : ""}
      </div>

      <SettingsSection
        title="AI provider"
        description="Which model writes your cards. Bring your own key, or use one configured on the server."
      >
        <div className="py-5">
          <AiProviderPanel initialState={null} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="How cards are triggered"
        description="When Stash Live is allowed to listen."
      >
        <div className="py-5">
          <TriggerModePanel
            value={triggerMode}
            onChange={(mode) => patchSettings({ triggerMode: mode })}
            saving={saving}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Matching"
        description="How eager the engine is to fire a card on what you said."
      >
        <div className="space-y-5 py-5">
          <div>
            <Slider
              min={0}
              max={SENSITIVITY_STOPS.length - 1}
              step={1}
              value={[stopIndex]}
              onValueChange={([v]) => patchSettings({ sensitivity: stopIndexToSensitivity(v) })}
              aria-label="Matching sensitivity"
            />
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-foreground" data-testid="sensitivity-label">
                {SENSITIVITY_STOPS[stopIndex]}
              </p>
              <Telemetry className="text-xs text-muted-subtle">
                {stopIndex === 0 ? "strict" : stopIndex === 1 ? "default" : "loose"}
              </Telemetry>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {SENSITIVITY_HINT[user.settings.sensitivity]}
            </p>
          </div>

          <div className="hairline-t pt-5">
            <p className="text-sm font-medium text-foreground">Card position</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Where the overlay sits in your camera frame.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {POSITIONS.map(({ value, label, Icon, hint }) => {
                const active = user.settings.position === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patchSettings({ position: value })}
                    aria-pressed={active}
                    title={hint}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5",
                      active
                        ? "border-brand/30 bg-warning-surface font-medium text-brand-ink"
                        : "border-border-strong text-foreground hover:border-foreground/25",
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={1.9} aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Behaviour" description="How cards present themselves in a call.">
        <div className="divide-y divide-border">
          <SettingRow
            title="Reduce card motion"
            description="Cards appear instantly instead of animating in. Useful for low-power machines or if you present often."
            control={
              <Switch
                checked={user.settings.reducedMotion}
                onCheckedChange={(v) => patchSettings({ reducedMotion: v })}
                aria-label="Reduce card motion"
              />
            }
          />
          <SettingRow
            title="Save transcript snippets"
            description="Off by default. When on, near-miss transcript text is kept for 24 hours so you can tune the phrases that did not fire."
            control={
              <Switch
                checked={user.settings.storeSnippets}
                onCheckedChange={(v) => patchSettings({ storeSnippets: v })}
                aria-label="Save transcript snippets"
              />
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Devices" description="Browsers and clients paired with this account.">
        {devices.length === 0 ? (
          <p className="py-5 text-sm text-muted-foreground">
            No paired devices yet. Install the extension in a browser to pair it.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{d.label}</p>
                  <Telemetry className="text-xs text-muted-subtle">{d.id}</Telemetry>
                </div>
                {d.revokedAt ? (
                  <Pill>Revoked</Pill>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => revoke(d)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <section>
        <div className="mb-4 flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-brand" strokeWidth={1.9} aria-hidden />
          <h2 className="font-serif text-lg font-normal text-foreground">Who processes your data</h2>
        </div>
        <Surface tone="flat" className="px-6 py-5">
          <dl className="space-y-4">
            {DATA_PROCESSORS.map((p) => (
              <div key={p.name}>
                <dt className="text-sm font-medium text-foreground">{p.name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.role}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </section>

      {saving && (
        <StatusMessage tone="neutral">Saving…</StatusMessage>
      )}
    </div>
  );
}
