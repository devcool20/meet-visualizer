/**
 * The invite sheet.
 *
 * Three ways in, because each fails for a different audience: the code for
 * someone reading it aloud, the link for someone pasting it into Slack, and
 * native share for a phone. All three write the same link and all three
 * confirm.
 *
 * The code is displayed in a 3-4-4 group so it can be read out character by
 * character without ambiguity — the same format the join field parses.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useMeetingContext } from '../MeetingProvider';
import { codeToJoinUrl } from '@stash/meeting-spec';

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const ctx = useMeetingContext();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const code = ctx.code ?? '';
  const link =
    typeof window !== 'undefined'
      ? codeToJoinUrl(code, window.location.origin)
      : '';

  const copy = useCallback(async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(
        () => setCopied((c) => (c === kind ? null : c)),
        1800,
      );
    } catch {
      // Clipboard permission denied. Select the text so a manual copy works.
      const el = document.getElementById(
        kind === 'code' ? 'invite-code' : 'invite-link',
      );
      if (el instanceof HTMLInputElement) el.select();
    }
  }, []);

  const share = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({
          title: 'Stash Live meeting',
          text: 'Join my Stash Live meeting.',
          url: link,
        })
        .catch(() => {});
      return;
    }
    void copy(link, 'link');
  }, [link, copy]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('input,button') ?? [],
      );
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && (index < 0 || index === items.length - 1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Invite people"
        className="glass-strong relative max-h-[calc(100dvh-2.5rem)] w-full max-w-md overflow-y-auto rounded-panel p-6 shadow-lifted"
      >
        <p role="status" className="sr-only">
          {copied
            ? `${copied === 'code' ? 'Meeting code' : 'Invite link'} copied`
            : ''}
        </p>
        <h2 className="font-display text-2xl leading-tight">Invite people</h2>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          Anyone with the code can join this meeting. You can still lock the
          door from the control bar.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
              Meeting code
            </span>
            <div className="flex items-center gap-2">
              <input
                id="invite-code"
                aria-label="Meeting code"
                readOnly
                value={code}
                onFocus={(e) => e.currentTarget.select()}
                className="telemetry min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-center text-[1.0625rem] uppercase tracking-[0.2em] text-foreground outline-none"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Copy meeting code"
                onClick={() => void copy(code, 'code')}
                className="shrink-0"
              >
                {copied === 'code' ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
              Invite link
            </span>
            <div className="flex items-center gap-2">
              <input
                id="invite-link"
                aria-label="Invite link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-[0.8125rem] text-foreground outline-none"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Copy invite link"
                onClick={() => void copy(link, 'link')}
                className="shrink-0"
              >
                {copied === 'link' ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Link2 className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-[0.75rem] text-muted-foreground">
            {ctx.roster.length} in the meeting
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={share}
              className="rounded-full"
            >
              <Share2 className="size-4" />
              Share
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="rounded-full"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
