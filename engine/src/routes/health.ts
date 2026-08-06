import { Router } from 'express';
import { config } from '../config.js';

/**
 * `/health` must respond with no credentials configured (constraint: "The
 * engine must actually start and serve /health with no credentials
 * configured (local mode)").
 */
export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      mode: config.isLocal ? 'local' : 'production',
      mocks: {
        notion: config.useMockNotion,
        gemini: config.useMockGemini,
        supabase: config.useMockSupabase,
      },
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
