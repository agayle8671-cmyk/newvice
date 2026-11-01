"""bilibili_fetcher.py — Bilibili video crawler"""
import re
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("bilibili")
PLATFORM = "bilibili"
BILI_SEARCH = "https://api.bilibili.com/x/web-interface/search/all/v2"
BILI_HEADERS = {
    "User-Agent": UA,
    "Referer": "https://www.bilibili.com",
}
SEARCH_QUERIES = ["GTA6", "GTA 6", "侠盗猎车手6", "GTA VI gameplay"]

def _mmss_to_sec(s: str) -> int | None:
    """Convert 'mm:ss' or 'hh:mm:ss' string to seconds."""
    if not s:
        return None
    parts = s.strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except Exception:
        pass
    return None

def run():
    log.info("=== Bilibili fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        for page in range(1, 3):
            r = get(BILI_SEARCH, headers=BILI_HEADERS, params={
                "keyword": q, "search_type": "video",
                "page": page, "page_size": 20,
            })
            if not r:
                time.sleep(3)
                break

            result_list = r.json().get("data", {}).get("result", [])
            # find the "video" type block
            videos = []
            for block in result_list:
                if block.get("result_type") == "video":
                    videos = block.get("data", [])
                    break

            if not videos:
                break

            log.info("Query %r page %d → %d videos", q, page, len(videos))
            stats["searched"] += len(videos)
            time.sleep(2)

            for v in videos:
                bvid = v.get("bvid", "")
                if not bvid or bvid in seen:
                    continue
                seen.add(bvid)

                title = re.sub(r'<[^>]+>', '', v.get("title", ""))  # strip HTML tags
                desc  = v.get("description", "")
                ok, reason = passes_filter(title, desc)
                if not ok:
                    stats["skipped_filter"] += 1
                    continue

                dur = _mmss_to_sec(v.get("duration", ""))
                if not duration_ok(dur):
                    stats["skipped_filter"] += 1
                    continue

                page_url = f"https://www.bilibili.com/video/{bvid}"
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
                    creator_name=info["uploader"] or v.get("author", ""),
                    creator_url=info["uploader_url"] or "",
                    thumbnail_url=info["thumbnail"] or v.get("pic", ""),
                    manifest_url=info["manifest_url"],
                    direct_mp4_url=info["direct_mp4_url"],
                    duration_sec=info["duration_sec"] or dur,
                    view_count=info["view_count"] or v.get("play"),
                    uploaded_at=info["uploaded_at"],
                )
                if sb_upsert(row):
                    log.info("  ✓ %s", (info["title"] or title)[:70])
                    stats["added"] += 1
                time.sleep(2)

    log.info("Done: %s", stats)
