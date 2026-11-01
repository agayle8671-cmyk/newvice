"""vk_fetcher.py — VK.com video crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("vk")
PLATFORM = "vk"
# yt-dlp supports VK search natively via "vksearch{n}:{query}"
SEARCH_QUERIES = ["GTA 6 gameplay", "GTA VI", "GTA 6 2025", "Grand Theft Auto 6"]
MAX_PER_QUERY = 15

def run():
    log.info("=== VK fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    import yt_dlp
    flat_opts = {
        "skip_download": True, "quiet": True, "no_warnings": True,
        "extract_flat": True, "ignoreerrors": True,
    }

    for q in SEARCH_QUERIES:
        search_url = f"vksearch{MAX_PER_QUERY}:{q}"
        log.info("Searching VK: %r", q)
        try:
            with yt_dlp.YoutubeDL(flat_opts) as ydl:
                info = ydl.extract_info(search_url, download=False)
            entries = info.get("entries", []) if info else []
        except Exception as e:
            log.warning("VK search failed: %s", e)
            entries = []

        log.info("  → %d results", len(entries))
        stats["searched"] += len(entries)
        time.sleep(3)

        for entry in entries:
            url = entry.get("url") or entry.get("webpage_url", "")
            if not url or "vk.com" not in url:
                continue
            if url in seen:
                continue
            seen.add(url)

            title = entry.get("title", "")
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

            log.info("  Extracting: %s", url)
            info_full = extract(url)
            time.sleep(3)
            if not info_full:
                stats["skipped_ydl"] += 1
                continue

            row = make_row(
                canonical_url=url, platform=PLATFORM,
                title=info_full["title"] or title,
                creator_name=info_full["uploader"] or entry.get("uploader", ""),
                creator_url=info_full["uploader_url"] or "",
                thumbnail_url=info_full["thumbnail"],
                manifest_url=info_full["manifest_url"],
                direct_mp4_url=info_full["direct_mp4_url"],
                duration_sec=info_full["duration_sec"] or dur,
                view_count=info_full["view_count"],
                uploaded_at=info_full["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ %s", (info_full["title"] or title)[:70])
                stats["added"] += 1
            time.sleep(3)

    log.info("Done: %s", stats)
