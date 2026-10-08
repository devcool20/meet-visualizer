/**
 * `/meet/:code` — the lobby and the call, on one route.
 *
 * Same URL for both, like Google Meet. A link recipient lands here, sees their
 * own camera, picks a name, and presses Join; the host sees the same screen
 * after creating the room. Nothing about the URL changes when the call starts,
 * which means a link stays valid across a refresh and a rejoin — and if a
 * participant reconnects mid-call, they land back in the same room rather than
 * a stale one.
 *
 * ## Where the Stash Live work actually lands
 *
 * `MeetingProvider` owns the outbound media decision, so by the time the stage
 * renders, `ctx.preview` is the *composited* stream. The self tile therefore
 * shows the presenter exactly what the room receives — card burned in, side
 * chosen by the busyness sampler — and the "On air" badge only appears once a
 * card has actually entered the frame. Nothing in the UI claims a card is live
 * because a request succeeded; it is live when the compositor says so.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ChevronDown, Loader2, LogOut, Sparkles, Users, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { EASE } from '@/app/motion';
import { normalizeCode } from '@stash/meeting-spec';
import { MeetingProvider, useMeetingContext } from './MeetingProvider';
import { MeetFrame, MeetScrim } from './components/MeetFrame';
import { PreJoin } from './components/PreJoin';
import { MeetingStage } from './components/MeetingStage';
import { MeetingControls } from './components/MeetingControls';
import { PeoplePanel } from './components/PeoplePanel';
import { ChatPanel } from './components/ChatPanel';
import { CardsRail } from './components/CardsRail';
import { CaptionsOverlay, CaptionTranscript, ReactionsLayer } from './components/CaptionsOverlay';
import { InviteDialog } from './components/InviteDialog';
import { formatElapsed } from './hooks/useMeetingClock';
import { MeetingUnavailableError, diagnoseMeetingOutage } from './lib/meeting-url';

export default function MeetRoomPage() {
  const params = useParams<{ code?: string }>();
  const [search] = useSearchParams();
  const code = useMemo(() => normalizeCode(params.code ?? ''), [params.code]);
  const creating = search.get('host') === '1';

  if (!code) {
    return (
      <MeetFrame>
        <InvalidCode />
      </MeetFrame>
    );
  }

  return (
    <MeetingProvider intent={{ mode: 'create', code, lockOnJoin: false }}>
      <MeetingLifecycle creating={creating} code={code} />
    </MeetingProvider>
  );
}

function MeetingLifecycle({ creating, code }: { creating: boolean; code: string }) {
  const ctx = useMeetingContext();
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const outage = useJoinStall(ctx.joined, ctx.status, ctx.selfId);

  // Leaving is a hard stop: this client must stop sending media and stop
  // holding the camera indicator before it navigates anywhere else.
  const onLeave = useCallback(() => {
    ctx.leave();
    ctx.setJoined(false);
    navigate('/');
  }, [ctx, navigate]);

  if (outage) {
    return <JoinFailure failure={{ code: outage.outage, message: outage.message }} code={code} outage={outage} />;
  }

  if (ctx.status === 'ended') {
    return <EndedScreen reason={ctx.endedBy ?? 'the host'} />;
  }

  if (ctx.failure && ctx.failure.code !== 'denied') {
    return <JoinFailure failure={ctx.failure} code={code} />;
  }

  if (ctx.waitingForHost) {
    return <WaitingRoom name={ctx.displayName || 'You'} />;
  }

  if (!ctx.joined || ctx.status !== 'open') {
    return (
      <MeetFrame>
        <MeetScrim />
        <PreJoin code={code} joining={!creating} onCancel={() => navigate('/')} />
      </MeetFrame>
    );
  }

  return (
    <MeetFrame>
      <MeetingTopBar onOpenInvite={() => setInviteOpen(true)} />
      <MeetingWarnings />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MeetingStage />
        <ReactionsLayer />
        <CaptionsOverlay />
      </div>
      {/* Leaving from the bar must tear the camera down, not just navigate. */}
      <MeetingControls onOpenInvite={() => setInviteOpen(true)} onLeave={onLeave} />
      <SidePanel />
      <AnimatePresence>{inviteOpen ? <InviteDialog onClose={() => setInviteOpen(false)} /> : null}</AnimatePresence>
    </MeetFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function MeetingTopBar({ onOpenInvite }: { onOpenInvite: () => void }) {
  const ctx = useMeetingContext();

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
      <span className="eyebrow">Stash Live</span>
      <span aria-hidden="true" className="h-3.5 w-px bg-border" />
      <time className="telemetry text-[0.75rem] text-muted-foreground" aria-label="Meeting duration">
        {formatElapsed(ctx.elapsedMs)}
      </time>
      {ctx.compositing ? (
        <span className="flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[0.6875rem] font-medium text-brand">
          <Sparkles className="size-3" />
          Compositing
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenInvite}
          className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[0.8125rem] text-foreground transition-colors hover:bg-accent sm:inline-flex"
        >
          <span className="telemetry">{ctx.code}</span>
          <span className="text-muted-foreground">Invite</span>
        </button>
        <span className="flex size-8 items-center justify-center rounded-full bg-brand/15 text-[0.75rem] font-medium text-brand">
          {(ctx.displayName || '?').slice(0, 1).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

/**
 * Transient, non-blocking problems.
 *
 * Meeting UIs fail in ways that must not steal focus mid-sentence: a peer
 * behind a strict NAT, a card that came back malformed, a compositor that fell
 * back to passthrough. Each is reported here in one line, and each disappears
 * on its own rather than demanding acknowledgement.
 */
function MeetingWarnings() {
  const ctx = useMeetingContext();
  const warnings: { key: string; text: string }[] = [];

  if (ctx.mutedByHost) {
    warnings.push({ key: 'muted', text: 'The host muted you. Unmute when you are ready.' });
  }
  if (ctx.captionError) {
    warnings.push({ key: 'captions', text: ctx.captionError });
  }
  if (ctx.connectionWarning) {
    warnings.push({ key: 'conn', text: ctx.connectionWarning });
  }
  if (ctx.compositorError) {
    warnings.push({
      key: 'comp',
      text: `Cards are unavailable (${ctx.compositorError}). Your camera is being sent unchanged.`,
    });
  }
  if (ctx.media.status === 'denied') {
    warnings.push({ key: 'media', text: ctx.media.message ?? 'Camera and microphone are blocked.' });
  }

  if (warnings.length === 0) return null;

  return (
    <div role="status" className="flex shrink-0 flex-col gap-px border-b border-border">
      <AnimatePresence initial={false}>
        {warnings.map((w) => (
          <motion.div
            key={w.key}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="flex items-center gap-2 bg-warning/10 px-4 py-1.5 text-[0.75rem] text-warning">
              <AlertTriangle className="size-3.5 shrink-0" />
              {w.text}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function SidePanel() {
  const ctx = useMeetingContext();
  const open = ctx.panel !== 'none';

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => ctx.setPanel('none')}
            className="absolute inset-0 z-10 cursor-default bg-background/40 lg:hidden"
          />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            aria-label={panelLabel(ctx.panel)}
            className="absolute inset-y-0 right-0 z-20 flex shrink-0 flex-col overflow-hidden border-l border-border bg-background"
          >
            <div className="flex h-full w-[340px] max-w-[88vw] flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[0.875rem] font-medium text-foreground">{panelLabel(ctx.panel)}</h2>
                <button
                  type="button"
                  onClick={() => ctx.setPanel('none')}
                  aria-label="Close panel"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              {ctx.panel === 'people' ? <PeoplePanel /> : null}
              {ctx.panel === 'chat' ? <ChatPanel /> : null}
              {ctx.panel === 'cards' ? <CardsRail /> : null}
              {ctx.captionsOn && ctx.panel === 'people' ? <CaptionTranscript /> : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function panelLabel(panel: string): string {
  if (panel === 'people') return 'People';
  if (panel === 'chat') return 'Chat';
  return 'Stash Live cards';
}

/* ------------------------------------------------------------------ */
/* Terminal states                                                      */
/* ------------------------------------------------------------------ */

/**
 * Detects a join that will never complete.
 *
 * The signalling socket failing produces no error a caller can catch: against
 * an engine without the meeting routes it simply never opens, and against a
 * cold Render instance it can take a while. Either way the symptom a user sees
 * is "Join now" doing nothing, which is the worst possible failure mode — it
 * looks like a bug in the button.
 *
 * So after a grace period, probe the engine directly and report what is
 * actually wrong rather than spinning.
 */
const JOIN_GRACE_MS = 8000;

function useJoinStall(joined: boolean, status: string, selfId: string | null): MeetingUnavailableError | null {
  const [outage, setOutage] = useState<MeetingUnavailableError | null>(null);

  useEffect(() => {
    if (outage) return;
    if (!joined) return;
    if (status === 'open' || selfId) {
      // Seated. The grace period is over and it worked.
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void diagnoseMeetingOutage().then((diagnosis) => {
        if (!cancelled) setOutage(diagnosis);
      });
    }, JOIN_GRACE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [joined, status, selfId, outage]);

  // A successful seat clears any earlier diagnosis.
  useEffect(() => {
    if (selfId) setOutage(null);
  }, [selfId]);

  return outage;
}

function WaitingRoom({ name }: { name: string }) {
  return (
    <MeetFrame>
      <MeetScrim />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="relative flex size-12 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full bg-brand/20"
            style={{ animation: 'pulse-ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite' }}
          />
          <Loader2 className="size-6 animate-spin text-brand" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl leading-tight">Waiting to be let in</h1>
          <p className="max-w-[38ch] text-[0.875rem] leading-relaxed text-muted-foreground">
            {name} asked to join this meeting. The host has to admit you — they will see a notification.
          </p>
        </div>
        <LinkHome />
      </div>
    </MeetFrame>
  );
}

function EndedScreen({ reason }: { reason: string }) {
  return (
    <MeetFrame>
      <MeetScrim />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-foreground/8">
          <LogOut className="size-5 text-muted-foreground" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl leading-tight">The meeting has ended</h1>
          <p className="text-[0.875rem] text-muted-foreground">
            {reason === 'the host' ? 'The host ended this meeting for everyone.' : `${reason} ended the meeting.`}
          </p>
        </div>
        <LinkHome />
      </div>
    </MeetFrame>
  );
}

function JoinFailure({
  failure,
  code,
  outage,
}: {
  failure: { code: string; message: string };
  code: string;
  /** Present when we diagnosed the failure ourselves and know the remedy. */
  outage?: MeetingUnavailableError;
}) {
  const navigate = useNavigate();

  const isDenied = failure.code === 'denied';
  const isOutage = !!outage;

  return (
    <MeetFrame>
      <MeetScrim />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/12">
          <AlertTriangle className="size-5 text-destructive" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl leading-tight">
            {isDenied ? 'You were not let in' : isOutage ? 'Could not start the meeting' : 'Could not join this meeting'}
          </h1>
          <p className="max-w-[42ch] text-[0.875rem] leading-relaxed text-muted-foreground">{failure.message}</p>
          {outage ? (
            <p className="mx-auto max-w-[52ch] rounded-lg border border-border bg-card/60 px-4 py-3 text-[0.8125rem] leading-relaxed text-foreground">
              {outage.remedy}
            </p>
          ) : null}
          <p className="telemetry text-[0.75rem] text-muted-foreground">{code}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/meet')} className="rounded-full">
            <Users className="size-4" />
            Enter another code
          </Button>
          <Button type="button" onClick={() => navigate('/')} className="rounded-full">
            Back to site
          </Button>
        </div>
      </div>
    </MeetFrame>
  );
}

function InvalidCode() {
  return (
    <MeetFrame>
      <MeetScrim />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl leading-tight">That is not a meeting code</h1>
          <p className="max-w-[42ch] text-[0.875rem] leading-relaxed text-muted-foreground">
            Codes look like <span className="telemetry text-foreground">abc-efgj-pqrt</span> — three groups of
            letters. Check the link you were sent.
          </p>
        </div>
        <LinkHome />
      </div>
    </MeetFrame>
  );
}

function LinkHome() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.location.assign('/meet')} className={cn('rounded-full')}>
      <ChevronDown className="size-4 rotate-90" />
      Go to the join screen
    </Button>
  );
}