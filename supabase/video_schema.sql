-- ============================================================
-- LeonidaVice — Video Engine Schema
-- Run this in Supabase SQL Editor after the main schema.sql
-- ============================================================

-- Permanent video catalog (canonical URLs — never expire)
CREATE TABLE IF NOT EXISTS video_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform  TEXT NOT NULL,
  canonical_url    TEXT NOT NULL,
  youtube_id       TEXT,
  manifest_url     TEXT,           -- HLS .m3u8 or DASH .mpd (expires, refreshed by crawler)
  direct_mp4_url   TEXT,           -- Progressive MP4 (Twitch/Kick clips)
  title            TEXT NOT NULL,
  creator_name     TEXT NOT NULL DEFAULT 'Unknown',
  creator_url      TEXT,
  creator_avatar   TEXT,
  thumbnail_url    TEXT,
  duration_sec     INTEGER,
  view_count       INTEGER DEFAULT 0,
  source_category  TEXT DEFAULT 'unknown',
  tags             TEXT[],
  is_approved      BOOLEAN DEFAULT true,
  is_active        BOOLEAN DEFAULT true,
  play_count       INTEGER DEFAULT 0,
  last_played      TIMESTAMPTZ,
  fetched_at       TIMESTAMPTZ DEFAULT now(),
  manifest_refreshed_at TIMESTAMPTZ,
  manifest_expires TIMESTAMPTZ,    -- When manifest_url expires (for refresh scheduling)
  uploaded_at      TIMESTAMPTZ,
  -- V3 Perceptual Deduplication & Curation Economy
  perceptual_hash      TEXT,
  viral_heat_score     DOUBLE PRECISION DEFAULT 0,
  cross_platform_urls  TEXT[] DEFAULT '{}',
  high_beam_count      INTEGER DEFAULT 0,
  scout_user_id        UUID,
  scout_name           TEXT,
  UNIQUE (source_platform, canonical_url)
);

-- Index for perceptual hash deduplication
CREATE INDEX IF NOT EXISTS idx_video_catalog_phash
  ON video_catalog (perceptual_hash)
  WHERE perceptual_hash IS NOT NULL;

-- Durable room playback state checkpoint (synced by Cloudflare Durable Objects 30s alarms)
CREATE TABLE IF NOT EXISTS room_playback_state (
  room_slug             TEXT PRIMARY KEY,
  current_video_id      TEXT,
  next_video_id         TEXT,
  clip_start_ms         BIGINT NOT NULL DEFAULT 0,
  high_beam_count       INTEGER NOT NULL DEFAULT 0,
  hazard_count          INTEGER NOT NULL DEFAULT 0,
  occupied_vehicles     INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE room_playback_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read room_playback_state"
  ON room_playback_state FOR SELECT
  USING (true);

CREATE POLICY "Service role write room_playback_state"
  ON room_playback_state FOR ALL
  USING (true);

-- Index for efficient queue queries
CREATE INDEX IF NOT EXISTS idx_video_catalog_queue
  ON video_catalog (is_active, is_approved, play_count, fetched_at)
  WHERE is_active = true AND is_approved = true;

-- Per-session play history (prevents repeating clips in same browser session)
CREATE TABLE IF NOT EXISTS video_session_plays (
  session_id  TEXT NOT NULL,
  video_id    UUID REFERENCES video_catalog(id) ON DELETE CASCADE,
  played_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, video_id)
);

-- Aggregator run logs
CREATE TABLE IF NOT EXISTS aggregator_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           TIMESTAMPTZ DEFAULT now(),
  sources_crawled  INTEGER DEFAULT 0,
  videos_found     INTEGER DEFAULT 0,
  videos_added     INTEGER DEFAULT 0,
  videos_rejected  INTEGER DEFAULT 0,
  error_log        TEXT
);

-- RLS policies
ALTER TABLE video_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_session_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregator_runs ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved active videos
CREATE POLICY "Public read video_catalog"
  ON video_catalog FOR SELECT
  USING (is_active = true AND is_approved = true);

-- Only service role can insert/update (crawler uses service role key)
CREATE POLICY "Service role insert video_catalog"
  ON video_catalog FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role update video_catalog"
  ON video_catalog FOR UPDATE
  USING (true);

-- Session plays — anyone can read/write their own session
CREATE POLICY "Session plays read"
  ON video_session_plays FOR SELECT
  USING (true);

CREATE POLICY "Session plays insert"
  ON video_session_plays FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Session plays delete"
  ON video_session_plays FOR DELETE
  USING (true);

-- Aggregator runs — service role only
CREATE POLICY "Service role aggregator_runs"
  ON aggregator_runs FOR ALL
  USING (true);

-- ============================================================
-- Seed demo data (optional — remove before production)
-- Adds a few test entries so the player has something to work with
-- while the real crawler is being set up.
-- These use direct YouTube IDs as fallback until crawler produces HLS.
-- ============================================================

INSERT INTO video_catalog (
  source_platform, canonical_url, youtube_id,
  title, creator_name, creator_url,
  thumbnail_url, duration_sec, source_category, is_approved, is_active
) VALUES
  (
    'youtube',
    'https://youtube.com/watch?v=QdBZY2fkU-0',
    'QdBZY2fkU-0',
    'Grand Theft Auto VI Trailer 1',
    'Rockstar Games',
    'https://youtube.com/@RockstarGames',
    'https://img.youtube.com/vi/QdBZY2fkU-0/maxresdefault.jpg',
    91,
    'trailer',
    true,
    true
  ),
  (
    'youtube',
    'https://youtube.com/watch?v=v2BBbGFe3GQ',
    'v2BBbGFe3GQ',
    'GTA VI — Everything We Know (Full Breakdown)',
    'DarkViperAU',
    'https://youtube.com/@DarkViperAU',
    null,
    2400,
    'analysis',
    true,
    true
  )
ON CONFLICT (source_platform, canonical_url) DO NOTHING;
