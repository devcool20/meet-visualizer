import { useEffect, useState } from 'react';
import { Slider } from '@/app/components/ui/slider';
import { Switch } from '@/app/components/ui/switch';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiDevice, type ApiUser } from '@/lib/api';
import type { UserSettings, CardPosition } from '@stash/card-spec';
import { SENSITIVITY_LABELS, sensitivityToStopIndex, stopIndexToSensitivity } from '@/lib/sensitivity';

const POSITIONS: CardPosition[] = ['auto', 'left', 'right'];

/**
 * Settings (plan §4.3): sensitivity as a three-stop slider mapped through
 * `src/lib/sensitivity.ts` (raw threshold never shown). Position,
 * auto-dismiss, reduced motion, Activity text-snippet opt-in (default off),
 * privacy panel naming every data processor, Devices list with revoke.
 */
export default function SettingsPage() {
  const { getAccessToken } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = getApiClient(getAccessToken);
    api.getMe().then(setUser);
    api.listDevices().then(setDevices);
  }, [getAccessToken]);

  async function patchSettings(patch: Partial<UserSettings>) {
    if (!user) return;
    setSaving(true);
    const api = getApiClient(getAccessToken);
    const updated = await api.updateSettings(patch);
    setUser(updated);
    setSaving(false);
  }

  async function revoke(device: ApiDevice) {
    const api = getApiClient(getAccessToken);
    await api.revokeDevice(device.id);
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, revokedAt: new Date().toISOString() } : d)));
  }

  if (!user) {
    return <p className="text-sm" style={{ color: '#5A5550' }}>Loading…</p>;
  }

  const stopIndex = sensitivityToStopIndex(user.settings.sensitivity);

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Settings
      </h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#5A5550' }}>
          Sensitivity
        </h2>
        <Slider
          min={0}
          max={2}
          step={1}
          value={[stopIndex]}
          onValueChange={([v]) => patchSettings({ sensitivity: stopIndexToSensitivity(v) })}
        />
        <p className="text-sm font-medium" data-testid="sensitivity-label">
          {SENSITIVITY_LABELS[user.settings.sensitivity]}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#5A5550' }}>
          Card position
        </h2>
        <div className="flex gap-2">
          {POSITIONS.map((pos) => (
            <Button
              key={pos}
              variant={user.settings.position === pos ? 'default' : 'outline'}
              size="sm"
              onClick={() => patchSettings({ position: pos })}
            >
              {pos}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#1A1512' }}>
            Reduced motion
          </h2>
          <p className="text-xs" style={{ color: '#5A5550' }}>
            Cards fade in instantly instead of animating.
          </p>
        </div>
        <Switch
          checked={user.settings.reducedMotion}
          onCheckedChange={(v) => patchSettings({ reducedMotion: v })}
        />
      </section>

      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#1A1512' }}>
            Save activity snippets
          </h2>
          <p className="text-xs" style={{ color: '#5A5550' }}>
            Off by default. When on, near-miss transcript text is kept for 24 hours to help you
            tune phrases.
          </p>
        </div>
        <Switch
          checked={user.settings.storeSnippets}
          onCheckedChange={(v) => patchSettings({ storeSnippets: v })}
        />
      </section>

      <section
        className="rounded-xl p-4 text-sm space-y-1"
        style={{ background: 'rgba(26,21,18,0.03)', color: '#5A5550' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: '#1A1512' }}>
          Who processes your data
        </h2>
        <p>Google — sign-in and, in a meeting, camera/microphone access.</p>
        <p>Your embedding provider — turns your Notion content into searchable card matches.</p>
        <p>Gemini (or your configured LLM) — drafts new cards from your connected sources.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#5A5550' }}>
          Devices
        </h2>
        {devices.length === 0 && (
          <p className="text-sm" style={{ color: '#5A5550' }}>
            No paired devices yet.
          </p>
        )}
        {devices.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm py-1.5">
            <span>{d.label}{d.revokedAt ? ' (revoked)' : ''}</span>
            {!d.revokedAt && (
              <Button variant="outline" size="sm" onClick={() => revoke(d)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </section>

      {saving && <p className="text-xs" style={{ color: '#5A5550' }}>Saving…</p>}
    </div>
  );
}
