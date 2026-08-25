import { Router, type Request, type Response } from 'express';
import type { Store } from '../db/types.js';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { PairingService } from '../auth/pairing.js';

/**
 * Extension pairing endpoints (plan §2.2), exactly as specified:
 *
 *   POST /api/extension/pairing-nonce   (authenticated) -> { nonce, expiresIn }
 *   POST /api/extension/pair            (NO auth, NO cookies) -> { token, deviceId }
 *
 * `/pair` is deliberately outside `requireAuth` — the whole point of the
 * nonce is that the extension service worker has no session cookie to
 * present (Supabase's browser client stores sessions in localStorage, which
 * the SW cannot read). The nonce itself is the credential, single-use and
 * 60s-lived. `sender.url` origin validation against the exact production
 * origin happens on the EXTENSION side (chrome.runtime.onMessageExternal),
 * not here — this endpoint has no way to see the calling origin once it's a
 * plain POST, which is exactly why the nonce has to be unguessable and
 * short-lived.
 */
export function createPairingRouter(store: Store, authProvider: AuthProvider): Router {
  const router = Router();
  const pairing = new PairingService(store);

  router.post('/api/extension/pairing-nonce', requireAuth(authProvider), async (req: AuthedRequest, res: Response) => {
    const result = await pairing.createNonce(req.user!.id);
    res.json(result);
  });

  router.post('/api/extension/pair', async (req: Request, res: Response) => {
    const { nonce, label } = (req.body ?? {}) as { nonce?: string; label?: string };
    if (typeof nonce !== 'string' || typeof label !== 'string' || !label.trim()) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const result = await pairing.pair(nonce, label.trim().slice(0, 128));
    if (!result) {
      res.status(400).json({ error: 'invalid_or_expired_nonce' });
      return;
    }
    res.json({ token: result.token, deviceId: result.device.id, expiresAt: result.device.expiresAt.toISOString() });
  });

  router.get('/api/extension/devices', requireAuth(authProvider), async (req: AuthedRequest, res: Response) => {
    const devices = await store.listDevices(req.user!.id);
    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        label: d.label,
        lastSeenAt: d.lastSeenAt,
        expiresAt: d.expiresAt,
        revokedAt: d.revokedAt,
      })),
    });
  });

  router.post('/api/extension/devices/:id/revoke', requireAuth(authProvider), async (req: AuthedRequest, res: Response) => {
    await store.revokeDevice(req.user!.id, (req as Request).params.id);
    res.json({ ok: true });
  });

  return router;
}
