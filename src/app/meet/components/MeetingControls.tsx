/**
 * The control bar.
 *
 * Three zones, in the order every conferencing app uses, because that layout is
 * muscle memory: mute/camera/share on the left, Stash Live in the middle where
 * the eye lands, people/chat/cards on the right, leave at the edge. Nothing
 * here is discoverable on first use except Stash Live, and that is deliberate —
 * the product's whole idea should be the one thing a new presenter tries
 * without being told.
 *
 * Every control carries a real accessible name, a tooltip and a visible state.
 * A bar that communicates only through colour is unusable in a bright room,
 * which is exactly where this product is used.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Captions,
  FlipHorizontal,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  Sparkles,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/app/components/ui/tooltip';
import { cn } from '@/app/components/ui/utils';
import { EASE } from '@/app/motion';
import { MEETING_REACTIONS } from '@stash/meeting-spec';
import type { CardPosition } from '@stash/card-spec';
import { useMeetingContext, type Panel } from '../MeetingProvider';
import type { CardPhase } from '../hooks/useStashLiveCards';

export function MeetingControls({
  onOpenInvite,
  onLeave,
}: {
  onOpenInvite: () => void;
  onLeave: () => void;
}) {
  const ctx = useMeetingContext();
  const { media, share, stash, panel, setPanel } = ctx;

  const togglePanel = (p: Panel) => {
    setPanel(panel === p ? 'none' : p);
    if (p === 'chat') ctx.clearUnread();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background/80 px-3 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2">
          <ControlButton
            label={media.micOn ? 'Mute' : 'Unmute'}
            pressed={!media.micOn}
            onClick={() => ctx.setMicOn(!media.micOn)}
            danger={!media.micOn}
            icon={media.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          />
          <ControlButton
            label={media.camOn ? 'Stop video' : 'Start video'}
            pressed={!media.camOn}
            onClick={() => ctx.setCamOn(!media.camOn)}
            danger={!media.camOn}
            icon={media.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          />
          <ControlButton
            label={share.sharing ? 'Stop sharing' : 'Share screen'}
            pressed={share.sharing}
            onClick={ctx.toggleShare}
            active={share.sharing}
            icon={<MonitorUp className="size-5" />}
            className="hidden sm:inline-flex"
          />
        </div>

        <div className="flex items-center gap-2">
          <StashLiveButton
            phase={stash.phase}
            label={stashLabel(stash.phase, stash.interim)}
            disabled={!stash.supported}
            onHoldStart={stash.startListening}
            onHoldEnd={stash.stopListening}
            onTap={() => togglePanel('cards')}
          />
          <ControlButton
            label="Invite people"
            onClick={onOpenInvite}
            icon={<LayoutGrid className="size-5" />}
            className="hidden md:inline-flex"
          />
        </div>

        <div className="flex items-center gap-2">
          <ControlButton
            label={
              ctx.captionsSupported
                ? ctx.captionsOn
                  ? 'Turn captions off'
                  : 'Turn captions on — transcribed on this device'
                : 'Captions need a browser with speech recognition'
            }
            pressed={ctx.captionsOn}
            active={ctx.captionsOn}
            disabled={!ctx.captionsSupported}
            onClick={() => ctx.setCaptionsOn(!ctx.captionsOn)}
            icon={<Captions className="size-5" />}
            className="hidden sm:inline-flex"
          />
          <ControlButton
            label="Cards in this meeting"
            pressed={panel === 'cards'}
            active={panel === 'cards'}
            onClick={() => togglePanel('cards')}
            icon={<Sparkles className="size-5" />}
            badge={stash.phase === 'live' ? <Dot className="absolute -right-0.5 -top-0.5 bg-brand" /> : null}
          />
          <ControlButton
            label="People"
            pressed={panel === 'people'}
            active={panel === 'people'}
            onClick={() => togglePanel('people')}
            icon={<Users className="size-5" />}
            badge={
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-primary-foreground">
                {ctx.roster.length}
              </span>
            }
          />
          <ControlButton
            label="Chat"
            pressed={panel === 'chat'}
            active={panel === 'chat'}
            onClick={() => togglePanel('chat')}
            icon={<MessageSquare className="size-5" />}
            badge={
              ctx.unread > 0 ? (
                <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-primary-foreground">
                  {ctx.unread > 99 ? '99+' : ctx.unread}
                </span>
              ) : null
            }
          />
          <ReactionMenu />
          <MoreMenu />

          <Button
            type="button"
            onClick={onLeave}
            aria-label="Leave meeting"
            className="ml-1 inline-flex h-11 items-center gap-2 rounded-full bg-destructive px-5 text-[0.875rem] font-medium text-destructive-foreground transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <PhoneOff className="size-4.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Stash Live                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Stash Live control.
 *
 * Press-and-hold, like the rehearsal page and like every push-to-talk ever
 * shipped. A tap under 250ms opens the card rail instead — so the live card,
 * the library and a typed topic are all one press away — and the two gestures
 * cannot collide because a hold is defined by the pointer staying down.
 */
function StashLiveButton({
  label,
  phase,
  disabled,
  onHoldStart,
  onHoldEnd,
  onTap,
}: {
  label: string;
  phase: CardPhase;
  disabled: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onTap: () => void;
}) {
  const [held, setHeld] = useState(false);
  const live = phase === 'live';
  const busy = phase === 'generating' || phase === 'listening';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Stash Live — ${label}`}
          aria-pressed={live}
          aria-disabled={disabled}
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            onHoldStart();
            setHeld(true);
          }}
          onPointerUp={() => {
            setHeld(false);
            onHoldEnd();
          }}
          onPointerLeave={() => {
            if (!held) return;
            setHeld(false);
            onHoldEnd();
          }}
          onClick={onTap}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (!disabled) onHoldStart();
          }}
          onKeyUp={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            onHoldEnd();
          }}
          className={cn(
            'relative inline-flex h-11 items-center gap-2 rounded-full px-4 text-[0.875rem] font-medium transition-all duration-150',
            live
              ? 'bg-brand text-primary-foreground shadow-brand-lg'
              : busy || held
                ? 'bg-brand/25 text-brand'
                : 'bg-brand/12 text-brand hover:bg-brand/20',
            disabled && 'cursor-not-allowed opacity-45',
          )}
        >
          <Sparkles className={cn('size-4.5 shrink-0', busy && 'animate-pulse')} />
          <span className="hidden lg:inline">{label}</span>
          <span className="lg:hidden">
            {live ? 'Live' : busy ? (phase === 'listening' ? 'Listening' : 'Wait') : 'Stash'}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-center">
        {label}
        <br />
        <span className="text-muted-foreground">
          {disabled ? 'Speech recognition is unavailable in this browser' : 'Hold to talk · tap for cards'}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function Dot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('size-2.5 rounded-full ring-2 ring-background', className)} />;
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  /** Brand state: "this is on". */
  active?: boolean;
  /** Destructive state: "this is off". */
  danger?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function ControlButton({
  label,
  icon,
  onClick,
  pressed,
  active,
  danger,
  badge,
  disabled,
  className,
}: ControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'relative inline-flex size-11 items-center justify-center rounded-full border transition-all duration-150 active:scale-95 disabled:opacity-50',
            danger
              ? 'border-destructive/40 bg-destructive/15 text-destructive'
              : active
                ? 'border-brand/40 bg-brand/15 text-brand'
                : 'border-border bg-card/60 text-foreground hover:bg-accent',
            className,
          )}
        >
          {icon}
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ReactionMenu() {
  const ctx = useMeetingContext();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <ControlButton
        label="Send a reaction"
        icon={<span aria-hidden="true" className="text-[1.0625rem] leading-none">🙂</span>}
        active={open}
        onClick={() => setOpen((v) => !v)}
      />
      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              aria-label="Close reactions"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="absolute bottom-[3.25rem] right-0 z-40 flex gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lifted backdrop-blur-xl"
            >
              {MEETING_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  onClick={() => {
                    ctx.sendReaction(emoji);
                    setOpen(false);
                  }}
                  className="flex size-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 focus:scale-125 focus:outline-none"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MoreMenu() {
  const ctx = useMeetingContext();
  const [open, setOpen] = useState(false);

  const position = ctx.cardPosition;

  return (
    <div className="relative">
      <ControlButton
        label="More"
        icon={<MoreVertical className="size-5" />}
        active={open}
        onClick={() => setOpen((v) => !v)}
      />
      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="absolute bottom-[3.25rem] right-0 z-40 w-64 overflow-hidden rounded-panel border border-border bg-card/95 shadow-lifted backdrop-blur-xl"
            >
              <MenuRow
                icon={<Sparkles className="size-4" />}
                label="Ambient cards"
                detail="Generate a card from anything you say"
                on={ctx.ambient}
                onClick={() => ctx.setAmbient(!ctx.ambient)}
              />
              <div className="border-t border-border">
                <span className="flex items-center gap-2 px-4 pt-3 text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                  <FlipHorizontal className="size-3.5" />
                  Card position
                </span>
                <div className="flex gap-1 p-2">
                  {POSITION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => ctx.setCardPosition(opt.value)}
                      aria-pressed={position === opt.value}
                      className={cn(
                        'flex-1 rounded-lg px-2 py-1.5 text-[0.75rem] transition-colors',
                        position === opt.value
                          ? 'bg-brand/15 text-brand'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-border">
                <MenuRow
                  icon={<Mic className="size-4" />}
                  label="Microphone"
                  detail={micDetail(ctx.micLevel.level)}
                  onClick={() => void 0}
                />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const POSITION_OPTIONS: { value: CardPosition; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

function MenuRow({
  icon,
  label,
  detail,
  on,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[0.875rem] text-foreground">
          {label}
          {on ? (
            <span aria-hidden="true" className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-wide text-brand">
              On
            </span>
          ) : null}
        </span>
        {detail ? <span className="text-[0.75rem] text-muted-foreground">{detail}</span> : null}
      </span>
    </button>
  );
}

function micDetail(level: number): string {
  if (level <= 0.001) return 'No signal — check your input device';
  if (level < 0.05) return 'Quiet';
  if (level < 0.4) return 'Healthy';
  return 'Hot — you may clip';
}

function stashLabel(phase: CardPhase, interim: string): string {
  switch (phase) {
    case 'listening':
      return interim ? `“${interim.slice(0, 40)}”` : 'Listening…';
    case 'generating':
      return 'Building card…';
    case 'live':
      return 'Card on air';
    case 'failed':
      return 'Card failed';
    case 'unsupported':
      return 'Voice cards unavailable';
    default:
      return 'Stash Live';
  }
}