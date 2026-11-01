"""
Mod site fetcher — scrapes ModDB video sections for GTA VI related content.
ModDB has an actual video section with direct embeds or YouTube links.
All resolved via yt-dlp skip_download=True.
"""

import re
import time
import logging
import requests

from .common import (
    get_logger,
    passes_filter,
    duration_ok,
    sb_exists,
    sb_upsert,
    make_row,
    extract,
    UA,
)

log = get_logger(__name__)

# ModDB search pages for GTA content (GTA 6 doesn't have its own moddb page yet,
# so we search the video section and filter by keyword)
MODDB_SEARCH_URLS = [
    "https://www.moddb.com/search/videos?q=GTA+6",
    "https://www.moddb.com/search/videos?q=GTA+VI",
    "https://www.moddb.com/search/videos?q=Grand+Theft+Auto+6",
    # GTA V mod videos that reference GTA 6 / speculative content
    "https://www.moddb.com/games/grand-theft-auto-v/videos",
]

REQUEST_DELAY = 1.0
MAX_PER_PAGE = 10


def _scrape_moddb_video_links(page_url: str) -> list[tuple[str, str]]:
    """
    Scrape ModDB listing page for (video_url, title) pairs.
    Returns list of (canonical_url, title) tuples.
    """
    headers = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"}
    try:
        resp = requests.get(page_url, headers=headers, timeout=25)
        resp.raise_for_status()
        html = resp.text

        results: list[tuple[str, str]] = []

        # Pattern 1: video cards with title in heading
        blocks = re.findall(
            r'href="(/(?:[^"]+/)?videos/view/[^"?]+)"[^>]*>\s*<[^>]+>\s*([^<]{3,80})',
            html,
        )
        for path, title in blocks:
            full_url = f"https://www.moddb.com{path.split('?')[0]}"
            results.append((full_url, title.strip()))

        # Pattern 2: just paths (title unknown)
        if not results:
            paths = re.findall(r'href="(/(?:[^"]+/)?videos/view/[^"?]+)"', html)
            for path in dict.fromkeys(paths):  # dedupe
                full_url = f"https://www.moddb.com{path.split('?')[0]}"
                results.append((full_url, "GTA Mod Video"))

        # Dedupe by URL
        seen: set[str] = set()
        unique: list[tuple[str, str]] = []
        for url, title in results:
            if url not in seen:
                seen.add(url)
                unique.append((url, title))

        return unique[:MAX_PER_PAGE]

    except Exception as exc:
        log.warning("ModDB scrape failed for %s: %s", page_url, exc)
        return []


def run():
    log.info("=== ModDB/mod-sites fetcher starting ===")
    stats = {"found": 0, "skipped_filter": 0, "skipped_exists": 0, "skipped_ydl": 0, "added": 0}
    seen_urls: set[str] = set()

    for search_url in MODDB_SEARCH_URLS:
        log.info("Scraping ModDB: %s", search_url)
        links = _scrape_moddb_video_links(search_url)
        log.info("  Found %d video links", len(links))

        for canonical_url, title_hint in links:
            if canonical_url in seen_urls:
                continue
            seen_urls.add(canonical_url)
            stats["found"] += 1

            # Pre-filter using URL-derived title hint if we have one
            if title_hint and title_hint != "GTA Mod Video":
                ok, reason = passes_filter(title_hint)
                if not ok:
                    log.debug("  SKIP (pre-filter: %s): %s", reason, title_hint[:60])
                    stats["skipped_filter"] += 1
                    continue

            if sb_exists(canonical_url):
                log.debug("  SKIP (exists): %s", canonical_url)
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", canonical_url)
            info = extract(canonical_url)
            time.sleep(REQUEST_DELAY)

            if not info:
                log.debug("  SKIP (yt-dlp failed): %s", canonical_url)
                stats["skipped_ydl"] += 1
                continue

            title = info.get("title") or title_hint or "GTA Mod Video"
            ok, reason = passes_filter(title)
            if not ok:
                log.debug("  SKIP (filter: %s): %s", reason, title[:60])
                stats["skipped_filter"] += 1
                continue

            if not duration_ok(info.get("duration_sec")):
                log.debug("  SKIP (duration): %s", canonical_url)
                stats["skipped_filter"] += 1
                continue

            row = make_row(
                canonical_url=canonical_url,
                platform="moddb",
                title=title,
                creator_name=info.get("uploader") or "ModDB",
                creator_url=info.get("uploader_url") or "https://www.moddb.com",
                thumbnail_url=info.get("thumbnail"),
                manifest_url=info.get("manifest_url"),
                direct_mp4_url=info.get("direct_mp4_url"),
                duration_sec=info.get("duration_sec"),
                view_count=info.get("view_count"),
                uploaded_at=info.get("uploaded_at"),
                category="mods",
            )

            if sb_upsert(row):
                log.info("  ✓ Added: %s", title[:60])
                stats["added"] += 1
            else:
                log.warning("  ✗ Upsert failed: %s", canonical_url)

        time.sleep(2.0)

    log.info(
        "ModDB done — found=%d added=%d skipped_filter=%d skipped_exists=%d skipped_ydl=%d",
        stats["found"], stats["added"], stats["skipped_filter"],
        stats["skipped_exists"], stats["skipped_ydl"],
    )
