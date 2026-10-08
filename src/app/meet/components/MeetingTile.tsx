/**
 * A participant's camera tile.
 *
 * Handles the four states every conferencing grid has to get right:
 * live video, camera off, screen share, and "still connecting". The tile is a
 * fixed aspect box with the video absolutely filling it, so the grid never
 * reflows as streams resolve.
 *
 * Note there is no mirroring transform anywhere. The outbound stream is what it
 * is — un-mirrored, exactly as Google Meet transmits it — and if the self-view
 * were flipped, the compositing decision could not be verified by looking at
 * yourself. The presenter sees their true broadcast; so does everyone else.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Hand, MicOff, MonitorUp, WifiOff } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { initialsOf, hueOf } from './MeetFrame';

export interface MeetingTileProps {
  id: string;
  name: string;
  stream: MediaStream | null;
  screen?: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  sharing?: boolean;
  handRaised?: boolean;
  speaking?: boolean;
  isSelf?: boolean;
  isHost?: boolean;
  /** Mirror the label to the bottom-right, for the self tile. */
  alignLabel?: 'left' | 'right';
  connectionState?: string;
  children?: React.ReactNode;
  className?: string;
}

export function MeetingTile(props: MeetingTileProps) {
  const { stream, screen, cameraOn, id, name, children, className } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    if (el.srcObject === stream) {
      // Same stream, but it may have been paused by a tab switch.
      if (el.paused) void el.play().catch(() => {});
      return;
    }
    el.srcObject = stream;
    void el.play().catch(() => {
      /* autoplay policy — muted elements are allowed, this is belt and braces */
    });
  }, [stream]);

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    el.srcObject = screen ?? null;
    if (screen) void el.play().catch(() => {});
  }, [screen]);

  const showVideo = cameraOn && !!stream;
  const hue = useMemo(() => hueOf(id), [id]);

  const degraded = props.connectionState === 'failed' || props.connectionState === 'disconnected';

  return (
    <figure
      className={cn(
        'group relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-panel border transition-[border-color,box-shadow] duration-300',
        props.speaking ? 'border-brand/70 shadow-brand-lg' : 'border-border',
        className,
      )}
      style={props.speaking ? { boxShadow: '0 0 0 2px rgba(251,133,0,0.35)' } : undefined}
    >
      {/* Camera */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label={`${name}'s camera`}
          className="absolute inset-0 size-full bg-foreground object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `linear-gradient(150deg, hsl(${hue} 26% 20%), hsl(${(hue + 40) % 360} 22% 13%))`,
          }}
        >
          <span
            className="font-display text-[clamp(2rem,6cqw,3.5rem)] leading-none text-foreground/85"
            aria-hidden="true"
          >
            {initialsOf(name)}
          </span>
        </div>
      )}

      {/* Screen share */}
      {screen ? (
        <div className="absolute inset-0 bg-black">
          <video
            ref={screenRef}
            autoPlay
            playsInline
            muted
            aria-label={`${name}'s shared screen`}
            className="absolute inset-0 size-full object-contain"
          />
        </div>
      ) : null}

      {/* Degraded notice */}
      {degraded ? (
        <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-1.5 bg-warning/85 px-3 py-1 text-[0.6875rem] font-medium text-warning-foreground">
          <WifiOff className="size-3" />
          {props.connectionState === 'failed' ? 'Connection failed' : 'Reconnecting…'}
        </div>
      ) : null}

      {/* Slot for the card rail / overlays rendered by the parent */}
      {children}

      {/* Label */}
      <figcaption
        className={cn(
          'pointer-events-none absolute bottom-2 flex max-w-[80%] items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[0.75rem] text-foreground backdrop-blur-md',
          props.alignLabel === 'right' ? 'right-2' : 'left-2',
        )}
      >
        {props.sharing ? <MonitorUp className="size-3 shrink-0 text-brand" /> : null}
        {!props.micOn ? <MicOff className="size-3 shrink-0 text-muted-foreground" /> : null}
        {props.handRaised ? <Hand className="size-3 shrink-0 text-brand" /> : null}
        <span className="truncate">{props.isSelf ? `${name} (you)` : name}</span>
        {props.isHost ? (
          <span className="shrink-0 rounded-full bg-brand/18 px-1.5 py-px text-[0.625rem] uppercase tracking-wide text-brand">
            Host
          </span>
        ) : null}
      </figcaption>

      {/* A quiet ring on the self tile so you can always find yourself. */}
      {props.isSelf ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-panel ring-1 ring-inset ring-foreground/10"
        />
      ) : null}
    </figure>
  );
}