"""coub_fetcher.py — Coub short video crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger)

log = get_logger("coub")
PLATFORM = "coub"
COUB_API = "https://coub.com/api/v2/search/coubs"
SEARCH_QUERIES = ["GTA 6", "GTA VI", "GTA6", "Grand Theft Auto 6"]
MIN_DUR = 3   # Coubs can be very short loops — lower threshold

def run():
    log.info("=== Coub fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        for page in range(1, 4):  # up to 3 pages
            r = get(COUB_API, params={
                "q": q, "order_by": "newest",
                "per_page": 20, "page": page,
            })
            if not r:
                break

            coubs = r.json().get("coubs", [])
            if not coubs:
                break

            log.info("Query %r page %d → %d coubs", q, page, len(coubs))
            stats["searched"] += len(coubs)
            time.sleep(2)

            for c in coubs:
                permalink = c.get("permalink", "")
                if not permalink or permalink in seen:
                    continue
                seen.add(permalink)

                title = c.get("title", "")
                ok, reason = passes_filter(title)
                if not ok:
                    stats["skipped_filter"] += 1
                    continue

                page_url = f"https://coub.com/view/{permalink}"
                if sb_exists(page_url):
                    stats["skipped_exists"] += 1
                    continue

                # Try to get direct MP4 from API response first
                fv = c.get("file_versions", {})
                web = fv.get("web", {}) if fv else {}
                mp4 = (web.get("mp4", {}) or {}).get("high") or (web.get("mp4", {}) or {}).get("med")

                dur = c.get("duration")
                if dur and dur < MIN_DUR:
                    stats["skipped_filter"] += 1
                    continue

                if mp4:
                    row = make_row(
                        canonical_url=page_url, platform=PLATFORM,
                        title=title or "GTA VI — Coub Clip",
                        creator_name=c.get("channel", {}).get("title", "") if c.get("channel") else "",
                        creator_url=f"https://coub.com/{(c.get('channel') or {}).get('permalink','')}",
                        thumbnail_url=c.get("picture"),
                        direct_mp4_url=mp4,
                        duration_sec=int(dur) if dur else None,
                        view_count=c.get("views_count"),
                    )
                    if sb_upsert(row):
                        log.info("  ✓ coub/%s", permalink)
                        stats["added"] += 1
                else:
                    info = extract(page_url)
                    time.sleep(2)
                    if not info:
                        stats["skipped_ydl"] += 1
                        continue
                    row = make_row(
                        canonical_url=page_url, platform=PLATFORM,
                        title=info["title"] or title,
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
                        log.info("  ✓ coub/%s", permalink)
                        stats["added"] += 1
                time.sleep(1)

    log.info("Done: %s", stats)
