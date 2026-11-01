#!/usr/bin/env python3
"""
LeonidaVice — Kick.com GTA VI Clip Crawler
Phase 0: Kick is the cleanest starting source.
  - Kick REST API v2 provides direct HLS manifest URLs for clips
  - yt-dlp resolves the final playable .m3u8 stream
  - Results are upserted into Supabase video_catalog

Usage:
  pip install requests yt-dlp supabase python-dotenv
  python crawler/kick_fetcher.py

Environment variables (set in .env or system):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   ← service role, NOT anon key
  KICK_CLIENT_ID              ← from kick.com/developers
  KICK_CLIENT_SECRET
  RESIDENTIAL_PROXY_URL       ← optional, e.g. http://user:pass@host:port
"""

import os
import json
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
import yt_dlp
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("kick_fetcher")

# ─── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL       = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY       = os.environ["SUPABASE_SERVICE_ROLE_KEY"]   # service role
KICK_CLIENT_ID     = os.environ.get("KICK_CLIENT_ID", "")
KICK_CLIENT_SECRET = os.environ.get("KICK_CLIENT_SECRET", "")
PROXY_URL          = os.environ.get("RESIDENTIAL_PROXY_URL", "")

KICK_API_BASE   = "https://kick.com/api/v2"
GTA6_CATEGORY   = "grand-theft-auto-vi"   # Kick category slug
MAX_CLIPS       = 50                        # clips to fetch per run
MIN_DURATION    = 15                        # seconds
MAX_DURATION    = 600                       # seconds (10 min)
MANIFEST_TTL    = 7200                      # CDN URLs expire ~2h

# Keywords — title must contain at least one
REQUIRED_KEYWORDS = [
    "gta 6", "gta vi", "grand theft auto 6", "grand theft auto vi",
    "gta6", "gtavi", "leonida", "vice city",
]

# ─── Supabase ─────────────────────────────────────────────────────────────────
def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── Kick OAuth token ─────────────────────────────────────────────────────────
def get_kick_token() -> Optional[str]:
    if not KICK_CLIENT_ID or not KICK_CLIENT_SECRET:
        log.warning("No Kick credentials — using unauthenticated API (rate limited)")
        return None
    try:
        resp = requests.post(
            "https://kick.com/oauth/token",
            json={
                "grant_type": "client_credentials",
                "client_id": KICK_CLIENT_ID,
                "client_secret": KICK_CLIENT_SECRET,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("access_token")
    except Exception as e:
        log.error(f"Kick token error: {e}")
        return None


# ─── Relevance filter ─────────────────────────────────────────────────────────
def is_relevant(title: str) -> bool:
    lower = title.lower()
    return any(kw in lower for kw in REQUIRED_KEYWORDS)


def is_valid_duration(duration_sec: Optional[int]) -> bool:
    if duration_sec is None:
        return True  # unknown — let it through
    return MIN_DURATION <= duration_sec <= MAX_DURATION


# ─── yt-dlp manifest extraction ───────────────────────────────────────────────
def extract_manifest(clip_url: str) -> Optional[dict]:
    """
    Use yt-dlp with skip_download=True to extract the HLS manifest URL.
    Never downloads video data — only resolves the stream endpoint.
    """
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "format": "best[height<=1080][ext=mp4]/best[height<=1080]/best",
    }
    if PROXY_URL:
        opts["proxy"] = PROXY_URL

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(clip_url, download=False)
            if not info:
                return None

            # Pick best format
            formats = info.get("formats", [])
            # Prefer HLS
            hls = [f for f in formats if f.get("protocol") in ("m3u8", "m3u8_native")
                   and f.get("height") and f.get("height") <= 1080]
            mp4 = [f for f in formats if f.get("ext") == "mp4" and f.get("url")]

            best = None
            if hls:
                best = max(hls, key=lambda f: f.get("height", 0))
            elif mp4:
                best = max(mp4, key=lambda f: f.get("height", 0))
            elif formats:
                best = formats[-1]

            if not best or not best.get("url"):
                return None

            return {
                "manifest_url": best["url"] if best.get("protocol") in ("m3u8", "m3u8_native") else None,
                "direct_mp4_url": best["url"] if best.get("ext") == "mp4" else None,
                "title": info.get("title", ""),
                "uploader": info.get("uploader", "Unknown"),
                "uploader_url": info.get("uploader_url", ""),
                "thumbnail": info.get("thumbnail", ""),
                "duration": info.get("duration"),
                "view_count": info.get("view_count"),
            }
    except Exception as e:
        log.warning(f"yt-dlp failed for {clip_url}: {e}")
        return None


# ─── Fetch Kick clips for GTA VI category ────────────────────────────────────
def fetch_kick_clips(token: Optional[str]) -> list[dict]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    proxies = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else {}

    clips = []
    try:
        # Search for recent clips in the GTA VI category
        url = f"{KICK_API_BASE}/categories/{GTA6_CATEGORY}/clips"
        params = {"sort": "recent", "time": "week", "page": 1, "limit": MAX_CLIPS}
        resp = requests.get(url, headers=headers, params=params, proxies=proxies, timeout=15)

        if resp.status_code == 404:
            # Category not yet on Kick — fall back to search
            log.info("GTA VI category not found on Kick, trying channel search...")
            return []

        resp.raise_for_status()
        data = resp.json()
        clips = data.get("data", data.get("clips", []))
        log.info(f"Kick: fetched {len(clips)} raw clips")
    except Exception as e:
        log.error(f"Kick API error: {e}")

    return clips


# ─── Parse a Kick clip into our schema ───────────────────────────────────────
def parse_kick_clip(clip: dict) -> Optional[dict]:
    title = clip.get("title", "")
    duration = clip.get("duration") or clip.get("clip_length")

    if not is_relevant(title):
        return None
    if not is_valid_duration(duration):
        return None

    # Kick clip page URL
    clip_id = clip.get("id") or clip.get("clip_id", "")
    canonical_url = clip.get("clip_url") or f"https://kick.com/clips/{clip_id}"

    # Creator info
    creator = clip.get("channel") or clip.get("creator") or {}
    creator_name = creator.get("username") or clip.get("broadcaster_name", "Unknown")
    creator_url = f"https://kick.com/{creator_name}"
    creator_avatar = creator.get("profile_picture") or creator.get("avatar")

    # Thumbnail
    thumbnail = clip.get("thumbnail_url") or clip.get("thumbnail")

    return {
        "canonical_url": canonical_url,
        "title": title,
        "creator_name": creator_name,
        "creator_url": creator_url,
        "creator_avatar": creator_avatar,
        "thumbnail_url": thumbnail,
        "duration_sec": int(duration) if duration else None,
        "view_count": clip.get("views") or clip.get("view_count"),
    }


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    log.info("=== Kick Fetcher starting ===")
    sb = get_supabase()
    token = get_kick_token()

    raw_clips = fetch_kick_clips(token)
    if not raw_clips:
        log.warning("No clips returned from Kick. Check category slug or API access.")

    added = 0
    rejected = 0
    errors = 0

    for raw in raw_clips:
        parsed = parse_kick_clip(raw)
        if not parsed:
            rejected += 1
            continue

        log.info(f"Processing: {parsed['title'][:60]}")

        # Extract manifest via yt-dlp
        manifest_data = extract_manifest(parsed["canonical_url"])
        if not manifest_data:
            log.warning(f"  ↳ Could not extract manifest — skipping")
            errors += 1
            continue

        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=MANIFEST_TTL)
        ).isoformat()

        record = {
            "source_platform": "kick",
            "canonical_url": parsed["canonical_url"],
            "manifest_url": manifest_data.get("manifest_url"),
            "direct_mp4_url": manifest_data.get("direct_mp4_url"),
            "title": parsed["title"],
            "creator_name": parsed["creator_name"],
            "creator_url": parsed["creator_url"],
            "creator_avatar": parsed.get("creator_avatar"),
            "thumbnail_url": parsed.get("thumbnail_url") or manifest_data.get("thumbnail"),
            "duration_sec": parsed.get("duration_sec") or manifest_data.get("duration"),
            "view_count": parsed.get("view_count") or manifest_data.get("view_count"),
            "source_category": "gameplay",
            "is_approved": True,
            "is_active": True,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "manifest_expires": expires_at,
            "play_count": 0,
        }

        try:
            result = sb.table("video_catalog").upsert(
                record,
                on_conflict="source_platform,canonical_url"
            ).execute()
            added += 1
            log.info(f"  ↳ ✓ Saved: {parsed['title'][:50]}")
        except Exception as e:
            log.error(f"  ↳ DB error: {e}")
            errors += 1

        # Be polite — don't hammer the API
        time.sleep(0.5)

    # Log run
    try:
        sb.table("aggregator_runs").insert({
            "sources_crawled": 1,
            "videos_found": len(raw_clips),
            "videos_added": added,
            "videos_rejected": rejected,
            "error_log": f"{errors} extraction errors" if errors else None,
        }).execute()
    except Exception as e:
        log.warning(f"Could not log run: {e}")

    log.info(f"=== Done: {added} added, {rejected} filtered, {errors} errors ===")


# Alias for run_all.py orchestrator
run = main

if __name__ == "__main__":
    main()
