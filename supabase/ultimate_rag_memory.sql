-- ====================================================================================================
-- LEONIDA VICE (NEWVICE) — ULTIMATE RAG AI TEAM & KNOWLEDGE BASE MIGRATION
-- Platform: https://newvice.vercel.app | Supabase Project: ylinzijawuzvnkzucoxf
-- 
-- Run this script once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ylinzijawuzvnkzucoxf/sql
-- ====================================================================================================

-- 1. Enable Required Extensions for Vector, Full-Text, and Trigram Search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- 2. Unified Knowledge Base & Multi-Tier Agent Memory Table
CREATE TABLE IF NOT EXISTS public.lv_agent_knowledge_memory (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    content_hash TEXT NOT NULL UNIQUE,
    memory_tier TEXT NOT NULL CHECK (memory_tier IN (
        'semantic_lore',       -- Chunked knowledge from the 6 Knowledge Base .txt files
        'procedural_sop',      -- Verbatim step-by-step job instructions (infer=False)
        'episodic_event',      -- Timestamped run logs, reflections, and past drafts
        'policy_constraint'    -- Sgt. Cruz legal, DMCA, and Take-Two IP guardrails
    )),
    source_file TEXT NOT NULL,
    domain_pillar TEXT NOT NULL,
    section_title TEXT NOT NULL,
    content TEXT NOT NULL,

    -- Scoping & Filtering Metadata
    agent_scope TEXT[] NOT NULL DEFAULT ARRAY['all'], -- e.g., {'chief-120b', 'wire-20b'}
    entity_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- e.g., {'lucia_caminos', 'port_gellhorn'}
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- Bi-Temporal Lineage & Relevance Decay Controls
    importance_weight FLOAT NOT NULL DEFAULT 1.0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT NULL,
    superseded_by BIGINT REFERENCES public.lv_agent_knowledge_memory(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Auto-Generated Full-Text Search Column (Kept in sync automatically by Postgres)
    fts TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED,

    -- Cloud Vector Embedding (384 dimensions: high-throughput, fast HNSW, zero external API fees)
    embedding VECTOR(384) NOT NULL
);

-- 3. High-Performance Indexes
CREATE INDEX IF NOT EXISTS lv_memory_hnsw_idx 
    ON public.lv_agent_knowledge_memory USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS lv_memory_fts_gin_idx 
    ON public.lv_agent_knowledge_memory USING gin (fts);

CREATE INDEX IF NOT EXISTS lv_memory_agent_scope_idx 
    ON public.lv_agent_knowledge_memory USING gin (agent_scope);

CREATE INDEX IF NOT EXISTS lv_memory_entity_tags_idx 
    ON public.lv_agent_knowledge_memory USING gin (entity_tags);

CREATE INDEX IF NOT EXISTS lv_memory_trgm_idx 
    ON public.lv_agent_knowledge_memory USING gin (content gin_trgm_ops);

-- 4. Enable Row Level Security (RLS) with Public Read Policy
ALTER TABLE public.lv_agent_knowledge_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read lv_agent_knowledge_memory" ON public.lv_agent_knowledge_memory;
CREATE POLICY "Public read lv_agent_knowledge_memory"
    ON public.lv_agent_knowledge_memory FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Service role write lv_agent_knowledge_memory" ON public.lv_agent_knowledge_memory;
CREATE POLICY "Service role write lv_agent_knowledge_memory"
    ON public.lv_agent_knowledge_memory FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Three-Lane Reciprocal Rank Fusion (RRF) Hybrid Search Function
CREATE OR REPLACE FUNCTION public.hybrid_agent_recall(
    query_text TEXT,
    query_embedding VECTOR(384),
    target_agent TEXT DEFAULT 'all',
    filter_tiers TEXT[] DEFAULT ARRAY['semantic_lore', 'procedural_sop', 'episodic_event', 'policy_constraint'],
    query_entities TEXT[] DEFAULT ARRAY[]::TEXT[],
    match_count INT DEFAULT 8,
    full_text_weight FLOAT DEFAULT 1.0,
    semantic_weight FLOAT DEFAULT 1.0,
    entity_weight FLOAT DEFAULT 1.2,
    rrf_k INT DEFAULT 60
)
RETURNS TABLE (
    id BIGINT,
    memory_tier TEXT,
    source_file TEXT,
    section_title TEXT,
    content TEXT,
    entity_tags TEXT[],
    cosine_similarity FLOAT,
    rrf_score FLOAT
)
LANGUAGE sql
STABLE
AS $$
WITH active_pool AS (
    SELECT *
    FROM public.lv_agent_knowledge_memory
    WHERE valid_until IS NULL
      AND memory_tier = ANY(filter_tiers)
      AND (agent_scope @> ARRAY[target_agent] OR agent_scope @> ARRAY['all'])
),
semantic_lane AS (
    SELECT
        id,
        CASE 
            WHEN query_embedding IS NOT NULL THEN (1 - (embedding <=> query_embedding))
            ELSE 0.0 
        END AS sim_score,
        ROW_NUMBER() OVER (
            ORDER BY CASE WHEN query_embedding IS NOT NULL THEN (embedding <=> query_embedding) ELSE 1.0 END
        ) AS rank_ix
    FROM active_pool
    WHERE query_embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 3
),
keyword_lane AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) DESC
        ) AS rank_ix
    FROM active_pool
    WHERE fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
),
entity_lane AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY importance_weight DESC, created_at DESC
        ) AS rank_ix
    FROM active_pool
    WHERE array_length(query_entities, 1) > 0
      AND entity_tags && query_entities
    LIMIT match_count * 2
)
SELECT
    ap.id,
    ap.memory_tier,
    ap.source_file,
    ap.section_title,
    ap.content,
    ap.entity_tags,
    COALESCE(s.sim_score, 0.0)::FLOAT AS cosine_similarity,
    (
        COALESCE(semantic_weight / (rrf_k + s.rank_ix), 0.0) +
        COALESCE(full_text_weight / (rrf_k + k.rank_ix), 0.0) +
        COALESCE(entity_weight / (rrf_k + e.rank_ix), 0.0) +
        CASE 
            WHEN ap.memory_tier IN ('procedural_sop', 'policy_constraint') THEN 0.015 * ap.importance_weight
            ELSE 0.0
        END
    )::FLOAT AS rrf_score
FROM semantic_lane s
FULL OUTER JOIN keyword_lane k ON s.id = k.id
FULL OUTER JOIN entity_lane e ON COALESCE(s.id, k.id) = e.id
JOIN active_pool ap ON ap.id = COALESCE(s.id, k.id, e.id)
ORDER BY rrf_score DESC
LIMIT match_count;
$$;
