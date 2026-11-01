"""
bitchute_fetcher.py — Bitchute video crawler
=============================================
Strategy:
  Bitchute has no public API. We scrape the search results page
  for video links, then use yt-dlp to resolve the stream URL.
  yt-dlp has a full BitChute extractor that handles their
  embed token system automatically.
"""

import re
import time
import yt_dlp
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("bitchute")
PLATFORM = "bitchute"
SEARCH_QUERIES = [
    "GTA 6", "GTA VI", "GTA6",
    "Grand Theft Auto 6", "GTA 6 gameplay",
]
MAX_PER_QUERY = 15


def _search_via_ytdlp(query: str) -> list[str]:
    """
    Use yt-dlp BitchuteSearch extractor.
    Falls back to HTML scrape if yt-dlp doesn't support it.
    """
    # yt-dlp supports 'bitchute:search:<query>' or just tries generic
    # Use ytsearch-style: 'bitchute:<query>'
    opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": MAX_PER_QUERY,
        "socket_timeout": 20,
    }
    urls = []
    for prefix in (f"bitchute:{query}", f"bitchutesearch{MAX_PER_QUERY}:{query}"):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(prefix, download=False)
            if info and info.get("entries"):
                for e in info["entries"]:
                    u = e.get("url") or e.get("webpage_url") or ""
                    if u and "bitchute.com" in u:
                        urls.append(u)
                if urls:
                    return urls[:MAX_PER_QUERY]
        except Exception:
            pass

    # HTML scrape fallback
    from .common import get as http_get
    r = http_get(
        "https://www.bitchute.com/search",
        params={"query": query, "kind": "video"},
        headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
    )
    if r:
        slugs = re.findall(r'href="/video/([a-zA-Z0-9]+)/"', r.text)
        slugs = list(dict.fromkeys(slugs))
        urls = [f"https://www.bitchute.com/video/{s}/" for s in slugs[:MAX_PER_QUERY]]
    return urls


def run():
    log.info("=== Bitchute fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        log.info("Searching Bitchute: %r", q)
        urls = _search_via_ytdlp(q)
        log.info("  → %d results", len(urls))
        stats["searched"] += len(urls)
        time.sleep(3)

        for url in urls:
            if url in seen:
                continue
            seen.add(url)

            if sb_exists(url):
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", url)
            info = extract(url)
            time.sleep(3)

            if not info:
                stats["skipped_ydl"] += 1
                continue

            title = info["title"] or ""
            ok, reason = passes_filter(title)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            if not duration_ok(info["duration_sec"]):
                stats["skipped_filter"] += 1
                continue

            row = make_row(
                canonical_url=url,
                platform=PLATFORM,
                title=title,
                creator_name=info["uploader"] or "",
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
            time.sleep(3)

    log.info("Done: %s", stats)
