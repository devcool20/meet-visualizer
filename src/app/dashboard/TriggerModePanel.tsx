/**
 * Trigger mode control (Settings page, plan §5.8).
 * Radio group for hold-to-talk / ambient, persisted via PATCH /api/me/settings.
 * The type `UserSettings.triggerMode` is imported from `@stash/card-spec` —
 * never redeclared.
 */

import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Label } from '@/app/components/ui/label';
import type { UserSettings } from '@stash/card-spec';

type TriggerMode = NonNullable<UserSettings['triggerMode']>;

const OPTIONS: { value: TriggerMode; title: string; description: string }[] = [
  {
    value: 'hold-to-talk',
    title: 'Hold to talk',
    description:
      'Nothing is generated until you ask. Hold Alt+Shift+Space, say what you want on screen, and let go. Stash Live only listens while you are holding the key.',
  },
  {
    value: 'ambient',
    title: 'Ambient',
    description:
      'Stash Live listens for the whole call and shows a card when you say one of your saved phrases. It won\'t invent new cards — it only matches the phrases already in your library.',
  },
];

export interface TriggerModePanelProps {
  value: TriggerMode;
  onChange: (mode: TriggerMode) => void;
  /** True while a save is in progress. */
  saving?: boolean;
}

export function TriggerModePanel({ value, onChange, saving }: TriggerModePanelProps) {
  return (
    <div className="space-y-3">
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as TriggerMode)}
        disabled={saving}
      >
        {OPTIONS.map((opt) => (
          <div key={opt.value} className="flex items-start gap-3">
            <RadioGroupItem value={opt.value} id={`trigger-${opt.value}`} className="mt-0.5" />
            <div>
              <Label htmlFor={`trigger-${opt.value}`} className="text-sm font-medium text-foreground">
                {opt.title}
              </Label>
              <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                {opt.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-subtle">
        Only one mode runs at a time. Ambient uses your saved phrases; hold-to-talk generates a new
        card from what you just said.
      </p>
      {/* The saving state is announced by the owning page. Rendering it here too
          produced two stacked "Saving…" messages on the settings screen. */}
      <span className="sr-only" aria-live="polite">
        {saving ? "Saving trigger mode" : ""}
      </span>
    </div>
  );
}
