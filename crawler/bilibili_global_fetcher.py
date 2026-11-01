"""
Bilibili.tv (international / global) fetcher.
bilibili.tv is the international version separate from bilibili.com.
Searches via the public API and resolves clips via yt-dlp.
"""

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

SEARCH_TERMS = [
    "GTA 6",
    "GTA VI",
    "Grand Theft Auto 6",
    "GTA6 gameplay",
    "GTA VI trailer",
]

# bilibili.tv international search API
SEARCH_API = "https://api.bilibili.tv/intl/gateway/web/v2/search"
MAX_PER_TERM = 8
REQUEST_DELAY = 1.0


def _search_bilibili_tv(query: str) -> list[str]:
    """Return list of video page URLs from bilibili.tv search."""
    params = {"keyword": query, "platform": "web", "pn": 1, "ps": MAX_PER_TERM}
    headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Referer": "https://www.bilibili.tv/",
    }

    try:
        resp = requests.get(SEARCH_API, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        urls: list[str] = []
        # The search response can vary — try several known structures
        sections = (
            data.get("data", {}).get("items", [])
            or data.get("data", {}).get("video_info", {}).get("items", [])
            or []
        )
        for item in sections:
            ep_id = item.get("ep_id") or item.get("id") or item.get("episode_id")
            season_id = item.get("season_id")

            if ep_id and season_id:
                urls.append(f"https://www.bilibili.tv/en/play/{season_id}/{ep_id}")
            elif ep_id:
                urls.append(f"https://www.bilibili.tv/en/video/{ep_id}")
            elif season_id:
                urls.append(f"https://www.bilibili.tv/en/play/{season_id}")

        return urls

    except Exception as exc:
        log.warning("bilibili.tv search failed for %r: %s", query, exc)
        return []


def run():
    log.info("=== bilibili.tv fetcher starting ===")
    stats = {"found": 0, "skipped_filter": 0, "skipped_exists": 0, "skipped_ydl": 0, "added": 0}
    seen_urls: set[str] = set()

    for term in SEARCH_TERMS:
        log.info("Searching bilibili.tv: %r", term)
        urls = _search_bilibili_tv(term)
        log.info("  Found %d results", len(urls))

        for url in urls:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            stats["found"] += 1

            if sb_exists(url):
                log.debug("  SKIP (exists): %s", url)
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", url)
            info = extract(url)
            time.sleep(REQUEST_DELAY)

            if not info:
                log.debug("  SKIP (yt-dlp failed): %s", url)
                stats["skipped_ydl"] += 1
                continue

            title = info.get("title", "")
            ok, reason = passes_filter(title)
            if not ok:
                log.debug("  SKIP (filter: %s): %s", reason, title[:60])
                stats["skipped_filter"] += 1
                continue

            if not duration_ok(info.get("duration_sec")):
                log.debug("  SKIP (duration): %s", url)
                stats["skipped_filter"] += 1
                continue

            row = make_row(
                canonical_url=url,
                platform="bilibili_tv",
                title=title,
                creator_name=info.get("uploader") or "Bilibili Creator",
                creator_url=info.get("uploader_url") or "https://www.bilibili.tv",
                thumbnail_url=info.get("thumbnail"),
                manifest_url=info.get("manifest_url"),
                direct_mp4_url=info.get("direct_mp4_url"),
                duration_sec=info.get("duration_sec"),
                view_count=info.get("view_count"),
                uploaded_at=info.get("uploaded_at"),
                category="gameplay",
            )

            if sb_upsert(row):
                log.info("  ✓ Added: %s", title[:60])
                stats["added"] += 1
            else:
                log.warning("  ✗ Upsert failed: %s", url)

        time.sleep(2.0)

    log.info(
        "bilibili.tv done — found=%d added=%d skipped_filter=%d skipped_exists=%d skipped_ydl=%d",
        stats["found"], stats["added"], stats["skipped_filter"],
        stats["skipped_exists"], stats["skipped_ydl"],
    )
