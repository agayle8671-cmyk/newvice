"""
Vimeo fetcher — searches Vimeo for GTA VI clips.
Uses yt-dlp with skip_download=True to extract HLS manifests.
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
    YDL_OPTS,
    UA,
)

log = get_logger(__name__)

SEARCH_TERMS = [
    "GTA 6 gameplay",
    "GTA VI trailer",
    "Grand Theft Auto 6",
    "GTA 6 Leonida",
    "GTA 6 Vice City",
]

VIMEO_SEARCH_PAGE = "https://vimeo.com/search?q={query}&type=video"
MAX_PER_TERM = 8
REQUEST_DELAY = 0.8


def _scrape_vimeo_ids(query: str) -> list[str]:
    """Use yt-dlp VimeoSearch extractor instead of HTML scraping (which 403s)."""
    opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": MAX_PER_TERM,
        "socket_timeout": 20,
    }
    ids = []
    # yt-dlp supports 'vimeo:search:<query>'
    for prefix in (f"vimeosearch{MAX_PER_TERM}:{query}", f"vimeo:search:{query}"):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(prefix, download=False)
            if info and info.get("entries"):
                for e in info["entries"]:
                    vid_id = e.get("id") or ""
                    if not vid_id:
                        url = e.get("url") or e.get("webpage_url") or ""
                        m = re.search(r"vimeo\.com/(\d+)", url)
                        if m:
                            vid_id = m.group(1)
                    if vid_id and vid_id.isdigit():
                        ids.append(vid_id)
                if ids:
                    return ids[:MAX_PER_TERM]
        except Exception as exc:
            log.debug("Vimeo yt-dlp search %r failed: %s", prefix, exc)
    return ids


def run():
    log.info("=== Vimeo fetcher starting ===")
    stats = {"found": 0, "skipped_filter": 0, "skipped_exists": 0, "skipped_ydl": 0, "added": 0}
    seen_ids: set[str] = set()

    for term in SEARCH_TERMS:
        log.info("Searching Vimeo: %r", term)
        ids = _scrape_vimeo_ids(term)
        log.info("  Found %d clip IDs", len(ids))

        for vid_id in ids:
            if vid_id in seen_ids:
                continue
            seen_ids.add(vid_id)

            url = f"https://vimeo.com/{vid_id}"
            stats["found"] += 1

            # Keyword check requires yt-dlp to get title — do exists check first
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
                platform="vimeo",
                title=title,
                creator_name=info.get("uploader") or "Vimeo Creator",
                creator_url=info.get("uploader_url") or f"https://vimeo.com/{vid_id}",
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

        time.sleep(1.5)

    log.info(
        "Vimeo done — found=%d added=%d skipped_filter=%d skipped_exists=%d skipped_ydl=%d",
        stats["found"], stats["added"], stats["skipped_filter"],
        stats["skipped_exists"], stats["skipped_ydl"],
    )
