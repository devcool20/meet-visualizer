/**
 * Generate card route (plan §4b).
 *
 * POST /api/ai/generate-card — auth required.
 * Body: { transcript: string, context?: string }
 * Calls CardGenerator.generate(), returns the card spec, and pushes the card
 * as a {t:'show', origin:'generated'} frame over the user's existing WS
 * session (if they have one connected).
 */
import { Router } from 'express';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import type { CardGenerator, GenerateOutcome } from '../generation/card-generator.js';
import { findSessionByUserId } from '../ws/session-registry.js';

export function createGenerateCardRouter(
  authProvider: AuthProvider,
  generator: CardGenerator,
): Router {
  const router = Router();
  router.use(requireAuth(authProvider));

  router.post('/api/ai/generate-card', async (req: AuthedRequest, res) => {
    const { transcript, context: _context } = req.body as {
      transcript?: string;
      context?: string;
    };

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      res.status(400).json({ error: 'missing_transcript', message: 'transcript is required' });
      return;
    }

    const outcome: GenerateOutcome = await generator.generate(req.user!.id, transcript, {
      autoDismissMs: 12_000, // default; the WS path uses the user's actual setting
    });

    if (outcome.kind === 'failed') {
      // Don't send generate_failed via HTTP — the WS session handles that
      res.status(400).json({ error: outcome.code, message: outcome.message });
      return;
    }

    // Push over WS if the user has a connected session
    const session = findSessionByUserId(req.user!.id);
    if (session) {
      session.send({
        t: 'show',
        card: outcome.card,
        matchedPhrase: transcript.slice(0, 120),
        score: 1,
        origin: 'generated',
      });
    }

    res.json({
      card: outcome.card,
      fromCache: outcome.fromCache,
      provider: outcome.provider,
      model: outcome.model,
      grounded: outcome.grounded,
    });
  });

  return router;
}
