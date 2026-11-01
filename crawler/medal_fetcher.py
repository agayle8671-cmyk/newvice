"""medal_fetcher.py — Medal.tv gaming clip crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("medal")
PLATFORM = "medal"
SEARCH_QUERIES = ["GTA 6", "GTA VI", "grand theft auto 6", "GTA6"]
MEDAL_API = "https://medal.tv/api/clips"

def run():
    log.info("=== Medal.tv fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        r = get(MEDAL_API, params={"search": q, "limit": 20, "sortBy": "createdAt"})
        if not r:
            continue
        clips = r.json() if isinstance(r.json(), list) else r.json().get("clips", [])
        log.info("Query %r → %d clips", q, len(clips))
        stats["searched"] += len(clips)
        time.sleep(2)

        for c in clips:
            cid = str(c.get("contentId") or c.get("id", ""))
            if not cid or cid in seen:
                continue
            seen.add(cid)

            title = c.get("contentTitle") or c.get("title", "")
            ok, reason = passes_filter(title)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            dur = (c.get("contentDuration") or 0) // 1000  # ms → s
            if not duration_ok(dur or None):
                stats["skipped_filter"] += 1
                continue

            page_url = f"https://medal.tv/clips/{cid}"
            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            # Medal sometimes gives direct MP4
            direct = c.get("contentUrl") or c.get("videoUrl")
            if direct and direct.endswith(".mp4"):
                row = make_row(
                    canonical_url=page_url, platform=PLATFORM, title=title,
                    creator_name=c.get("authorName", ""), creator_url=c.get("authorUrl", ""),
                    thumbnail_url=c.get("contentThumbnail") or c.get("thumbnailUrl"),
                    direct_mp4_url=direct, duration_sec=dur or None,
                    view_count=c.get("contentViews") or c.get("views"),
                )
            else:
                info = extract(page_url)
                time.sleep(2)
                if not info:
                    stats["skipped_ydl"] += 1
                    continue
                row = make_row(
                    canonical_url=page_url, platform=PLATFORM,
                    title=info["title"] or title,
                    creator_name=info["uploader"] or c.get("authorName", ""),
                    creator_url=info["uploader_url"] or c.get("authorUrl", ""),
                    thumbnail_url=info["thumbnail"],
                    manifest_url=info["manifest_url"], direct_mp4_url=info["direct_mp4_url"],
                    duration_sec=info["duration_sec"] or dur or None,
                    view_count=info["view_count"], uploaded_at=info["uploaded_at"],
                )

            if sb_upsert(row):
                log.info("✓ %s", title[:70])
                stats["added"] += 1
            time.sleep(2)

    log.info("Done: %s", stats)
