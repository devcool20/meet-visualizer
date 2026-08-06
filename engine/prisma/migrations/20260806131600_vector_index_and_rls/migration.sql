-- pgvector cosine-distance index for Tier 2 similarity search (plan §2.4).
-- HNSW gives good recall/latency for the query sizes we expect; ivfflat is a
-- reasonable alternative if the extension version predates HNSW support.
CREATE INDEX IF NOT EXISTS "Card_embedding_hnsw_idx"
  ON "Card" USING hnsw ("embedding" vector_cosine_ops);

-- Row Level Security -- defence in depth only.
--
-- IMPORTANT (plan §2.1): this engine talks to Postgres through a direct,
-- privileged Prisma connection string, NOT through the Supabase client /
-- PostgREST. Postgres RLS does not apply to a role with BYPASSRLS or to the
-- connection Prisma normally uses in this deployment model, so these
-- policies are NOT the tenant boundary for this codebase. The tenant
-- boundary is application-level scoping in src/db/*.ts (every query filters
-- by userId), verified by src/test/cross-tenant.test.ts. These policies exist
-- only to protect any future access path that DOES go through a
-- non-privileged Supabase-client connection (e.g. a browser client using an
-- anon/authenticated JWT).
ALTER TABLE "Card" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_owner_only" ON "Card"
  USING ("userId" = current_setting('request.jwt.claim.sub', true));
CREATE POLICY "connection_owner_only" ON "Connection"
  USING ("userId" = current_setting('request.jwt.claim.sub', true));
CREATE POLICY "device_owner_only" ON "Device"
  USING ("userId" = current_setting('request.jwt.claim.sub', true));
CREATE POLICY "activity_owner_only" ON "ActivityEvent"
  USING ("userId" = current_setting('request.jwt.claim.sub', true));
