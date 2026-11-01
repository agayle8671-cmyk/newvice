-- ============================================================================
-- Leonida Vice — Newsroom Admin Articles & Cloud Storage Schema
-- Run this once in your Supabase SQL Editor to enable cloud article sync on Vercel
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newspaper_articles (
  slug          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT 'marco-reyes',
  date          TEXT NOT NULL,
  image         TEXT NOT NULL,
  excerpt       TEXT NOT NULL,
  read_mins     INTEGER NOT NULL DEFAULT 4,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  body          JSONB NOT NULL DEFAULT '[]'::jsonb,
  preset        TEXT NOT NULL DEFAULT 'standard-feature',
  status        TEXT NOT NULL DEFAULT 'published',
  featured_rank INTEGER,
  kicker        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newspaper_articles_status_date
  ON public.newspaper_articles (status, date DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newspaper_articles_category
  ON public.newspaper_articles (category);

ALTER TABLE public.newspaper_articles ENABLE ROW LEVEL SECURITY;

-- Public readers can view published articles; service-role handles admin writes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newspaper_articles'
      AND policyname = 'Public read published newspaper articles'
  ) THEN
    CREATE POLICY "Public read published newspaper articles"
      ON public.newspaper_articles
      FOR SELECT
      USING (status = 'published');
  END IF;
END $$;
