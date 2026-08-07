import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * STASH_LOCAL=1 is the documented local-dev escape hatch (plan §2.9 /
 * "local dev mode"): no Supabase, no Notion, no Gemini key required. A
 * seeded fake user, mock cards, and no WS auth let the rest of the team run
 * the engine end-to-end with zero external credentials. This must keep
 * working — losing it is treated as a regression.
 */
const isLocal = process.env.STASH_LOCAL === '1';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

/**
 * Sensitivity → threshold mapping (plan §2.4).
 *
 * ⚠ THESE NUMBERS ARE UNSET BY DECISION, NOT A BUG. The plan explicitly
 * withholds final T_fire / T_drop values pending Phase-0 task 0.4 (threshold
 * evaluation against recorded transcripts). The values below are starting
 * HYPOTHESES only, deliberately conservative, so the engine is runnable and
 * testable before that calibration happens. Do not treat them as tuned.
 * Whoever runs task 0.4 should replace this table and delete this warning.
 */
export interface SensitivityThresholds {
  tFire: number;
  tDrop: number;
}

export const SENSITIVITY_THRESHOLDS: Record<'certain' | 'balanced' | 'eager', SensitivityThresholds> = {
  // "Only when I'm certain" — hypothesis: fire rarely, escalate rarely.
  certain: { tFire: 0.9, tDrop: 0.8 },
  // "Balanced" — hypothesis, matches the old single-tier 0.88 as a rough anchor.
  balanced: { tFire: 0.84, tDrop: 0.7 },
  // "Eager" — hypothesis: fire more readily, escalate more of the middle band.
  eager: { tFire: 0.78, tDrop: 0.6 },
};

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  isLocal,

  // Datastore
  databaseUrl: process.env.DATABASE_URL || '',

  // Cache / pub-sub
  redisUrl: process.env.REDIS_URL || '',

  // Supabase auth
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Gemini (Tier 2 embeddings + Tier 3 confirmation)
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  embeddingModel: process.env.STASH_EMBEDDING_MODEL || 'text-embedding-004',
  embeddingDimensions: 768, // MUST match the vector(768) column — see plan §2.4.
  tier3Model: process.env.STASH_TIER3_MODEL || 'gemini-flash-latest',

  // Notion multi-tenant OAuth
  notionClientId: process.env.NOTION_CLIENT_ID || '',
  notionClientSecret: process.env.NOTION_CLIENT_SECRET || '',
  notionRedirectUri: process.env.NOTION_REDIRECT_URI || '',

  // Encryption for Connection.accessToken / refreshToken (AES-256-GCM, §2.6)
  // and opt-in ActivityEvent.snippet (§2.7). Must be 32 bytes, base64 or hex.
  encryptionKey: process.env.STASH_ENCRYPTION_KEY || '',

  productOrigin: process.env.STASH_PRODUCT_ORIGIN || 'https://meet-visualizer.vercel.app',

  // Pipeline tunables (plan §2.4)
  tier1MaxWindowChars: 600,
  tier2TimeoutMs: 300,
  tier2LruMax: 500,
  tier3RateLimitPerMinute: 6,
  wsMessageRateLimitPerSecond: 20,
  defaultCooldownMs: 120_000,
  interimDebounceMs: 400,
  heartbeatIntervalMs: 20_000, // also keeps the extension's MV3 SW alive — §3.1
  helloTimeoutMs: 5_000,
  pairingNonceTtlSeconds: 60,
  deviceTokenTtlDays: 30,
  deviceTokenRefreshWindowDays: 14,
  activityEventSnippetTtlHours: 24,

  useMockNotion: isLocal || !process.env.NOTION_CLIENT_ID,
  useMockGemini: isLocal || bool(process.env.STASH_MOCK_GEMINI, !process.env.GEMINI_API_KEY),
  useMockSupabase: isLocal || bool(process.env.STASH_MOCK_SUPABASE, !process.env.SUPABASE_URL),

  // AI generation
  aiProviderDefault: (process.env.STASH_AI_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'anthropic',
  aiKeys: {
    gemini: process.env.GEMINI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
  },
  aiModels: {
    gemini: process.env.STASH_AI_MODEL_GEMINI || 'gemini-flash-latest',
    openai: process.env.STASH_AI_MODEL_OPENAI || 'gpt-4.1-mini',
    anthropic: process.env.STASH_AI_MODEL_ANTHROPIC || 'claude-sonnet-4-5',
  },
  generationTotalBudgetMs: 8_000,
  generationProviderTimeoutMs: 6_000,
  groundingTimeoutMs: 1_500,
  imageVerifyTimeoutMs: 2_000,
  generationMaxOutputTokens: 900,
  generationCacheTtlSeconds: 86_400,
  generationRateLimitPerMinute: 6,
  generationRateLimitPerHour: 40,
  generatedHideGraceMs: 750,
  groundingLang: process.env.STASH_GROUNDING_LANG || 'en',
  groundingUserAgent: 'StashLive/0.1 (https://meet-visualizer.vercel.app)',

  // Image proxy
  imageProxyPublicOrigin: process.env.STASH_IMAGE_PROXY_ORIGIN || (process.env.STASH_PRODUCT_ORIGIN || 'https://meet-visualizer.vercel.app'),
  imageProxyMaxBytes: 5_000_000,
  imageProxyFetchTimeoutMs: 4_000,
  imageProxyCacheTtlSeconds: 86_400,
  imageProxyCacheMaxEntries: 200,
  imageProxyTokenTtlSeconds: 7 * 24 * 3600,

  useMockGeneration: isLocal || (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY),
};

export type Config = typeof config;
