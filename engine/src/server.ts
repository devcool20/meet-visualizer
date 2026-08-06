import express from 'express';
import cors from 'cors';
import http from 'http';
import { createRequire } from 'node:module';
import { config } from './config.js';
import { getStore } from './db/index.js';
import { createAuthProvider } from './auth/supabase.js';
import { DeviceAuth } from './auth/pairing.js';
import { Tier2Matcher } from './matching/tier2.js';
import { GeminiEmbeddingProvider, MockEmbeddingProvider } from './matching/gemini-embedding.js';
import { GeminiTier3Confirmer, MockTier3Confirmer, type Tier3Confirmer } from './matching/tier3.js';
import { attachWsServer } from './ws/server.js';
import { createHealthRouter } from './routes/health.js';
import { createPairingRouter } from './routes/pairing.js';
import { createCardsRouter } from './routes/cards.js';
import { createUserRouter } from './routes/user.js';
import { createNotionRouter } from './routes/notion.js';
import { NotionOAuthService, MockNotionOAuthClient } from './notion/oauth.js';
import { NotionSyncService } from './notion/sync.js';
import { RealNotionApi, type NotionApi } from './notion/api.js';
import { MockImageCache, type ImageCache, SupabaseImageCache } from './notion/image-cache.js';
import { createCardInferrer } from './notion/inference.js';
import { ReconciliationSweep } from './notion/reconciliation.js';
import { ActivitySnippetSweep } from './services/activity-sweep.js';
import { AesGcmEncryptor, type Encryptor } from './util/encryption.js';

/**
 * Local/no-config fallback key. STASH_ENCRYPTION_KEY MUST be set to a real
 * 32-byte secret in any environment that stores real Notion tokens or
 * opted-in snippets — this fallback exists purely so the engine can boot
 * with zero credentials configured (constraint: `/health` with no
 * credentials). It is not a secret; do not rely on it for anything real.
 */
const INSECURE_DEV_ONLY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');


/**
 * Stash Live engine — composition root (plan §2.9: index.ts -> server.ts +
 * ws/ + routes/).
 */
export async function buildApp() {
  const store = await getStore();
  const authProvider = createAuthProvider();
  const deviceAuth = new DeviceAuth(store);

  const embeddingProvider = config.useMockGemini
    ? new MockEmbeddingProvider()
    : new GeminiEmbeddingProvider(config.geminiApiKey);
  const tier2 = new Tier2Matcher(embeddingProvider);
  const tier3: Tier3Confirmer = config.useMockGemini
    ? new MockTier3Confirmer()
    : new GeminiTier3Confirmer(config.geminiApiKey);

  // Notion stack — mocked entirely in local/no-credentials mode so nothing
  // here ever makes a network call under STASH_LOCAL=1.
  const notionApi: NotionApi = {
    async queryDataSource() {
      return { results: [], has_more: false, next_cursor: null };
    },
  };
  const imageCache: ImageCache = new MockImageCache();
  const inferrer = createCardInferrer();
  const notionSync = new NotionSyncService(config.useMockNotion ? notionApi : buildRealNotionApi(), imageCache, inferrer, store);

  let encryptor: Encryptor;
  try {
    encryptor = new AesGcmEncryptor(config.encryptionKey || INSECURE_DEV_ONLY_ENCRYPTION_KEY);
  } catch {
    encryptor = new AesGcmEncryptor(INSECURE_DEV_ONLY_ENCRYPTION_KEY);
  }
  const notionOAuth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);

  const app = express();
  app.use(
    cors({
      origin: config.isLocal ? true : [config.productOrigin],
    }),
  );
  app.use(express.json());

  app.use(createHealthRouter());
  app.use(createPairingRouter(store, authProvider));
  app.use(createCardsRouter(store, authProvider));
  app.use(createUserRouter(store, authProvider));
  app.use(createNotionRouter(store, authProvider, notionOAuth, notionSync));

  const httpServer = http.createServer(app);
  attachWsServer(httpServer, { store, deviceAuth, tier2, tier3 });

  const reconciliation = new ReconciliationSweep(store, notionSync);
  const activitySweep = new ActivitySnippetSweep(store);

  return { app, httpServer, reconciliation, activitySweep, store };
}

function buildRealNotionApi(): NotionApi {
  // Constructed lazily so the @notionhq/client Client() call (which needs a
  // real integration/OAuth token to be useful) only happens outside mock
  // mode. The Connection's decrypted access token is looked up per-call by
  // NotionSyncService's caller in production wiring (left as an extension
  // point — the CardsService/routes layer resolves per-user connections).
  //
  // Loaded lazily and via require() (not a static import) so that engines
  // running fully in mock mode (STASH_LOCAL=1, no Notion credentials) never
  // need `@notionhq/client` to have resolved correctly, keeping the "starts
  // with zero credentials" constraint robust to that dependency's presence.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const require = createRequire(import.meta.url);
  const { Client } = require('@notionhq/client');
  const client = new Client({ auth: '' });
  return new RealNotionApi(client);
}

async function main() {
  const { httpServer, reconciliation, activitySweep } = await buildApp();

  httpServer.listen(config.port, () => {
    console.log(`[Stash Live Engine] listening on :${config.port} (mode=${config.isLocal ? 'local' : 'production'})`);
  });

  reconciliation.start();
  activitySweep.start();

  const shutdown = () => {
    console.log('\n[Stash Live Engine] shutting down...');
    reconciliation.stop();
    activitySweep.stop();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('[Stash Live Engine] failed to start:', err);
    process.exit(1);
  });
}
