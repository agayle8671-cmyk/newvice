"""
rumble_fetcher.py — Phase 0 crawler for Rumble.com
====================================================
Strategy:
  1. Search Rumble for "GTA 6" / "GTA VI" via their internal search API
  2. For each result, extract the video page URL
  3. Use yt-dlp (skip_download=True) to resolve the HLS manifest URL
  4. Run a simple title/thumbnail content filter (keyword + optional VLM)
  5. Upsert into Supabase video_catalog

Env vars required:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  CRAWLER_WEBHOOK_SECRET  (used by refresh cron)
  GEMINI_API_KEY          (for VLM content filter — Phase 2)

Run:
  pip install requests yt-dlp supabase python-dotenv
  python crawler/rumble_fetcher.py
"""

import os
import re
import json
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
SOURCE_PLATFORM = "rumble"
SEARCH_QUERIES = [
    "GTA 6 gameplay",
    "GTA VI gameplay",
    "Grand Theft Auto 6 gameplay",
    "GTA 6 clip",
    "GTA VI Leonida",
]
MAX_RESULTS_PER_QUERY = 15
MIN_DURATION_SEC = 20    # skip shorts under 20s
MAX_DURATION_SEC = 7200  # skip anything over 2h (likely full streams, scrub later)
REQUEST_DELAY_SEC = 2.5  # polite crawl rate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── Supabase client (minimal REST) ──────────────────────────────────────────
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

def sb_upsert(row: dict) -> bool:
    """Upsert a row into video_catalog. Returns True on success."""
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

def sb_already_exists(canonical_url: str) -> bool:
    """Check if a canonical_url already exists in video_catalog."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/video_catalog",
        headers=HEADERS,
        params={"canonical_url": f"eq.{canonical_url}", "select": "id", "limit": 1},
        timeout=10,
    )
    return r.status_code == 200 and len(r.json()) > 0

# ─── Keyword content filter ───────────────────────────────────────────────────
GTA6_KEYWORDS = {
    "gta 6", "gta vi", "gta6", "gtavi", "grand theft auto 6",
    "grand theft auto vi", "leonida", "vice city 2", "lucia",
    "jason", "gta 2025", "gta trailer",
}
REJECT_KEYWORDS = {
    "gta 5", "gta v", "gta5", "gtav", "gta san andreas", "gta sa",
    "gta 4", "gta iv", "gta 3", "gta iii", "gta online",
    "minecraft", "fortnite", "roblox", "warzone",
}

def passes_keyword_filter(title: str, description: str = "") -> tuple[bool, str]:
    """Returns (passes, reason)."""
    text = (title + " " + description).lower()
    
    # Must contain at least one GTA 6 keyword
    has_gta6 = any(kw in text for kw in GTA6_KEYWORDS)
    if not has_gta6:
        return False, "no GTA6 keyword found"
    
    # Reject obvious non-GTA6 content
    for kw in REJECT_KEYWORDS:
        if kw in text:
            return False, f"reject keyword: '{kw}'"
    
    return True, "ok"

# ─── Rumble search ────────────────────────────────────────────────────────────
# ─── Rumble search via yt-dlp (handles auth/403 natively) ────────────────────
def search_rumble(query: str, max_results: int = 15) -> list[dict]:
    """
    Use yt-dlp's built-in RumbleSearch extractor to find videos.
    This bypasses the 403 issues with direct HTTP scraping.
    Returns list of dicts: {url, title, creator, thumbnail, duration_sec}
    """
    search_url = f"rumble:{query}"
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
                if not url.startswith("http"):
                    url = f"https://rumble.com{url}"
                results.append({
                    "url": url,
                    "title": entry.get("title") or "",
                    "creator": entry.get("uploader") or entry.get("channel") or "",
                    "thumbnail": entry.get("thumbnail") or "",
                    "duration_sec": entry.get("duration"),
                    "description": entry.get("description") or "",
                })
    except Exception as e:
        log.warning("Rumble yt-dlp search failed for %r: %s", query, e)
    return results


def parse_iso_duration(iso: str) -> int | None:
    """Parse ISO 8601 duration like PT1H23M45S → seconds."""
    if not iso:
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return None
    h, mn, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + s

# ─── yt-dlp manifest extraction ──────────────────────────────────────────────
YDL_OPTS = {
    "skip_download": True,
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
    "socket_timeout": 20,
    "http_headers": {"User-Agent": USER_AGENT},
}

def extract_manifest(video_url: str) -> dict | None:
    """
    Use yt-dlp to extract stream info from a Rumble video page.
    Returns dict with manifest_url, direct_mp4_url, title, uploader, thumbnail,
    duration, view_count. Returns None on failure.
    """
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(video_url, download=False)
        if not info:
            return None

        # Find best HLS format
        manifest_url = None
        direct_mp4_url = None
        formats = info.get("formats", [])
        
        # Prefer HLS manifest
        hls_formats = [f for f in formats if f.get("protocol") in ("m3u8", "m3u8_native")]
        if hls_formats:
            # Pick highest quality
            hls_formats.sort(key=lambda f: f.get("height", 0) or 0, reverse=True)
            manifest_url = hls_formats[0].get("url")
        
        # Fallback: direct MP4
        if not manifest_url:
            mp4_formats = [
                f for f in formats
                if f.get("ext") == "mp4" and f.get("url")
            ]
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
            "upload_date": info.get("upload_date"),  # YYYYMMDD
        }
    except Exception as e:
        log.debug("yt-dlp failed for %s: %s", video_url, e)
        return None

# ─── Stable ID generation ─────────────────────────────────────────────────────
def stable_id(canonical_url: str) -> str:
    """Generate a stable UUID-like ID from the canonical URL."""
    h = hashlib.sha256(canonical_url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# ─── Main crawl loop ──────────────────────────────────────────────────────────
def run():
    log.info("=== Rumble fetcher starting ===")
    stats = {"searched": 0, "skipped_filter": 0, "skipped_exists": 0, "skipped_ydl": 0, "added": 0}

    for query in SEARCH_QUERIES:
        log.info("Searching: %r", query)
        results = search_rumble(query, MAX_RESULTS_PER_QUERY)
        log.info("  Found %d results", len(results))
        stats["searched"] += len(results)
        time.sleep(REQUEST_DELAY_SEC)

        for video in results:
            url = video["url"]
            title = video.get("title", "")
            description = video.get("description", "")

            # Keyword filter — fast, no network
            ok, reason = passes_keyword_filter(title, description)
            if not ok:
                log.debug("  SKIP (filter: %s): %s", reason, title[:60])
                stats["skipped_filter"] += 1
                continue

            # Duration check (if we already know it)
            dur = video.get("duration_sec")
            if dur is not None:
                if dur < MIN_DURATION_SEC or dur > MAX_DURATION_SEC:
                    log.debug("  SKIP (duration %ds): %s", dur, title[:60])
                    stats["skipped_filter"] += 1
                    continue

            # Check for duplicate
            if sb_already_exists(url):
                log.debug("  SKIP (exists): %s", url)
                stats["skipped_exists"] += 1
                continue

            # Extract manifest via yt-dlp
            log.info("  Extracting: %s", url)
            info = extract_manifest(url)
            time.sleep(REQUEST_DELAY_SEC)

            if not info:
                log.warning("  SKIP (yt-dlp failed): %s", url)
                stats["skipped_ydl"] += 1
                continue

            # Final duration check with yt-dlp data
            actual_dur = info.get("duration_sec") or dur
            if actual_dur is not None:
                if actual_dur < MIN_DURATION_SEC or actual_dur > MAX_DURATION_SEC:
                    log.debug("  SKIP (actual duration %ds)", actual_dur)
                    stats["skipped_filter"] += 1
                    continue

            # Build upload_date as ISO
            upload_date = info.get("upload_date")
            uploaded_at = None
            if upload_date and len(upload_date) == 8:
                uploaded_at = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}T00:00:00Z"

            row = {
                "id": stable_id(url),
                "canonical_url": url,
                "source_platform": SOURCE_PLATFORM,
                "source_category": "gameplay",
                "title": info["title"] or title or "GTA VI Clip",
                "creator_name": info.get("uploader") or video.get("creator") or "Unknown",
                "creator_url": info.get("uploader_url") or "",
                "thumbnail_url": info.get("thumbnail") or video.get("thumbnail") or None,
                "manifest_url": info.get("manifest_url"),
                "direct_mp4_url": info.get("direct_mp4_url"),
                "duration_sec": actual_dur,
                "view_count": info.get("view_count"),
                "uploaded_at": uploaded_at,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "manifest_refreshed_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True,
                "is_approved": True,  # keyword-filtered; set False for VLM review queue
                "play_count": 0,
            }

            success = sb_upsert(row)
            if success:
                log.info("  ✓ Added: %s — %s", info["title"][:60], url)
                stats["added"] += 1
            
            time.sleep(REQUEST_DELAY_SEC)

    log.info("=== Done. Stats: %s ===", stats)

if __name__ == "__main__":
    run()
