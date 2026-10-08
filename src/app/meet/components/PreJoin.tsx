/**
 * The pre-join lobby.
 *
 * Google's structure exactly: devices and a name, then "Join now". The three
 * things people actually want to change before a call are here, and nothing
 * else is — no feature tour, no configuration. A presenter who is about to go
 * live should be able to go from invite link to talking in under fifteen
 * seconds.
 *
 * It also carries the Stash Live expectation-setting, because it is the last
 * moment before the presenter discovers whether cards will work: if their AI
 * provider is not configured, this is where they find out, not three minutes
 * into the call.
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Camera, CameraOff, Mic, MicOff, MonitorUp, Settings2, Sparkles, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Wordmark } from '@/app/components/primitives';
import { EASE } from '@/app/motion';
import { cn } from '@/app/components/ui/utils';
import { useMeetingContext } from '../MeetingProvider';
import { MeetingPreview } from './MeetingPreview';
import { initialsOf } from './MeetFrame';

export function PreJoin({
  code,
  joining,
  onCancel,
}: {
  /** The invite code being joined, shown so the user can check it. */
  code: string;
  /** True for a guest arriving on a link, false for the host creating a room. */
  joining: boolean;
  onCancel: () => void;
}) {
  const ctx = useMeetingContext();

  const micLevel = ctx.joined ? ctx.micLevel.level : undefined;
  const canJoin = ctx.media.status !== 'requesting';

  const providerWarning = useMemo(() => {
    if (ctx.stash.libraryError) return 'Your card library could not load. Live cards still work.';
    if (ctx.stash.library.length === 0) {
      return 'No approved cards in your library yet — you can still generate cards by speaking.';
    }
    return null;
  }, [ctx.stash.library.length, ctx.stash.libraryError]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex shrink-0 items-center justify-between px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <Wordmark size="sm" className="text-foreground" />
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <span className="telemetry text-[0.75rem] text-muted-foreground">{code}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="rounded-full">
          <X className="size-4" />
          Cancel
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 pb-12 lg:flex-row lg:items-start lg:gap-10">
        {/* Preview */}
        <motion.div
          className="flex w-full flex-col gap-4 lg:max-w-[560px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <MeetingPreview
            stream={ctx.media.stream}
            cameraOn={ctx.media.camOn}
            micOn={ctx.media.micOn}
            name={ctx.displayName || 'You'}
            level={micLevel}
            footer={
              <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-1 text-[0.6875rem] text-foreground backdrop-blur-md">
                {joining ? 'Joining as a guest' : 'You are the host'}
              </span>
            }
          />

          {ctx.media.message ? (
            <p className="rounded-panel border border-border bg-card/60 px-4 py-3 text-[0.8125rem] text-muted-foreground">
              {ctx.media.message}
            </p>
          ) : null}
        </motion.div>

        {/* Controls */}
        <motion.div
          className="flex w-full flex-col gap-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
        >
          <div className="flex flex-col gap-2.5">
            <label htmlFor="meet-name" className="text-[0.8125rem] font-medium text-foreground">
              Your name
            </label>
            <div className="flex items-center gap-2.5 rounded-panel border border-border bg-input-background px-3.5 py-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 font-display text-[0.8125rem] text-brand"
              >
                {initialsOf(ctx.displayName || '?')}
              </span>
              <input
                id="meet-name"
                value={ctx.displayName}
                onChange={(e) => ctx.setDisplayName(e.target.value.slice(0, 40))}
                placeholder="How others will see you"
                autoComplete="name"
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Device pickers */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[0.8125rem] font-medium text-foreground">Devices</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <DeviceSelect
                icon={<Camera className="size-3.5" />}
                label="Camera"
                value={ctx.media.activeCameraId}
                options={ctx.media.cameras}
                fallback="No camera found"
                onChange={ctx.media.selectCamera}
                disabled={!ctx.media.camOn}
              />
              <DeviceSelect
                icon={<Mic className="size-3.5" />}
                label="Microphone"
                value={ctx.media.activeMicId}
                options={ctx.media.mics}
                fallback="No microphone found"
                onChange={ctx.media.selectMic}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={ctx.media.micOn ? 'secondary' : 'destructive'}
              size="sm"
              onClick={() => ctx.setMicOn(!ctx.media.micOn)}
              className="rounded-full"
            >
              {ctx.media.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {ctx.media.micOn ? 'Mute' : 'Unmute'}
            </Button>
            <Button
              type="button"
              variant={ctx.media.camOn ? 'secondary' : 'destructive'}
              size="sm"
              onClick={() => ctx.setCamOn(!ctx.media.camOn)}
              className="rounded-full"
            >
              {ctx.media.camOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              {ctx.media.camOn ? 'Stop video' : 'Start video'}
            </Button>
          </div>

          {/* Stash Live expectation */}
          <div className="rounded-panel border border-border bg-card/50 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15">
                <Sparkles className="size-3.5 text-brand" />
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[0.8125rem] font-medium text-foreground">Stash Live is on</span>
                <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                  Hold the Stash Live button in the call — or{' '}
                  <kbd className="telemetry rounded border border-border bg-background px-1.5 py-0.5 text-[0.6875rem]">
                    Alt + Shift + Space
                  </kbd>{' '}
                  — and say what you are talking about. The card is composited into the video everyone is
                  receiving, so nobody needs to be sent a link.
                </p>
                {providerWarning ? (
                  <p className="text-[0.75rem] text-warning">{providerWarning}</p>
                ) : null}
                {!ctx.stash.supported ? (
                  <p className="text-[0.75rem] text-warning">
                    This browser cannot run speech recognition, so voice cards are unavailable here. You can
                    still type a topic or pick a card from your library.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!canJoin}
            onClick={() => ctx.setJoined(true)}
            className={cn('h-12 w-full rounded-full text-[0.9375rem]', !canJoin && 'opacity-60')}
          >
            {joining ? 'Join now' : 'Start meeting'}
          </Button>

          <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted-foreground">
            <MonitorUp className="mt-px size-3.5 shrink-0" />
            Screen sharing, live captions, chat and the card rail are all available once you are in.
          </p>

          <p className="text-[0.75rem] text-muted-foreground">
            <a href="/dashboard/settings" className="underline underline-offset-2 hover:text-foreground">
              <Settings2 className="mr-1 inline size-3" />
              Device and AI provider settings
            </a>
          </p>
        </motion.div>
      </main>
    </div>
  );
}

interface DeviceSelectProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  options: { deviceId: string; label: string }[];
  fallback: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}

function DeviceSelect({ icon, label, value, options, fallback, onChange, disabled }: DeviceSelectProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', disabled && 'opacity-50')}>
      <span className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </span>
      {options.length === 0 ? (
        <span className="rounded-lg border border-border bg-input-background px-3 py-2 text-[0.8125rem] text-muted-foreground">
          {fallback}
        </span>
      ) : (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-[0.8125rem] text-foreground outline-none focus:border-brand disabled:cursor-not-allowed"
        >
          {options.map((o) => (
            <option key={o.deviceId} value={o.deviceId}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}