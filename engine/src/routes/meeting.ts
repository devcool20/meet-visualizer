/**
 * Meeting REST surface.
 *
 * These endpoints do the two things a client cannot do over the signalling
 * socket without first having a socket: check whether an invite code is real
 * (so the join screen can say "no such meeting" before asking for a name),
 * and mint a code for a "New meeting" click so the landing page's CTA can
 * navigate somewhere concrete.
 *
 * Both are deliberately thin wrappers over `MeetingRegistry`. The registry is
 * the single source of truth for whether a room exists — a REST check that
 * consulted a different store could disagree with the socket and hand a user
 * a "meeting not found" on a room that is live.
 */
import { Router, type Request, type Response } from 'express';
import { codeToJoinUrl, isValidCode, normalizeCode } from '@stash/meeting-spec';
import { MeetingRegistry } from '../meeting/registry.js';

export function createMeetingRouter(registry: MeetingRegistry): Router {
  const router = Router();

  /**
   * POST /api/meeting/rooms
   *
   * Reserves a code. The client then opens `/ws/meeting` and sends `create`
   * with the same code to actually seat itself as host. Reserving first means
   * the landing CTA can carry a real link; seating happens on the socket so
   * there is exactly one code-claiming path, and the reservation is claimed in
   * place rather than released and re-created.
   *
   * Body: `{ code?: string }`
   * 200:  `{ code, joinUrl }`
   * 400:  `{ code: 'invalid_code', message }`
   * 409:  `{ code: 'room_full', message }` — requested code already in use
   */
  router.post('/api/meeting/rooms', (req: Request, res: Response) => {
    const requested = typeof req.body?.code === 'string' ? req.body.code : undefined;

    if (requested && !isValidCode(requested)) {
      res.status(400).json({ code: 'invalid_code', message: 'That is not a valid meeting code' });
      return;
    }

    const reservation = registry.reserve(requested);
    if (!reservation.ok) {
      res.status(reservation.code === 'invalid_code' ? 400 : 409).json({
        code: reservation.code,
        message: reservation.message,
      });
      return;
    }

    const origin = String(req.headers.origin ?? '').replace(/\/+$/, '');
    res.json({
      code: reservation.code,
      joinUrl: origin ? codeToJoinUrl(reservation.code, origin) : `/meet/${reservation.code}`,
    });
  });

  /**
   * GET /api/meeting/rooms/:code
   *
   * 200: `{ code, exists, participantCount, waitingCount, locked }`
   * 404: `{ code, exists: false }` — an unknown code is a normal state for a
   *      mistyped invite, not an error, so this answers 200 with `exists:false`
   *      for malformed input and 404 only for well-formed-but-absent codes.
   */
  router.get('/api/meeting/rooms/:code', (req: Request, res: Response) => {
    const raw = String(req.params.code ?? '');
    const normalized = normalizeCode(raw);
    if (!normalized) {
      res.status(400).json({ code: 'invalid_code', message: 'That is not a valid meeting code', exists: false });
      return;
    }
    const room = registry.peek(normalized);
    if (!room) {
      res.status(404).json({ code: normalized, exists: false });
      return;
    }
    res.json({
      code: room.code,
      exists: true,
      participantCount: room.participantCount,
      waitingCount: room.waitingCount,
      locked: room.locked,
      ended: room.ended,
      createdAt: room.createdAt,
    });
  });

  return router;
}