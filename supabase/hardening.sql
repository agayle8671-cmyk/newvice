-- ============================================================
-- LeonidaVice — V3 Security Hardening & Schema Reconciliation
-- Idempotent: safe to re-run in the Supabase SQL Editor.
--
-- 1. Removes the over-permissive "Service role ..." policies that were
--    actually granted to the PUBLIC role (anon key shipped in browser JS could
--    INSERT/UPDATE video_catalog, write room_playback_state, aggregator_runs,
--    and delete session history). The service_role key bypasses RLS entirely,
--    so no write policy is needed for server/worker/crawler writes.
-- 2. Keeps public read access limited to active + approved catalog rows.
-- ============================================================

-- video_catalog: read-only for anon/authenticated; writes via service_role only
DROP POLICY IF EXISTS "Service role insert video_catalog" ON video_catalog;
DROP POLICY IF EXISTS "Service role update video_catalog" ON video_catalog;
DROP POLICY IF EXISTS "Public read video_catalog" ON video_catalog;
CREATE POLICY "Public read video_catalog"
  ON video_catalog FOR SELECT
  USING (is_active = true AND is_approved = true);

-- room_playback_state: public read, writes via service_role only (Durable Object)
DROP POLICY IF EXISTS "Service role write room_playback_state" ON room_playback_state;
DROP POLICY IF EXISTS "Public read room_playback_state" ON room_playback_state;
CREATE POLICY "Public read room_playback_state"
  ON room_playback_state FOR SELECT
  USING (true);

-- aggregator_runs: service_role only (RLS enabled, no policies = deny for anon)
DROP POLICY IF EXISTS "Service role aggregator_runs" ON aggregator_runs;

-- video_session_plays: server-managed only (API routes use the service role)
DROP POLICY IF EXISTS "Session plays read" ON video_session_plays;
DROP POLICY IF EXISTS "Session plays insert" ON video_session_plays;
DROP POLICY IF EXISTS "Session plays delete" ON video_session_plays;
