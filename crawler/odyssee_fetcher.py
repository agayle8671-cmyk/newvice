"""odyssee_fetcher.py — Odysee (LBRY) crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("odyssee")
PLATFORM = "odyssee"
LIGHTHOUSE = "https://lighthouse.odysee.com/search"
SEARCH_QUERIES = ["GTA 6", "GTA VI", "Grand Theft Auto 6", "GTA 6 gameplay"]

def run():
    log.info("=== Odysee fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        r = get(LIGHTHOUSE, params={
            "s": q, "size": 20, "from": 0,
            "mediaType": "video", "free_only": "true",
        })
        if not r:
            time.sleep(2)
            continue

        results = r.json() if isinstance(r.json(), list) else []
        log.info("Query %r → %d results", q, len(results))
        stats["searched"] += len(results)
        time.sleep(2)

        for item in results:
            name    = item.get("name", "")
            channel = item.get("channel_id") or item.get("channel", {}).get("name", "")
            claim_id = item.get("claimId") or item.get("claim_id", "")
            # canonical URL on Odysee
            url = item.get("canonical_url") or f"https://odysee.com/@{channel}/{name}"
            if not url or url in seen:
                continue
            seen.add(url)

            title = item.get("title") or name
            ok, reason = passes_filter(title, item.get("description", ""))
            if not ok:
                stats["skipped_filter"] += 1
                continue

            dur = item.get("video", {}).get("duration") if item.get("video") else None
            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue

            if sb_exists(url):
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", url)
            info = extract(url)
            time.sleep(2)
            if not info:
                stats["skipped_ydl"] += 1
                continue

            row = make_row(
                canonical_url=url, platform=PLATFORM,
                title=info["title"] or title,
                creator_name=info["uploader"] or item.get("channel", {}).get("name", ""),
                creator_url=info["uploader_url"] or "",
                thumbnail_url=info["thumbnail"] or item.get("thumbnail", {}).get("url"),
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"] or dur,
                view_count=info["view_count"],
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ %s", (info["title"] or title)[:70])
                stats["added"] += 1
            time.sleep(2)

    log.info("Done: %s", stats)
