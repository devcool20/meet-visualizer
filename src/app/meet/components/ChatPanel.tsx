/**
 * In-meeting chat.
 *
 * Scrolling to the newest message is the one behaviour every chat panel must
 * get right, and the one most often got wrong: auto-scroll is desirable while
 * you are already at the bottom and actively wrong if you have scrolled up to
 * read something. This tracks that.
 *
 * Names, not ids, in the transcript. A stable colour per id is used for the
 * avatar so two "Alex"s are still distinguishable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { initialsOf, hueOf } from './MeetFrame';
import { useMeetingContext } from '../MeetingProvider';

export function ChatPanel() {
  const ctx = useMeetingContext();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const selfId = ctx.selfId;

  const grouped = useMemo(() => {
    // Collapse consecutive messages from the same speaker, the way every chat
    // does, so a rapid exchange reads as turns rather than a wall.
    const out: { id: string; name: string; at: number; lines: { key: string; text: string; mine: boolean }[] }[] = [];
    for (const msg of ctx.chat) {
      const last = out[out.length - 1];
      if (last && last.id === msg.id) last.lines.push({ key: msg.key, text: msg.text, mine: msg.id === selfId });
      else out.push({ id: msg.id, name: msg.name, at: msg.at, lines: [{ key: msg.key, text: msg.text, mine: msg.id === selfId }] });
    }
    return out;
  }, [ctx.chat, selfId]);

  useEffect(() => {
    ctx.clearUnread();
  }, [ctx]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !pinnedToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [grouped]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    ctx.sendChat(text);
    setDraft('');
    pinnedToBottom.current = true;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        role="log"
        aria-live="polite"
        aria-label="Meeting chat"
      >
        {grouped.length === 0 ? (
          <p className="px-1 py-6 text-[0.8125rem] leading-relaxed text-muted-foreground">
            No messages yet. Chat is the fastest way to share a link nobody can hear you read out.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <article key={`${group.id}-${group.at}`} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-display text-[0.6875rem] text-foreground/85"
                  style={{ background: `hsl(${hueOf(group.id)} 26% 22%)` }}
                >
                  {initialsOf(group.name)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[0.75rem] font-medium text-foreground">{group.name}</span>
                    <time className="telemetry shrink-0 text-[0.625rem] text-muted-foreground">
                      {new Date(group.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </span>
                  {group.lines.map((line) => (
                    <p
                      key={line.key}
                      className={cn(
                        'whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed',
                        line.mine ? 'text-foreground' : 'text-foreground/90',
                      )}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-border p-3">
        <label htmlFor="meet-chat" className="sr-only">
          Message
        </label>
        <textarea
          id="meet-chat"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a newline — the convention people
            // expect from every chat that is not a messaging app.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={1}
          placeholder="Message everyone"
          className="min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl border border-border bg-input-background px-3.5 py-2.5 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={draft.trim().length === 0}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
        >
          <SendHorizontal className="size-4.5" />
        </button>
      </form>
    </div>
  );
}