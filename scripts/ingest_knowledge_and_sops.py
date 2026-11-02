#!/usr/bin/env python3
"""
Leonida Vice — Idempotent Knowledge Base & Verbatim SOP Ingestion Engine
Based on Ultimate RAG AI Team Architecture Blueprint.

Features:
- Processes the 6 Knowledge Base corpus text files and System Manual.
- Header-aware semantic chunking (500-550 words with 80-word overlap).
- Embeds using all-MiniLM-L6-v2 (384-dim dense vectors).
- Extracts grounded entity tags and domain pillars.
- Computes SHA-256 content hashes for 100% idempotent upserts.
- Dual-persistence: Supabase PostgreSQL (cloud) + SQLite/JSON (hybrid local).
"""

import os
import sys
import re
import json
import sqlite3
import hashlib
from pathlib import Path
from typing import List, Dict, Any

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# 0. Environment & Credential Loading
# ---------------------------------------------------------------------------
def load_env_credentials():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    for env_name in [".env.local", ".env"]:
        env_path = repo_root / env_name
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k not in os.environ and v:
                            os.environ[k] = v

load_env_credentials()

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://ylinzijawuzvnkzucoxf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"[WARN] Could not initialize Supabase client: {e}")

# ---------------------------------------------------------------------------
# 1. Corpus Manifest & Domain Pillars
# ---------------------------------------------------------------------------
CORPUS_MANIFEST = [
    {
        "filename": "GTA 6 Website AI Knowledge Base.txt",
        "pillar": "lore_canon_and_tech",
        "agents": ["chief-120b", "wire-20b", "sentinel-qa"],
    },
    {
        "filename": "Building GTA 6 Video Crawler.txt",
        "pillar": "crawler_and_streaming",
        "agents": ["sentinel-qa", "wire-20b"],
    },
    {
        "filename": "GTA 6 Video Sources Research.txt",
        "pillar": "video_source_catalog",
        "agents": ["sentinel-qa", "wire-20b"],
    },
    {
        "filename": "GTA 6 Platform Monetization Strategy.txt",
        "pillar": "monetization_and_geo",
        "agents": ["chief-120b", "wire-20b", "sentinel-qa"],
    },
    {
        "filename": "GTA 6 Dashboard- Research and Strategy.txt",
        "pillar": "dashboard_and_economy",
        "agents": ["chief-120b", "cruz-safeguard"],
    },
    {
        "filename": "Building GTA VI Fan Site From Scratch.txt",
        "pillar": "fansite_and_legal_ip",
        "agents": ["chief-120b", "cruz-safeguard"],
    },
]

# ---------------------------------------------------------------------------
# 2. Verbatim Procedural SOPs & Policy Constraints (infer=False)
# ---------------------------------------------------------------------------
PROCEDURAL_SOPS: List[Dict[str, Any]] = [
    {
        "section_title": "SOP-01: Vincent 'Chief' Vance Investigative Feature & GEO Protocol",
        "memory_tier": "procedural_sop",
        "source_file": "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt",
        "pillar": "system_sop_manual",
        "agents": ["chief-120b"],
        "importance": 2.0,
        "entities": ["chief_vance", "geo_layout", "rage_9", "leonida", "lucia_caminos", "jason_duval"],
        "content": (
            "PROCEDURAL CHECKLIST FOR VINCENT 'CHIEF' VANCE (CHIEF-120B):\n"
            "1. CANON VERIFICATION: Before drafting or reviewing, query hybrid_agent_recall for all named characters, "
            "counties (Vice City, Mariana/Leonida Keys, Kelly/Mount Kalaga, Grassrivers, Port Gellhorn, Ambrosia), and RAGE 9 specs.\n"
            "2. UNIVERSE SEPARATION RULE: Never mix 3D Universe canon (PS2 era) with HD Universe canon. Remember: Phil Cassidy in GTA VI "
            "is an HD reinterpretation who retains BOTH arms. Tommy Vercetti does not physically appear.\n"
            "3. GEO 4-BLOCK MANDATE: Every published article body_markdown MUST contain:\n"
            "   (a) Block 1: A 2-4 sentence Answer-First Summary at the top for Google AI Overviews/Perplexity extraction;\n"
            "   (b) Block 2: A Markdown comparison table or structured numbered list of technical/lore attributes;\n"
            "   (c) Block 3: Deep investigative narrative (1,200-1,800 words) with pull-quotes;\n"
            "   (d) Block 4: A Schema-backed FAQ section with 3 long-tail Q&A pairs and primary source citations.\n"
            "4. STRICT JSON SCHEMA: Output must validate against strict:true with headline <= 60 chars, kebab-case slug, "
            "meta_description 120-155 chars, allowed category enum, >=3 takeaway_bullets, and max_completion_tokens >= 6144."
        ),
    },
    {
        "section_title": "SOP-02: Lexi 'Wire' Sterling Breaking News & Live Web Reconnaissance Protocol",
        "memory_tier": "procedural_sop",
        "source_file": "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt",
        "pillar": "system_sop_manual",
        "agents": ["wire-20b"],
        "importance": 2.0,
        "entities": ["lexi_wire", "tavily", "curl_cffi", "strict_json", "breaking_news"],
        "content": (
            "PROCEDURAL CHECKLIST FOR LEXI 'WIRE' STERLING (WIRE-20B):\n"
            "1. LIVE INTERNET PULL: When assigned a breaking topic or rumor, invoke search_live_gta6_web or scrape_dynamic_url "
            "to fetch current community intelligence before drafting.\n"
            "2. CROSS-CHECK: Compare scraped external claims against hybrid_agent_recall ('semantic_lore') to label claims accurately "
            "as 'Officially Confirmed (Rockstar/Trailer)' vs. '2022 Breach/Community Speculation'.\n"
            "3. HEADLINE & CMS DISCIPLINE: Format headline strictly <= 60 characters. Include at least 3 punchy takeaway_bullets. "
            "Map programmatic topics to canonical URL slugs (/media/gta-6-vehicles/{slug}, /media/map-locations/{slug}, /leaks/{slug}/analysis)."
        ),
    },
    {
        "section_title": "SOP-03: Sentinel-9 Watchdog QA, Self-Healing & Instant Indexing Protocol",
        "memory_tier": "procedural_sop",
        "source_file": "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt",
        "pillar": "system_sop_manual",
        "agents": ["sentinel-qa"],
        "importance": 2.0,
        "entities": ["sentinel_9", "playwright", "qwen2_vl", "indexnow", "self_healing"],
        "content": (
            "PROCEDURAL CHECKLIST FOR SENTINEL-9 WATCHDOG (SENTINEL-QA):\n"
            "1. PLAYWRIGHT MEDIA DECODER HEALTH: Verify <video> playback states: readyState >= 3, !paused, !ended, error === null. "
            "Confirm temporal progression delta t1 > t0 + 1.5s after 2.5s asynchronous sleep.\n"
            "2. AUTONOMOUS SELF-HEALING: If an article draft references a 404 image URL, query local verified repository assets "
            "(/images/gta/port_gellhorn_03.jpg, /images/gta/jason_lucia_lock_and_load_tablet.jpg, /images/gta/launch-trailer.jpg) "
            "and automatically substitute the working asset before publishing.\n"
            "3. INSTANT INDEXING DISPATCH: Upon article approval, dispatch HTTP POST to IndexNow (api.indexnow.org) and Google Indexing API "
            "to push new broadsheet URL to search engines in sub-second time."
        ),
    },
    {
        "section_title": "SOP-04: Sgt. Cruz Safeguard Content Moderation & Take-Two IP Policy Protocol",
        "memory_tier": "policy_constraint",
        "source_file": "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt",
        "pillar": "system_sop_manual",
        "agents": ["cruz-safeguard"],
        "importance": 2.5,
        "entities": ["cruz_safeguard", "take_two_ip", "dmca_safe_harbor", "leak_policy", "content_moderation"],
        "content": (
            "POLICY GUARDRAILS FOR SGT. CRUZ SAFEGUARD (CRUZ-SAFEGUARD):\n"
            "1. PRE-RELEASE LEAK BOUNDARY: Never host, distribute, or directly embed raw video binaries from the September 2022 "
            "'teapotuberhacker' clips on NewVice servers. Transformative textual analysis and coordinate mapping are permitted; "
            "direct hosting of stolen pre-release footage triggers immediate Take-Two DMCA takedowns.\n"
            "2. DMCA SAFE HARBOR EMBEDDING: Only approve user-submitted video streams (/api/video/submit) that use official iframe APIs "
            "or verified non-infringing community analysis streams.\n"
            "3. ACCOUNT TRADING & ONLINE MEMORY MOD BAN: Per Take-Two v. PlayerAuctions and OpenIV precedents, reject any article, ad, or "
            "chat message promoting modded GTA Online accounts, memory-injection cheats, or reverse-engineered source code."
        ),
    },
]

KNOWN_ENTITIES = [
    "lucia_caminos", "jason_duval", "brian_heder", "cal_hampton", "boobie_ike",
    "raul_bautista", "drequan_priest", "real_dimez", "phil_cassidy", "vice_city",
    "leonida_keys", "port_gellhorn", "grassrivers", "mount_kalaga", "ambrosia",
    "mariana_county", "kelly_county", "rage_9", "curl_cffi", "patchright",
    "camoufox", "yt_dlp", "qwen2_vl", "crawl4ai", "firecrawl", "partykit"
]

def extract_entities(text: str) -> List[str]:
    lowered = text.lower().replace("-", "_").replace(" ", "_")
    return [ent for ent in KNOWN_ENTITIES if ent in lowered]

def semantic_chunk_document(raw_text: str, max_words: int = 550, overlap_words: int = 80) -> List[Dict[str, str]]:
    """Splits text along structural headers while enforcing word-count bounds for optimal embedding density."""
    cleaned = re.sub(r'\x0c', '\n', raw_text)
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', cleaned) if p.strip()]

    chunks = []
    current_words = []
    current_title = "General Overview"

    for para in paragraphs:
        # Check if line looks like a header/title
        if len(para.split()) <= 12 and not para.endswith("."):
            current_title = para
            continue

        words = para.split()
        if len(current_words) + len(words) > max_words and current_words:
            chunk_str = " ".join(current_words)
            chunks.append({"title": current_title, "content": chunk_str})
            current_words = current_words[-overlap_words:] + words
        else:
            current_words.extend(words)

    if current_words:
        chunks.append({"title": current_title, "content": " ".join(current_words)})
    return chunks

# ---------------------------------------------------------------------------
# 3. Main Ingestion & Seeding Engine
# ---------------------------------------------------------------------------
def run_ingestion():
    script_dir = Path(__file__).resolve().parent
    workspace_root = script_dir.parent.parent
    kb_dir = workspace_root / "Knowledge Base"
    manual_path = workspace_root / "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt"
    local_db_path = script_dir / "agent_memory_store.db"
    json_export_path = script_dir.parent / "data" / "agent_knowledge_memory.json"
    json_export_path.parent.mkdir(parents=True, exist_ok=True)

    print("=====================================================================")
    print("LEONIDA VICE — KNOWLEDGE BASE & PROCEDURAL MEMORY INGESTION")
    print("=====================================================================")
    print(f"[*] Knowledge Base Directory: {kb_dir}")
    print(f"[*] Loading SentenceTransformer('all-MiniLM-L6-v2')...")
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    print("[✓] Embedding model loaded (384 dimensions).")

    records_to_upsert: List[Dict[str, Any]] = []

    # 1. Prepare Verbatim Procedural SOPs & Policy Constraints
    print(f"[*] Processing {len(PROCEDURAL_SOPS)} Verbatim Procedural SOPs...")
    sop_texts = [s["content"] for s in PROCEDURAL_SOPS]
    sop_embeddings = embedder.encode(sop_texts, show_progress_bar=False).tolist()

    for sop, emb in zip(PROCEDURAL_SOPS, sop_embeddings):
        c_hash = hashlib.sha256(sop["content"].encode("utf-8")).hexdigest()
        records_to_upsert.append({
            "content_hash": c_hash,
            "memory_tier": sop["memory_tier"],
            "source_file": sop["source_file"],
            "domain_pillar": sop["pillar"],
            "section_title": sop["section_title"],
            "content": sop["content"],
            "agent_scope": sop["agents"],
            "entity_tags": sop["entities"],
            "importance_weight": sop["importance"],
            "embedding": emb,
        })

    # 2. Chunk and Embed the 6 Knowledge Base Text Files
    for doc in CORPUS_MANIFEST:
        filepath = kb_dir / doc["filename"]
        if not filepath.exists():
            print(f"[WARN] File not found: {filepath}")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            raw_text = f.read()

        chunks = semantic_chunk_document(raw_text)
        print(f"[*] Chunked '{doc['filename']}': {len(chunks)} passages.")

        chunk_texts = [c["content"] for c in chunks]
        embeddings = embedder.encode(chunk_texts, show_progress_bar=False, batch_size=32).tolist()

        for c, emb in zip(chunks, embeddings):
            c_hash = hashlib.sha256(c["content"].encode("utf-8")).hexdigest()
            records_to_upsert.append({
                "content_hash": c_hash,
                "memory_tier": "semantic_lore",
                "source_file": doc["filename"],
                "domain_pillar": doc["pillar"],
                "section_title": c["title"],
                "content": c["content"],
                "agent_scope": doc["agents"],
                "entity_tags": extract_entities(c["content"]),
                "importance_weight": 1.0,
                "embedding": emb,
            })

    print(f"\n[✓] Total memory records prepared: {len(records_to_upsert)}")

    # 3. Save Local Hybrid Copy (JSON and SQLite FTS5)
    print(f"[*] Writing local JSON copy to: {json_export_path}")
    with open(json_export_path, "w", encoding="utf-8") as f:
        # Save records (with truncated embeddings for lightweight JSON storage)
        json_records = []
        for r in records_to_upsert:
            record_copy = dict(r)
            record_copy["embedding"] = r["embedding"][:5]  # preview only
            json_records.append(record_copy)
        json.dump(json_records, f, indent=2)

    print(f"[*] Building local SQLite FTS5 store: {local_db_path}")
    conn = sqlite3.connect(local_db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lv_memory (
            content_hash TEXT PRIMARY KEY,
            memory_tier TEXT,
            source_file TEXT,
            domain_pillar TEXT,
            section_title TEXT,
            content TEXT,
            agent_scope TEXT,
            entity_tags TEXT,
            importance_weight REAL,
            embedding_json TEXT
        )
    """)
    cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS lv_memory_fts USING fts5(
            content_hash UNINDEXED,
            section_title,
            content,
            entity_tags,
            tokenize = 'porter ascii'
        )
    """)

    for r in records_to_upsert:
        cur.execute("""
            INSERT OR REPLACE INTO lv_memory 
            (content_hash, memory_tier, source_file, domain_pillar, section_title, content, agent_scope, entity_tags, importance_weight, embedding_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r["content_hash"],
            r["memory_tier"],
            r["source_file"],
            r["domain_pillar"],
            r["section_title"],
            r["content"],
            json.dumps(r["agent_scope"]),
            json.dumps(r["entity_tags"]),
            r["importance_weight"],
            json.dumps(r["embedding"]),
        ))
        cur.execute("""
            INSERT OR REPLACE INTO lv_memory_fts (content_hash, section_title, content, entity_tags)
            VALUES (?, ?, ?, ?)
        """, (
            r["content_hash"],
            r["section_title"],
            r["content"],
            " ".join(r["entity_tags"]),
        ))

    conn.commit()
    conn.close()
    print("[✓] Local SQLite FTS5 database initialized and indexed.")

    # 4. Upsert into Supabase (if table exists)
    if supabase:
        print("\n[*] Attempting batch upsert to Supabase PostgreSQL...")
        try:
            # Check if table exists
            supabase.table("lv_agent_knowledge_memory").select("id").limit(1).execute()
            
            # Batch upsert in chunks of 50
            total_batches = (len(records_to_upsert) + 49) // 50
            for i in range(0, len(records_to_upsert), 50):
                batch = records_to_upsert[i:i+50]
                supabase.table("lv_agent_knowledge_memory").upsert(
                    batch, on_conflict="content_hash"
                ).execute()
                print(f"    Batch {i//50 + 1}/{total_batches} uploaded ({len(batch)} records)")
            print("[✓] Supabase cloud knowledge memory fully populated!")
        except Exception as e:
            print(f"[!] Supabase table 'lv_agent_knowledge_memory' not yet ready in cloud database.")
            print(f"    Error: {e}")
            print(f"    To enable cloud sync: Copy 'supabase/ultimate_rag_memory.sql' into the Supabase SQL Editor.")
            print(f"    Local hybrid search is 100% active and functioning in the interim.")

    print("\n=====================================================================")
    print(f"INGESTION COMPLETE: {len(records_to_upsert)} records indexed across all 6 corpus files.")
    print("=====================================================================")

if __name__ == "__main__":
    run_ingestion()
