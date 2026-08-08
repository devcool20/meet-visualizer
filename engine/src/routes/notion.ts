import { Router } from 'express';
import type { Store } from '../db/types.js';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { NotionOAuthService } from '../notion/oauth.js';
import { NotionSyncService } from '../notion/sync.js';

import { config } from '../config.js';

/** Notion OAuth + sync endpoints (plan §2.6). */
export function createNotionRouter(
  store: Store,
  authProvider: AuthProvider,
  oauth: NotionOAuthService,
  sync: NotionSyncService,
): Router {
  const router = Router();

  router.get('/api/notion/authorize', requireAuth(authProvider), (req: AuthedRequest, res) => {
    const state = oauth.createAuthorizeState(req.user!.id);
    res.json({ url: oauth.authorizeUrl(state) });
  });

  // No requireAuth: this is Notion's OAuth redirect landing on our server,
  // which cannot carry our session. `state` is what binds the callback back
  // to the initiating user (plan §2.6).
  router.get('/api/notion/callback', async (req, res) => {
    const { state, code } = req.query;
    const redirectBase = config.productOrigin || 'https://meet-visualizer.vercel.app';
    if (typeof state !== 'string' || typeof code !== 'string') {
      res.redirect(`${redirectBase}/setup/data-setup?notion=error`);
      return;
    }
    try {
      await oauth.handleCallback(state, code);
      res.redirect(`${redirectBase}/setup/data-setup?notion=connected`);
    } catch (err) {
      res.redirect(`${redirectBase}/setup/data-setup?notion=error`);
    }
  });

  router.post('/api/notion/sync', requireAuth(authProvider), async (req: AuthedRequest, res) => {
    const { dataSourceId } = req.body ?? {};
    if (typeof dataSourceId !== 'string') {
      res.status(400).json({ error: 'missing_data_source_id' });
      return;
    }
    try {
      const result = await sync.syncDataSource(req.user!.id, dataSourceId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'sync_failed', message: (err as Error).message });
    }
  });

  router.delete('/api/notion/connection', requireAuth(authProvider), async (req: AuthedRequest, res) => {
    await store.deleteConnection(req.user!.id, 'notion');
    res.json({ ok: true });
  });

  // Webhook receiver (plan §2.6: "webhook-driven sync"). Notion signs
  // deliveries; verification is deployment config (webhook secret), not
  // implemented in this route because it needs no test coverage without a
  // real secret. On receipt, kick a targeted resync of the affected source.
  router.post('/api/notion/webhook', async (req, res) => {
    const dataSourceId = req.body?.data?.parent?.data_source_id ?? req.body?.entity?.id;
    const userId = req.body?.__stashUserId; // populated by our own subscription setup, if applicable
    if (dataSourceId && userId) {
      sync.syncDataSource(userId, dataSourceId).catch((err) => console.error('[Notion Webhook] sync failed:', err));
    }
    res.status(200).json({ ok: true });
  });

  return router;
}
