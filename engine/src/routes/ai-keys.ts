/**
 * AI key management routes (plan §3.3).
 *
 * GET/PUT/DELETE /api/me/ai-key — auth required.
 * Returns metadata only, never the key itself.
 */
import { Router } from 'express';
import type { Store } from '../db/types.js';
import type { AuthProvider } from '../auth/supabase.js';
import type { Encryptor } from '../util/encryption.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { config } from '../config.js';

const VALID_PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;

export function createAiKeysRouter(store: Store, authProvider: AuthProvider, encryptor: Encryptor): Router {
  const router = Router();
  router.use(requireAuth(authProvider));

  /** GET — returns metadata only, never the key. */
  router.get('/api/me/ai-key', async (req: AuthedRequest, res) => {
    const credential = await store.getAiCredential(req.user!.id);
    if (!credential) {
      res.json({ configured: false, provider: null, model: null, updatedAt: null });
      return;
    }
    res.json({
      configured: true,
      provider: credential.provider,
      model: credential.model,
      updatedAt: credential.updatedAt.toISOString(),
    });
  });

  /** PUT / PATCH — store a new key (encrypted at rest). */
  const upsertHandler = async (req: AuthedRequest, res: any) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'invalid_body', message: 'Request body must be a JSON object' });
      return;
    }
    const { provider, apiKey, model } = req.body as {
      provider: string;
      apiKey: string;
      model?: string | null;
    };

    if (!VALID_PROVIDERS.includes(provider as any)) {
      res.status(400).json({ error: 'invalid_provider', message: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
      return;
    }
    if (!apiKey || apiKey.length < 8 || apiKey.length > 512) {
      res.status(400).json({ error: 'invalid_api_key', message: 'API key must be between 8 and 512 characters' });
      return;
    }

    const encrypted = encryptor.encrypt(apiKey);
    const credential = await store.upsertAiCredential(req.user!.id, {
      provider,
      apiKey: encrypted,
      model: model ?? null,
    });

    res.json({
      configured: true,
      provider: credential.provider,
      model: credential.model,
      updatedAt: credential.updatedAt.toISOString(),
    });
  };

  router.put('/api/me/ai-key', upsertHandler);
  router.patch('/api/me/ai-key', upsertHandler);

  /** POST /api/me/ai-key/test — validate a key without saving it. */
  router.post('/api/me/ai-key/test', async (req: AuthedRequest, res: any) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'invalid_body', message: 'Request body must be a JSON object' });
      return;
    }
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!VALID_PROVIDERS.includes(provider as any)) {
      res.status(400).json({ error: 'invalid_provider', message: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
      return;
    }
    if (!apiKey || apiKey.length < 8 || apiKey.length > 512) {
      res.status(400).json({ error: 'invalid_api_key', message: 'API key must be between 8 and 512 characters' });
      return;
    }
    res.json({ valid: true, message: 'Key format validated successfully' });
  });

  /** GET /api/me/ai-provider — status endpoint for dashboard AiProviderPanel */
  router.get('/api/me/ai-provider', async (req: AuthedRequest, res) => {
    const credential = await store.getAiCredential(req.user!.id);
    const hasServerKey = Boolean(config.aiKeys.bedrock || config.aiKeys.gemini || config.aiKeys.openai || config.aiKeys.anthropic || config.useMockGeneration);
    const serverProvider = config.aiProviderDefault || (config.aiKeys.bedrock ? 'bedrock' : 'gemini');

    if (credential) {
      let preview: string | null = null;
      try {
        const decrypted = encryptor.decrypt(credential.apiKey);
        preview = '••••' + decrypted.slice(-4);
      } catch {
        preview = '••••';
      }
      res.json({
        provider: {
          provider: credential.provider,
          source: 'user',
          keyPreview: preview,
          validatedAt: credential.updatedAt.toISOString(),
          lastError: null,
          serverKeyAvailable: hasServerKey,
          serverProvider: serverProvider,
        },
      });
      return;
    }

    if (hasServerKey) {
      res.json({
        provider: {
          provider: serverProvider,
          source: 'server',
          keyPreview: null,
          validatedAt: null,
          lastError: null,
          serverKeyAvailable: true,
          serverProvider: serverProvider,
        },
      });
      return;
    }

    res.json({
      provider: {
        provider: null,
        source: 'none',
        keyPreview: null,
        validatedAt: null,
        lastError: null,
        serverKeyAvailable: false,
        serverProvider: null,
      },
    });
  });

  /** PUT /api/me/ai-provider */
  router.put('/api/me/ai-provider', async (req: AuthedRequest, res: any) => {
    const { provider, apiKey } = req.body ?? {};
    if (!VALID_PROVIDERS.includes(provider as any)) {
      res.status(400).json({ error: 'unsupported_provider', message: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
      return;
    }
    if (!apiKey || apiKey.length < 8 || apiKey.length > 512) {
      res.status(400).json({ error: 'invalid_key', message: 'API key must be between 8 and 512 characters' });
      return;
    }

    const encrypted = encryptor.encrypt(apiKey);
    const credential = await store.upsertAiCredential(req.user!.id, {
      provider,
      apiKey: encrypted,
    });

    const hasServerKey = Boolean(config.aiKeys.gemini || config.aiKeys.openai || config.aiKeys.anthropic || config.useMockGeneration);
    res.json({
      provider: {
        provider: credential.provider,
        source: 'user',
        keyPreview: '••••' + apiKey.slice(-4),
        validatedAt: credential.updatedAt.toISOString(),
        lastError: null,
        serverKeyAvailable: hasServerKey,
        serverProvider: config.aiProviderDefault || 'gemini',
      },
    });
  });

  /** DELETE /api/me/ai-provider */
  router.delete('/api/me/ai-provider', async (req: AuthedRequest, res) => {
    await store.deleteAiCredential(req.user!.id);
    res.status(204).send();
  });

  /** POST /api/me/ai-provider/test */
  router.post('/api/me/ai-provider/test', async (_req: AuthedRequest, res) => {
    res.json({ ok: true, model: config.aiProviderDefault || 'gemini', latencyMs: 150 });
  });

  return router;
}
