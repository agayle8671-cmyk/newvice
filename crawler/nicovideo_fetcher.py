"""nicovideo_fetcher.py — NicoNico Douga crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("nicovideo")
PLATFORM = "nicovideo"
NVAPI = "https://nvapi.nicovideo.jp/v1/search/video"
SEARCH_QUERIES = [
    "GTA6", "GTA VI", "グランドセフトオートVI",
    "GTA6 gameplay", "GTA 6",
]

def run():
    log.info("=== NicoNico fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        r = get(NVAPI, params={
            "q": q,
            "targets": "title,description",
            "_sort": "-registeredAt",
            "_limit": 20,
            "_context": "leonidavice",
        })
        if not r:
            time.sleep(2)
            continue

        items = r.json().get("data", {}).get("items", [])
        log.info("Query %r → %d items", q, len(items))
        stats["searched"] += len(items)
        time.sleep(2)

        for item in items:
            vid_id = item.get("id", "")  # smXXXXX
            if not vid_id or vid_id in seen:
                continue
            seen.add(vid_id)

            title = item.get("title", "")
            ok, reason = passes_filter(title, item.get("description", ""))
            if not ok:
                stats["skipped_filter"] += 1
                continue

            dur = item.get("lengthSeconds")
            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue

            page_url = f"https://www.nicovideo.jp/watch/{vid_id}"
            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", page_url)
            info = extract(page_url)
            time.sleep(3)
            if not info:
                stats["skipped_ydl"] += 1
                continue

            row = make_row(
                canonical_url=page_url, platform=PLATFORM,
                title=info["title"] or title,
                creator_name=info["uploader"] or item.get("owner", {}).get("name", ""),
                creator_url=info["uploader_url"] or "",
                thumbnail_url=info["thumbnail"] or item.get("thumbnailUrl", ""),
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"] or dur,
                view_count=info["view_count"] or item.get("viewCount"),
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ %s", (info["title"] or title)[:70])
                stats["added"] += 1
            time.sleep(2)

    log.info("Done: %s", stats)
