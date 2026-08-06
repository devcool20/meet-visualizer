import { Router } from 'express';
import type { Store } from '../db/types.js';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { CardsService } from '../services/cards.js';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@stash/card-spec';

/**
 * User bootstrap + settings. `POST /api/me/bootstrap` is idempotent: called
 * right after Supabase Auth signup, it creates the `User` row and seeds
 * `SAMPLE_CARDS` (plan §4.2 step 3 / deliverable 3) exactly once.
 */
export function createUserRouter(store: Store, authProvider: AuthProvider): Router {
  const router = Router();
  const cards = new CardsService(store);
  router.use(requireAuth(authProvider));

  router.get('/api/me', async (req: AuthedRequest, res) => {
    const user = await store.getUser(req.user!.id);
    res.json({ user });
  });

  router.post('/api/me/bootstrap', async (req: AuthedRequest, res) => {
    const existing = await store.getUser(req.user!.id);
    if (existing) {
      res.json({ user: existing, seeded: false });
      return;
    }
    const user = await store.createUser({
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      settings: DEFAULT_USER_SETTINGS,
    });
    await cards.seedSampleCards(user.id);
    res.status(201).json({ user, seeded: true });
  });

  router.patch('/api/me/settings', async (req: AuthedRequest, res) => {
    const settings = req.body as Partial<UserSettings>;
    const existing = await store.getUser(req.user!.id);
    if (!existing) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }
    const merged: UserSettings = { ...existing.settings, ...settings };
    const updated = await store.updateUserSettings(req.user!.id, merged);
    res.json({ user: updated });
  });

  return router;
}
