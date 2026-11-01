"""soop_fetcher.py — SOOPLive (AfreecaTV) VOD crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("soop")
PLATFORM = "soop"
SEARCH_API = "https://www.sooplive.co.kr/api/search/api_video_search.php"
SEARCH_QUERIES = ["GTA6", "GTA 6", "GTA VI", "Grand Theft Auto 6"]

def run():
    log.info("=== SOOPLive fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        r = get(SEARCH_API, params={
            "szKeyword": q, "nPageNo": 1, "nListCnt": 20, "szOrder": "reg_dt",
        })
        if not r:
            time.sleep(3)
            continue

        try:
            videos = r.json().get("data", {}).get("videoList", [])
        except Exception:
            time.sleep(3)
            continue

        log.info("Query %r → %d results", q, len(videos))
        stats["searched"] += len(videos)
        time.sleep(3)

        for v in videos:
            vid_no = str(v.get("station_no") or v.get("title_no") or "")
            bj_id  = v.get("bj_id", "")
            if not vid_no or vid_no in seen:
                continue
            seen.add(vid_no)

            title = v.get("title_name", "")
            ok, reason = passes_filter(title)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            page_url = f"https://www.sooplive.co.kr/vod/player/{vid_no}"
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
                creator_name=info["uploader"] or v.get("user_nick", bj_id),
                creator_url=info["uploader_url"] or f"https://www.sooplive.co.kr/{bj_id}",
                thumbnail_url=info["thumbnail"] or v.get("thumb"),
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"],
                view_count=info["view_count"] or v.get("total_view_cnt"),
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ %s", (info["title"] or title)[:70])
                stats["added"] += 1
            time.sleep(3)

    log.info("Done: %s", stats)
