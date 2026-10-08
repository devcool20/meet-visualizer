/**
 * A standalone camera preview, used by the gate page and the pre-join lobby.
 *
 * Separate from `MeetingTile` on purpose: this one has no peers, no label
 * chrome and no grid participation, and it has to render before any signalling
 * exists. It also mirrors the dark `.studio` theme, which is what a caller's
 * own preview should look like — seeing a bright card while everyone else sees
 * a dark room is disorienting in exactly the wrong way.
 */
import { useEffect, useRef } from 'react';
import { MicOff, VideoOff } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { initialsOf } from './MeetFrame';

export interface MeetingPreviewProps {
  stream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  name: string;
  /** 0–1. Rendered as a level bar under the frame. */
  level?: number;
  muted?: boolean;
  compact?: boolean;
  className?: string;
  /** Extra content pinned to the bottom of the frame. */
  footer?: React.ReactNode;
}

export function MeetingPreview({
  stream,
  cameraOn,
  micOn,
  name,
  level,
  compact,
  className,
  footer,
}: MeetingPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = cameraOn ? stream : null;
    if (cameraOn && stream) void el.play().catch(() => {});
  }, [stream, cameraOn]);

  const showVideo = cameraOn && !!stream;

  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-panel border border-border bg-foreground/5',
          compact ? 'aspect-[16/10]' : 'aspect-video',
        )}
      >
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label={`${name}'s camera preview`}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="font-display text-4xl text-foreground/70">{initialsOf(name)}</span>
            <span className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
              <VideoOff className="size-3.5" />
              Camera is off
            </span>
          </div>
        )}

        {!micOn ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[0.6875rem] text-foreground backdrop-blur-md">
            <MicOff className="size-3" />
            Muted
          </span>
        ) : null}

        {footer}
      </div>

      {typeof level === 'number' ? (
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">Mic</span>
          <div className="flex h-1.5 flex-1 items-center gap-px overflow-hidden rounded-full bg-foreground/10">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const threshold = (i + 1) / 8;
              const on = level >= threshold * 0.85;
              return (
                <span
                  key={i}
                  className="h-full flex-1 rounded-full transition-colors duration-100"
                  style={{ backgroundColor: on ? (i > 5 ? '#B45309' : '#fb8500') : 'transparent' }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}