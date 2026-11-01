"""
x_fetcher.py — X (Twitter) video crawler
==========================================
Strategy: yt-dlp's TwitterSearchIE extractor hits X's internal
GraphQL search endpoint — no API key, no $100/month subscription.
It mimics what the browser does when you search twitter.com/search.

Limitations:
  - Rate-limited by X aggressively (~20-30 results per query before throttle)
  - May require a guest token that yt-dlp handles automatically
  - Video quality depends on what the poster uploaded (up to 1080p)
  - Only videos that are publicly visible (no login wall)

We use yt-dlp flat extraction first (fast, no download), then full
extraction only on items that pass keyword filter.
"""

import time
import yt_dlp
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get_logger, duration_ok, UA)

log = get_logger("x")
PLATFORM = "x"

SEARCH_QUERIES = [
    "GTA 6 gameplay",
    "GTA VI gameplay",
    "GTA6 gameplay",
    "Grand Theft Auto 6 clip",
    "GTA VI Leonida",
    "GTA 6 2025",
]

MAX_PER_QUERY = 20


def run():
    log.info("=== X (Twitter) fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    # Phase 1: flat search — get URLs fast, no video download
    flat_opts = {
        "skip_download": True,
        "quiet":         True,
        "no_warnings":   True,
        "extract_flat":  True,
        "ignoreerrors":  True,
        "http_headers":  {"User-Agent": UA},
    }

    for q in SEARCH_QUERIES:
        # yt-dlp Twitter search format: "twitter:search:{query}"
        search_url = f"twitter:search:{q}"
        log.info("Searching X: %r", q)

        try:
            with yt_dlp.YoutubeDL({**flat_opts, "playlistend": MAX_PER_QUERY}) as ydl:
                result = ydl.extract_info(search_url, download=False)
            entries = result.get("entries", []) if result else []
        except Exception as e:
            log.warning("X search failed for %r: %s", q, e)
            time.sleep(5)
            continue

        log.info("  → %d results", len(entries))
        stats["searched"] += len(entries)
        time.sleep(4)  # X throttles hard — be polite

        for entry in entries:
            if not entry:
                continue

            url = entry.get("webpage_url") or entry.get("url", "")
            if not url or "twitter.com" not in url and "x.com" not in url:
                continue

            # Normalise to x.com
            url = url.replace("twitter.com", "x.com")

            if url in seen:
                continue
            seen.add(url)

            title = entry.get("title") or entry.get("description") or ""
            ok, reason = passes_filter(title)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            dur = entry.get("duration")
            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue

            if sb_exists(url):
                stats["skipped_exists"] += 1
                continue

            # Phase 2: full extraction on matched items
            log.info("  Extracting: %s", url)
            info = extract(url)
            time.sleep(4)

            if not info:
                stats["skipped_ydl"] += 1
                continue

            # Get poster name from URL: x.com/{username}/status/{id}
            parts = url.rstrip("/").split("/")
            poster = parts[-3] if len(parts) >= 3 else ""

            row = make_row(
                canonical_url=url,
                platform=PLATFORM,
                title=info["title"] or title or "GTA VI Clip on X",
                creator_name=info["uploader"] or poster,
                creator_url=info["uploader_url"] or (f"https://x.com/{poster}" if poster else ""),
                thumbnail_url=info["thumbnail"],
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"] or dur,
                view_count=info["view_count"],
                uploaded_at=info["uploaded_at"],
            )

            if sb_upsert(row):
                log.info("  ✓ %s", (info["title"] or title)[:70])
                stats["added"] += 1

            time.sleep(3)

    log.info("Done: %s", stats)
