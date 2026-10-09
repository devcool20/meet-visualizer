/**
 * The participant grid.
 *
 * Layout is content-driven rather than a fixed grid: 1 person gets a single
 * centred stage, 2–4 gets a row, 5+ goes to a grid sized to the viewport. The
 * active speaker is pinned first so the tile ordering itself does the
 * prioritising — the same trick every conferencing product uses, and the one
 * people read without being taught.
 *
 * A screen share takes over the stage entirely while it is live. That is the
 * behaviour people expect, and it is also the only layout that gives a slide
 * enough pixels to be readable.
 */
import { useMemo } from 'react';
import { MeetingTile } from './MeetingTile';
import { useMeetingContext } from '../MeetingProvider';
import { cn } from '@/app/components/ui/utils';

export function MeetingStage() {
  const ctx = useMeetingContext();

  const sharer = useMemo(
    () => ctx.roster.find((p) => p.state.sharing && (ctx.peerStreams[p.id]?.screen || p.id === ctx.selfId)),
    [ctx.roster, ctx.peerStreams, ctx.selfId],
  );

  const speakingIds = useMemo(() => {
    const ids = new Set<string>();
    if (ctx.micLevel.speaking && ctx.selfId) ids.add(ctx.selfId);
    for (const [id, level] of Object.entries(ctx.remoteLevels)) {
      if (level.speaking) ids.add(id);
    }
    return ids;
  }, [ctx.micLevel.speaking, ctx.remoteLevels, ctx.selfId]);

  // Active speaker wins the lead tile; join order breaks ties so the layout is
  // stable when nobody is speaking.
  const ordered = useMemo(() => {
    const list = [...ctx.roster];
    return list.sort((a, b) => {
      const as = speakingIds.has(a.id) ? 0 : 1;
      const bs = speakingIds.has(b.id) ? 0 : 1;
      if (as !== bs) return as - bs;
      return ctx.roster.indexOf(a) - ctx.roster.indexOf(b);
    });
  }, [ctx.roster, speakingIds]);

  const count = ordered.length;

  if (sharer) {
    return (
      <div className="flex min-h-0 flex-1 gap-3 p-3 sm:p-4">
        <div className="flex min-w-0 flex-[3] flex-col">
          <ShareTile id={sharer.id} name={sharer.name} isSelf={sharer.id === ctx.selfId} />
        </div>
        <div className="flex min-w-[160px] flex-col gap-2 sm:max-w-[240px]">
          {ordered
            .filter((p) => p.id !== sharer.id)
            .map((p) => (
              <ParticipantTile key={p.id} participant={p} speaking={speakingIds.has(p.id)} />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid min-h-0 flex-1 gap-2.5 p-3 sm:gap-3 sm:p-4', gridFor(count))}>
      {ordered.map((p) => (
        <ParticipantTile key={p.id} participant={p} speaking={speakingIds.has(p.id)} />
      ))}
    </div>
  );
}

function gridFor(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1';
  if (count <= 4) return 'grid-cols-2 grid-rows-2';
  if (count <= 6) return 'grid-cols-2 grid-rows-3';
  if (count <= 9) return 'grid-cols-3 grid-rows-3';
  return 'grid-cols-3 grid-rows-3 lg:grid-cols-4';
}

function ShareTile({ id, name, isSelf }: { id: string; name: string; isSelf: boolean }) {
  const ctx = useMeetingContext();
  const source: MediaStreamTrack | null = isSelf
    ? ctx.share.track
    : (ctx.peerStreams[id]?.screen?.getVideoTracks()[0] ?? null);
  const stream = source ? new MediaStream([source]) : null;

  return (
    <MeetingTile
      id={id}
      name={name}
      stream={stream}
      cameraOn={!!stream}
      micOn
      sharing
      isSelf={isSelf}
      connectionState={ctx.peerStreams[id]?.state}
      className="w-full"
    />
  );
}

function ParticipantTile({
  participant,
  speaking,
}: {
  participant: ReturnType<typeof useMeetingContext>['roster'][number];
  speaking: boolean;
}) {
  const ctx = useMeetingContext();
  const isSelf = participant.id === ctx.selfId;
  const peer = ctx.peerStreams[participant.id];

// The self tile renders `ctx.preview`, which is the raw camera. The card is
  // previewed properly in the cards rail, which shows the real GlassCard at full
  // size. Routing the self view through the compositor instead would put the
  // presenter's only view of themselves behind the entire compositing pipeline.
  const stream = isSelf ? ctx.preview : (peer?.stream ?? null);
  const camOn = isSelf ? ctx.media.camOn : participant.state.camOn;
  const micOn = isSelf ? ctx.media.micOn : participant.state.micOn;
  const screen = isSelf ? null : (peer?.screen ?? null);

  return (
    <MeetingTile
      id={participant.id}
      name={participant.name}
      stream={stream}
      screen={screen}
      cameraOn={camOn}
      micOn={micOn}
      handRaised={participant.state.handRaised}
      speaking={speaking}
      isSelf={isSelf}
      isHost={participant.role === 'host'}
      alignLabel={isSelf ? 'right' : 'left'}
      connectionState={isSelf ? undefined : peer?.state}
    >
      {isSelf && ctx.compositing ? <OnAirBadge /> : null}
    </MeetingTile>
  );
}

/** A quiet confirmation that the card really is in the outgoing video. */
function OnAirBadge() {
  return (
    <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-background/75 px-2 py-1 text-[0.6875rem] font-medium text-brand backdrop-blur-md">
      <span className="relative flex size-1.5">
        <span
          className="absolute inset-0 rounded-full bg-brand"
          style={{ animation: 'pulse-ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite' }}
        />
        <span className="relative size-1.5 rounded-full bg-brand" />
      </span>
      On air
    </div>
  );
}