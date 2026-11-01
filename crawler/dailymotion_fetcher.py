"""
dailymotion_fetcher.py — Phase 0 crawler for Dailymotion
==========================================================
Strategy:
  Uses Dailymotion Data API v1 (public, no auth required for search).
  Endpoint: https://api.dailymotion.com/videos
  Parameters: search, fields, sort, limit, page, private_id, password_protected

  For manifest extraction, Dailymotion provides streaming_url directly
  via the API (requires embed player API call for HLS manifest).
  We use yt-dlp as the extraction backend for reliability.

Env vars required:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Run:
  python crawler/dailymotion_fetcher.py
"""

import os
import re
import time
import hashlib
import logging
import requests
import yt_dlp
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SOURCE_PLATFORM = "dailymotion"
DM_API_BASE = "https://api.dailymotion.com"
DM_VIDEO_FIELDS = "id,title,description,url,thumbnail_url,duration,views_total,owner.screenname,owner.url,created_time"
SEARCH_QUERIES = [
    "GTA 6",
    "GTA VI",
    "Grand Theft Auto 6",
    "GTA 6 gameplay",
    "GTA VI Leonida",
    "GTA 6 2025",
]
MAX_RESULTS_PER_QUERY = 20
MIN_DURATION_SEC = 20
MAX_DURATION_SEC = 7200
REQUEST_DELAY_SEC = 2.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── Keyword filter (same as rumble_fetcher) ──────────────────────────────────
GTA6_KEYWORDS = {
    "gta 6", "gta vi", "gta6", "gtavi", "grand theft auto 6",
    "grand theft auto vi", "leonida", "lucia", "jason gta",
    "gta 2025", "gta trailer",
}
REJECT_KEYWORDS = {
    "gta 5", "gta v", "gta5", "gtav", "gta san andreas",
    "gta 4", "gta iv", "gta online", "minecraft", "fortnite",
}

def passes_keyword_filter(title: str, description: str = "") -> tuple[bool, str]:
    text = (title + " " + description).lower()
    if not any(kw in text for kw in GTA6_KEYWORDS):
        return False, "no GTA6 keyword"
    for kw in REJECT_KEYWORDS:
        if kw in text:
            return False, f"reject: '{kw}'"
    return True, "ok"

# ─── Supabase helpers ─────────────────────────────────────────────────────────
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

def sb_already_exists(canonical_url: str) -> bool:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/video_catalog",
        headers=HEADERS,
        params={"canonical_url": f"eq.{canonical_url}", "select": "id", "limit": 1},
        timeout=10,
    )
    return r.status_code == 200 and len(r.json()) > 0

def sb_upsert(row: dict) -> bool:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/video_catalog",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=row,
        timeout=15,
    )
    if r.status_code not in (200, 201):
        log.error("Supabase upsert failed: %s %s", r.status_code, r.text[:200])
        return False
    return True

def stable_id(canonical_url: str) -> str:
    h = hashlib.sha256(canonical_url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# ─── Dailymotion search via yt-dlp (public API deprecated unauthenticated access) ──
def search_dailymotion(query: str, max_results: int = 20) -> list[dict]:
    """
    Use yt-dlp's native DailymotionSearch extractor.
    Format: 'dailymotion:search:<query>'
    Returns list of dicts with url, title, etc.
    """
    search_url = f"dailymotionsearch:{query}"
    opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": max_results,
        "socket_timeout": 20,
    }
    results = []
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_url, download=False)
            if not info:
                return []
            entries = info.get("entries") or []
            for entry in entries[:max_results]:
                url = entry.get("url") or entry.get("webpage_url") or ""
                if not url:
                    continue
                results.append({
                    "id": entry.get("id") or "",
                    "title": entry.get("title") or "",
                    "description": entry.get("description") or "",
                    "url": url,
                    "thumbnail_url": entry.get("thumbnail") or "",
                    "duration": entry.get("duration"),
                    "views_total": entry.get("view_count"),
                    "owner.screenname": entry.get("uploader") or entry.get("channel") or "",
                    "owner.url": entry.get("uploader_url") or entry.get("channel_url") or "",
                })
    except Exception as e:
        log.warning("DM yt-dlp search failed for %r: %s", query, e)
    return results

# ─── yt-dlp manifest extraction ──────────────────────────────────────────────
YDL_OPTS = {
    "skip_download": True,
    "quiet": True,
    "no_warnings": True,
    "socket_timeout": 20,
}

def extract_manifest(video_url: str) -> dict | None:
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(video_url, download=False)
        if not info:
            return None

        formats = info.get("formats", [])
        manifest_url = None
        direct_mp4_url = None

        hls_formats = [f for f in formats if f.get("protocol") in ("m3u8", "m3u8_native")]
        if hls_formats:
            hls_formats.sort(key=lambda f: f.get("height", 0) or 0, reverse=True)
            manifest_url = hls_formats[0].get("url")

        if not manifest_url:
            mp4_formats = [f for f in formats if f.get("ext") == "mp4" and f.get("url")]
            if mp4_formats:
                mp4_formats.sort(key=lambda f: f.get("height", 0) or 0, reverse=True)
                direct_mp4_url = mp4_formats[0].get("url")

        if not manifest_url and not direct_mp4_url:
            return None

        return {
            "manifest_url": manifest_url,
            "direct_mp4_url": direct_mp4_url,
            "title": info.get("title", ""),
            "uploader": info.get("uploader", ""),
            "uploader_url": info.get("uploader_url", ""),
            "thumbnail": info.get("thumbnail", ""),
            "duration_sec": info.get("duration"),
            "view_count": info.get("view_count"),
        }
    except Exception as e:
        log.debug("yt-dlp failed for %s: %s", video_url, e)
        return None

# ─── Main ─────────────────────────────────────────────────────────────────────
def run():
    log.info("=== Dailymotion fetcher starting ===")
    stats = {"searched": 0, "skipped_filter": 0, "skipped_exists": 0, "skipped_ydl": 0, "added": 0}
    seen_ids: set[str] = set()

    for query in SEARCH_QUERIES:
        log.info("Searching DM: %r", query)
        videos = search_dailymotion(query, MAX_RESULTS_PER_QUERY)
        log.info("  Got %d results", len(videos))
        stats["searched"] += len(videos)
        time.sleep(REQUEST_DELAY_SEC)

        for v in videos:
            dm_id = v.get("id", "")
            if dm_id in seen_ids:
                continue
            seen_ids.add(dm_id)

            title = v.get("title", "")
            description = v.get("description", "")
            canonical_url = v.get("url", f"https://www.dailymotion.com/video/{dm_id}")

            ok, reason = passes_keyword_filter(title, description)
            if not ok:
                log.debug("  SKIP (filter: %s): %s", reason, title[:60])
                stats["skipped_filter"] += 1
                continue

            dur = v.get("duration")
            if dur and (dur < MIN_DURATION_SEC or dur > MAX_DURATION_SEC):
                log.debug("  SKIP (duration %ds)", dur)
                stats["skipped_filter"] += 1
                continue

            if sb_already_exists(canonical_url):
                log.debug("  SKIP (exists): %s", canonical_url)
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", canonical_url)
            info = extract_manifest(canonical_url)
            time.sleep(REQUEST_DELAY_SEC)

            if not info:
                log.warning("  SKIP (yt-dlp failed): %s", canonical_url)
                stats["skipped_ydl"] += 1
                continue

            created_time = v.get("created_time")
            uploaded_at = (
                datetime.fromtimestamp(created_time, tz=timezone.utc).isoformat()
                if created_time else None
            )

            owner = v.get("owner.screenname") or v.get("owner", {}).get("screenname", "Unknown")
            owner_url = v.get("owner.url") or v.get("owner", {}).get("url", "")

            row = {
                "id": stable_id(canonical_url),
                "canonical_url": canonical_url,
                "source_platform": SOURCE_PLATFORM,
                "source_category": "gameplay",
                "title": info.get("title") or title or "GTA VI Clip",
                "creator_name": info.get("uploader") or owner,
                "creator_url": info.get("uploader_url") or owner_url or "",
                "thumbnail_url": info.get("thumbnail") or v.get("thumbnail_url"),
                "manifest_url": info.get("manifest_url"),
                "direct_mp4_url": info.get("direct_mp4_url"),
                "duration_sec": info.get("duration_sec") or dur,
                "view_count": info.get("view_count") or v.get("views_total"),
                "uploaded_at": uploaded_at,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "manifest_refreshed_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True,
                "is_approved": True,
                "play_count": 0,
            }

            if sb_upsert(row):
                log.info("  ✓ Added: %s", (info.get("title") or title)[:60])
                stats["added"] += 1

            time.sleep(REQUEST_DELAY_SEC)

    log.info("=== Done. Stats: %s ===", stats)

if __name__ == "__main__":
    run()
