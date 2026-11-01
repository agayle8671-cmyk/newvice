"""
imgur_fetcher.py — Imgur video crawler
========================================
Strategy:
  Imgur has a public API (Client-ID auth — free, no approval needed).
  We search the gallery for GTA VI video posts (.mp4 / gifv).
  Imgur gifv/mp4 posts have direct CDN URLs — no yt-dlp needed.
  Falls back to yt-dlp for edge cases.

  Get a free Client-ID at: https://api.imgur.com/oauth2/addclient
  Set env var: IMGUR_CLIENT_ID=your-client-id

  If IMGUR_CLIENT_ID is not set, we fall back to scraping
  imgur.com/search which works without auth (HTML page).
"""

import os
import re
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("imgur")
PLATFORM = "imgur"
IMGUR_API = "https://api.imgur.com/3"
IMGUR_CDN = "https://i.imgur.com"
SEARCH_QUERIES = ["GTA 6", "GTA VI", "GTA6", "Grand Theft Auto 6"]
CLIENT_ID = os.environ.get("IMGUR_CLIENT_ID", "")


def _api_search(query: str, page: int = 0) -> list[dict]:
    """Search Imgur gallery via API (requires Client-ID)."""
    headers = {
        "User-Agent":    UA,
        "Authorization": f"Client-ID {CLIENT_ID}",
    }
    r = get(
        f"{IMGUR_API}/gallery/search/time/all/{page}",
        headers=headers,
        params={"q": query},
    )
    if not r:
        return []
    return r.json().get("data", [])


def _html_search(query: str) -> list[str]:
    """
    Fallback: scrape imgur.com/search for video posts.
    Returns list of album/post URLs.
    """
    r = get(
        "https://imgur.com/search",
        params={"q": query, "q_type": "gifv"},
        headers={"User-Agent": UA},
    )
    if not r:
        return []
    # Extract post hashes from HTML
    hashes = re.findall(r'imgur\.com/gallery/([a-zA-Z0-9]+)', r.text)
    hashes += re.findall(r'imgur\.com/([a-zA-Z0-9]{5,8})(?:\.gifv|\.mp4)', r.text)
    hashes = list(dict.fromkeys(hashes))
    return [f"https://imgur.com/gallery/{h}" for h in hashes[:20]]


def _process_item(item: dict, stats: dict):
    """Process a single Imgur gallery item (may contain multiple images/videos)."""
    # Albums contain multiple items
    images = item.get("images") or ([item] if item.get("link") else [])

    for img in images:
        link = img.get("link", "")
        if not (link.endswith(".mp4") or link.endswith(".gifv") or img.get("animated")):
            continue  # not a video

        # Build canonical URL
        hash_id = img.get("id") or item.get("id", "")
        if not hash_id:
            continue

        canonical = f"https://imgur.com/{hash_id}"
        if sb_exists(canonical):
            stats["skipped_exists"] += 1
            continue

        title = item.get("title") or img.get("title") or ""
        desc  = item.get("description") or img.get("description") or ""
        ok, reason = passes_filter(title or desc)
        if not ok:
            stats["skipped_filter"] += 1
            continue

        dur = img.get("duration")  # seconds as float
        if dur and not duration_ok(int(dur)):
            stats["skipped_filter"] += 1
            continue

        # Direct MP4 — no yt-dlp needed
        mp4 = link if link.endswith(".mp4") else link.replace(".gifv", ".mp4")

        row = make_row(
            canonical_url=canonical,
            platform=PLATFORM,
            title=title or "GTA VI Clip — Imgur",
            creator_name=item.get("account_url") or "Imgur",
            creator_url=f"https://imgur.com/user/{item.get('account_url','')}" if item.get("account_url") else "",
            thumbnail_url=img.get("mp4") or img.get("link"),
            direct_mp4_url=mp4,
            duration_sec=int(dur) if dur else None,
            view_count=img.get("views") or item.get("views"),
        )
        if sb_upsert(row):
            log.info("  ✓ imgur/%s — %s", hash_id, (title or "clip")[:60])
            stats["added"] += 1


def run():
    log.info("=== Imgur fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)

    if CLIENT_ID:
        log.info("Using Imgur API (Client-ID: %s...)", CLIENT_ID[:6])
        for q in SEARCH_QUERIES:
            for page in range(3):  # 3 pages per query
                items = _api_search(q, page)
                if not items:
                    break
                log.info("Query %r page %d → %d items", q, page, len(items))
                stats["searched"] += len(items)
                for item in items:
                    _process_item(item, stats)
                time.sleep(2)
    else:
        log.info("No IMGUR_CLIENT_ID set — using HTML scrape fallback")
        seen: set[str] = set()
        for q in SEARCH_QUERIES:
            urls = _html_search(q)
            log.info("Query %r → %d URLs (HTML)", q, len(urls))
            stats["searched"] += len(urls)
            time.sleep(2)
            for url in urls:
                if url in seen:
                    continue
                seen.add(url)
                if sb_exists(url):
                    stats["skipped_exists"] += 1
                    continue
                info = extract(url)
                time.sleep(2)
                if not info:
                    stats["skipped_ydl"] += 1
                    continue
                title = info["title"] or ""
                ok, reason = passes_filter(title)
                if not ok:
                    stats["skipped_filter"] += 1
                    continue
                row = make_row(
                    canonical_url=url, platform=PLATFORM,
                    title=title or "GTA VI Clip — Imgur",
                    creator_name=info["uploader"] or "Imgur",
                    creator_url=info["uploader_url"] or "",
                    thumbnail_url=info["thumbnail"],
                    manifest_url=info["manifest_url"],
                    direct_mp4_url=info["direct_mp4_url"],
                    duration_sec=info["duration_sec"],
                    view_count=info["view_count"],
                    uploaded_at=info["uploaded_at"],
                )
                if sb_upsert(row):
                    log.info("  ✓ %s", title[:70])
                    stats["added"] += 1
                time.sleep(2)

    log.info("Done: %s", stats)
