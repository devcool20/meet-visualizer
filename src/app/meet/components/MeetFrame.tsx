/**
 * Shared chrome for the meeting surfaces.
 *
 * A call happens in a dark room, so `/meet` opts out of the brand's alabaster
 * canvas via the `.studio` token class rather than hand-rolling a dark
 * palette. That re-points every existing `bg-background` / `text-foreground` /
 * `glass-*` token at the dark values already built for Studio and the Meet
 * add-on, which means the meeting UI inherits the design system instead of
 * forking it.
 */
import type { ReactNode } from 'react';
import { cn } from '@/app/components/ui/utils';

export function MeetFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('studio fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground', className)}>
      {children}
    </div>
  );
}

export function MeetTopBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5',
        className,
      )}
    >
      {children}
    </header>
  );
}

export function MeetScrim({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 opacity-70',
        'bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(251,133,0,0.16),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(90,85,80,0.20),transparent_60%)]',
        className,
      )}
    />
  );
}

/** Initials for a camera-off tile. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic hue per participant so the same person is the same colour for
 * the whole call. Derived from the id, not the name, so two people called
 * Alex are still distinguishable.
 */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}