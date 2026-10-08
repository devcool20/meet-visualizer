/**
 * The people panel.
 *
 * Two audiences, so two sections. The host sees controls; everyone sees the
 * roster. Moderation is deliberately separated from presence so "who is here"
 * and "what can I do about it" never blur together.
 *
 * A muted-by-host request mutes the recipient immediately (in the provider), so
 * this panel only has to tell them it happened.
 */
import { Mic, MicOff, Shield, UserMinus, Video, VideoOff } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { initialsOf, hueOf } from './MeetFrame';
import { useMeetingContext } from '../MeetingProvider';

export function PeoplePanel() {
  const ctx = useMeetingContext();
  const self = ctx.roster.find((p) => p.id === ctx.selfId);
  const others = ctx.roster.filter((p) => p.id !== ctx.selfId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {ctx.pendingJoiners.length > 0 ? (
        <section className="border-b border-border p-3">
          <h3 className="flex items-center gap-2 px-1 pb-2 text-[0.6875rem] uppercase tracking-[0.14em] text-brand">
            <Shield className="size-3.5" />
            Waiting at the door
          </h3>
          <ul className="flex flex-col gap-1.5">
            {ctx.pendingJoiners.map((joiner) => (
              <li key={joiner.id} className="flex items-center gap-2.5 rounded-lg bg-card/50 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[0.875rem] text-foreground">{joiner.name}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => ctx.admit(joiner.id)} className="rounded-full">
                  Admit
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => ctx.deny(joiner.id)} className="rounded-full">
                  Deny
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {self ? (
        <section className="border-b border-border p-3">
          <h3 className="px-1 pb-2 text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">You</h3>
          <PersonRow participant={self} isSelf />
        </section>
      ) : null}

      <section className="p-3">
        <h3 className="px-1 pb-2 text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
          In this meeting · {others.length}
        </h3>
        {others.length === 0 ? (
          <p className="px-1 py-3 text-[0.8125rem] text-muted-foreground">
            Nobody else yet. Share the invite code to bring people in.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {others.map((p) => (
              <li key={p.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <PersonRow participant={p} />
                </div>
                {ctx.isHost ? (
                  <div className="flex shrink-0 items-center gap-0.5 pr-1">
                    <IconAction
                      label={p.state.micOn ? `Ask ${p.name} to mute` : 'Mic is already muted'}
                      disabled={!p.state.micOn}
                      onClick={() => ctx.requestMute(p.id)}
                    >
                      {p.state.micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                    </IconAction>
                    <IconAction label={`Remove ${p.name}`} danger onClick={() => ctx.removeParticipant(p.id)}>
                      <UserMinus className="size-3.5" />
                    </IconAction>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto px-4 py-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
        Video and audio travel peer to peer over WebRTC. Stash Live relays the connection, and holds a
        validated copy of every card that goes on air so the room can read them.
      </p>
    </div>
  );
}

function PersonRow({
  participant,
  isSelf,
}: {
  participant: ReturnType<typeof useMeetingContext>['roster'][number];
  isSelf?: boolean;
}) {
  const hue = hueOf(participant.id);
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-card/50">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full font-display text-[0.6875rem] text-foreground/85"
        style={{ background: `hsl(${hue} 26% 22%)` }}
      >
        {initialsOf(participant.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[0.875rem] text-foreground">
          {participant.name}
          {participant.role === 'host' ? (
            <span className="rounded-full bg-brand/15 px-1.5 py-px text-[0.625rem] uppercase tracking-wide text-brand">
              Host
            </span>
          ) : null}
          {participant.state.handRaised ? <span className="text-brand">✋</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {participant.state.sharing ? <span className="text-[0.625rem] text-muted-foreground">sharing</span> : null}
        <span title={participant.state.micOn ? 'Mic on' : 'Muted'} className={cn(participant.state.micOn ? 'text-muted-foreground' : 'text-destructive')}>
          {participant.state.micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </span>
        <span className={cn(participant.state.camOn ? 'text-muted-foreground' : 'text-destructive')}>
          {participant.state.camOn ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}
        </span>
      </span>
      {isSelf ? null : null}
    </div>
  );
}

function IconAction({
  label,
  children,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger ? 'text-destructive hover:bg-destructive/12' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}