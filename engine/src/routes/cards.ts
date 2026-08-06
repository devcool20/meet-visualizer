import { Router } from 'express';
import type { Store } from '../db/types.js';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { CardsService } from '../services/cards.js';

/** Cards CRUD API, scoped to the authenticated user (deliverable 3). */
export function createCardsRouter(store: Store, authProvider: AuthProvider): Router {
  const router = Router();
  const cards = new CardsService(store);
  router.use(requireAuth(authProvider));

  router.get('/api/cards', async (req: AuthedRequest, res) => {
    const status = req.query.status as 'draft' | 'approved' | undefined;
    const enabledOnly = req.query.enabledOnly === 'true';
    const list = await cards.list(req.user!.id, { status, enabledOnly });
    res.json({ cards: list });
  });

  router.get('/api/cards/:id', async (req: AuthedRequest, res) => {
    const card = await cards.get(req.user!.id, req.params.id);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ card });
  });

  router.post('/api/cards', async (req: AuthedRequest, res) => {
    try {
      const card = await cards.create(req.user!.id, req.body);
      res.status(201).json({ card });
    } catch (err) {
      res.status(400).json({ error: 'invalid_card', message: (err as Error).message });
    }
  });

  router.patch('/api/cards/:id', async (req: AuthedRequest, res) => {
    try {
      const card = await cards.update(req.user!.id, req.params.id, req.body);
      res.json({ card });
    } catch (err) {
      res.status(400).json({ error: 'update_failed', message: (err as Error).message });
    }
  });

  router.post('/api/cards/:id/approve', async (req: AuthedRequest, res) => {
    try {
      const card = await cards.approveDraft(req.user!.id, req.params.id);
      res.json({ card });
    } catch (err) {
      res.status(400).json({ error: 'approve_failed', message: (err as Error).message });
    }
  });

  router.delete('/api/cards/:id', async (req: AuthedRequest, res) => {
    await cards.delete(req.user!.id, req.params.id);
    res.status(204).end();
  });

  return router;
}
