/**
 * Endpoint resolution for the meeting platform.
 *
 * Everything the browser needs to reach the signalling relay, derived from
 * the one env var the rest of the app already uses (`VITE_STASH_API_URL`).
 * Adding a second source of truth for "where is the engine" would be a bug
 * waiting to happen: `/rehearse`, `/dashboard` and `/meet` must all be talking
 * to the same deployment or card generation silently diverges.
 */
import { apiBaseUrl } from '@/lib/env';

/** The `/ws/meeting` URL for the configured engine. */
export function meetingWsUrl(): string {
  const base = apiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return 'ws://localhost:5000/ws/meeting';
  }
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${url.host}/ws/meeting`;
}

/** REST base for the meeting endpoints (same origin when engine is co-hosted). */
export function meetingApiBase(): string {
  return apiBaseUrl();
}

export interface RoomReservation {
  code: string;
  joinUrl: string;
}

export class MeetingRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MeetingRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Why the meeting service could not be reached, distinguished as finely as the
 * evidence allows — because the remedies are completely different.
 *
 * The case that matters most is `old-engine`: the deployed engine answers
 * `/health` perfectly but has no `/api/meeting/rooms`, which is the exact
 * signature of a deploy that predates the meeting platform. Retrying does not
 * help, and telling a user to "try again in a moment" for a 404 sends them in
 * circles. The operator needs to be told to redeploy instead.
 */
export type MeetingOutage =
  | 'old-engine'
  | 'unreachable'
  | 'server-error'
  | 'rate-limited'
  | 'unknown';

export class MeetingUnavailableError extends Error {
  readonly outage: MeetingOutage;
  /** A sentence aimed at whoever can actually fix it. */
  readonly remedy: string;

  constructor(outage: MeetingOutage, message: string, remedy: string) {
    super(message);
    this.name = 'MeetingUnavailableError';
    this.outage = outage;
    this.remedy = remedy;
  }
}

function hostOf(base: string): string | null {
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

/** Is the engine answering at all? Used to tell an old deploy from an outage. */
export async function engineReachable(): Promise<boolean> {
  const base = meetingApiBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = meetingApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // A transport failure: nothing answered at all.
    throw new MeetingUnavailableError(
      'unreachable',
      'The meeting service could not be reached.',
      hostOf(base)
        ? `Nothing is answering at ${hostOf(base)}. Check that the engine is running and that VITE_STASH_API_URL points at it.`
        : 'Nothing is answering at the configured engine URL. Check VITE_STASH_API_URL.',
    );
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (res.ok) return body as T;

  const rec = (body ?? {}) as { code?: string; message?: string };

  if (res.status === 404) {
    // Distinguish "this deploy has no meetings" from "there is no such room".
    // `GET /rooms/:code` legitimately 404s for an unknown code, but reserving
    // one never should, so a 404 here is always a missing route.
    throw new MeetingUnavailableError(
      'old-engine',
      'The deployed engine does not have the meeting routes yet.',
      'The engine at this URL is an older deploy. Redeploy the Stash Live engine (it must be running the current `npm run build:engine` bundle) and try again.',
    );
  }

  if (res.status >= 500) {
    throw new MeetingUnavailableError(
      'server-error',
      rec.message ?? `The meeting service failed (${res.status}).`,
      'The engine answered but errored. Check its logs.',
    );
  }

  if (res.status === 429) {
    throw new MeetingUnavailableError(
      'rate-limited',
      'Too many meetings have been created from this browser.',
      'Wait a moment before starting another.',
    );
  }

  throw new MeetingRequestError(res.status, rec.code ?? 'http_error', rec.message ?? `Request failed (${res.status})`);
}

/** Reserves a meeting code. Used by the landing CTA and the gate page. */
export function reserveRoom(code?: string): Promise<RoomReservation> {
  return request<RoomReservation>('/api/meeting/rooms', {
    method: 'POST',
    body: JSON.stringify(code ? { code } : {}),
  });
}

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

/**
 * Does the deployed engine actually have the meeting routes?
 *
 * GET /api/meeting/rooms/probe is deliberately a malformed code: a current
 * engine answers 400 invalid_code (it parsed the route and rejected the
 * code), while an older deploy answers 404 Cannot GET because the route does
 * not exist. That difference is a reliable capability probe.
 *
 * The WebSocket path needs this because it fails without any HTTP response the
 * caller can catch: against an old engine the socket simply never opens, and
 * without a probe the in-call screen would spin on "Join now" forever.
 */
export async function supportsMeetings(): Promise<boolean> {
  const base = meetingApiBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/meeting/rooms/probe`, { method: 'GET' });
    // 400 means the route exists and rejected our probe code.
    return res.status !== 404 && res.status !== 502 && res.status !== 503;
  } catch {
    return false;
  }
}

/**
 * Explains why a meeting could not be started or joined, distinguishing the
 * cases whose remedies differ.
 */
export async function diagnoseMeetingOutage(): Promise<MeetingUnavailableError> {
  const base = meetingApiBase();
  const host = hostOf(base);
  const where = host ?? 'the configured engine URL';

  if (await supportsMeetings()) {
    return new MeetingUnavailableError(
      'unreachable',
      'Could not reach the meeting service.',
      host
        ? `The engine at ${host} is up and has the meeting routes, so this is a connection problem. Check your network, or anything between you and it.`
        : 'Check your network connection.',
    );
  }

  if (await engineReachable()) {
    return new MeetingUnavailableError(
      'old-engine',
      'The deployed engine does not have the meeting routes yet.',
      `The engine at ${where} is running an older build. Redeploy the Stash Live engine so it picks up the current bundle, then try again.`,
    );
  }

  return new MeetingUnavailableError(
    'unreachable',
    'The meeting service could not be reached.',
    host
      ? `Nothing is answering at ${host}. Check that the engine is running and that VITE_STASH_API_URL points at it.`
      : 'Nothing is answering at the configured engine URL. Check VITE_STASH_API_URL.',
  );
}

export interface RoomProbe {
  code: string;
  exists: boolean;
  participantCount?: number;
  waitingCount?: number;
  locked?: boolean;
  ended?: boolean;
  createdAt?: number;
}

/**
 * Checks whether an invite code is live.
 *
 * A 404 is a legitimate answer ("that meeting is not on"), not a failure, so it
 * is mapped to `exists: false` rather than thrown. Anything else — an
 * unreachable engine, a 500 — is thrown, because silently reporting "no such
 * meeting" for a network blip would send people to the wrong screen.
 */
export async function probeRoom(code: string): Promise<RoomProbe> {
  try {
    return await request<RoomProbe>(`/api/meeting/rooms/${encodeURIComponent(code)}`);
  } catch (err) {
    if (err instanceof MeetingRequestError && err.status === 404) {
      return { code, exists: false };
    }
    throw err;
  }
}