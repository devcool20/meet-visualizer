/**
 * Session registry (plan §4b).
 *
 * Holds a weak reference to every active WebSocket session so the HTTP
 * generate-card route can push generated cards to the user's connected
 * session. Not an authoritative ledger — sessions are removed on close.
 */
import type { ServerMsg } from '@stash/card-spec';

interface SessionHandle {
  userId: string;
  send(msg: ServerMsg): void;
}

const sessions = new Map<string, SessionHandle>();

export function registerSession(sessionId: string, handle: SessionHandle): void {
  sessions.set(sessionId, handle);
}

export function unregisterSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function findSessionByUserId(userId: string): SessionHandle | undefined {
  for (const handle of sessions.values()) {
    if (handle.userId === userId) return handle;
  }
  return undefined;
}
