"""streamable_fetcher.py — Streamable + Gfycat crawler"""
import re
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("streamable")
SEARCH_QUERIES = ["GTA 6", "GTA VI", "GTA6"]

def _streamable(stats: dict, seen: set):
    """Scrape Streamable search page for GTA VI clips."""
    for q in SEARCH_QUERIES:
        r = get(f"https://streamable.com/search", params={"q": q},
                headers={"User-Agent": UA, "Accept": "text/html"})
        if not r:
            time.sleep(2)
            continue

        ids = re.findall(r'streamable\.com/(?:e/)?([a-zA-Z0-9]{4,8})', r.text)
        ids = list(dict.fromkeys(ids))  # dedupe preserving order
        log.info("Streamable %r → %d IDs", q, len(ids))
        stats["searched"] += len(ids)
        time.sleep(2)

        for sid in ids[:20]:
            if sid in seen:
                continue
            seen.add(sid)

            page_url = f"https://streamable.com/{sid}"
            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            # Streamable API for metadata
            meta = get(f"https://api.streamable.com/videos/{sid}")
            title = meta.json().get("title", "") if meta else ""
            ok, reason = passes_filter(title or q)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            log.info("  Extracting Streamable: %s", page_url)
            info = extract(page_url)
            time.sleep(2)
            if not info:
                stats["skipped_ydl"] += 1
                continue

            row = make_row(
                canonical_url=page_url, platform="streamable",
                title=info["title"] or title or f"GTA VI Clip — Streamable",
                creator_name=info["uploader"] or "Streamable",
                creator_url=info["uploader_url"] or "",
                thumbnail_url=info["thumbnail"],
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"],
                view_count=info["view_count"],
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ streamable/%s", sid)
                stats["added"] += 1
            time.sleep(2)

def _gfycat(stats: dict, seen: set):
    """Gfycat public search API."""
    for q in SEARCH_QUERIES:
        r = get("https://api.gfycat.com/v1/gfycats/search",
                params={"search_text": q, "count": 20})
        if not r:
            time.sleep(2)
            continue

        gfycats = r.json().get("gfycats", [])
        log.info("Gfycat %r → %d results", q, len(gfycats))
        stats["searched"] += len(gfycats)
        time.sleep(2)

        for g in gfycats:
            gid = g.get("gfyId", "")
            if not gid or gid in seen:
                continue
            seen.add(gid)

            title = g.get("title") or g.get("description") or ""
            ok, reason = passes_filter(title or q)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            page_url = f"https://gfycat.com/{gid}"
            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            # Gfycat often has direct MP4
            mp4 = g.get("mp4Url") or g.get("max2mbGif")
            if mp4 and mp4.endswith(".mp4"):
                row = make_row(
                    canonical_url=page_url, platform="gfycat",
                    title=title or "GTA VI Clip",
                    creator_name=g.get("userName", ""),
                    creator_url=f"https://gfycat.com/@{g.get('userName','')}",
                    thumbnail_url=g.get("posterUrl"),
                    direct_mp4_url=mp4,
                    duration_sec=int(g.get("numFrames", 0) / max(g.get("frameRate", 30), 1)) or None,
                    view_count=g.get("views"),
                )
                if sb_upsert(row):
                    log.info("  ✓ gfycat/%s", gid)
                    stats["added"] += 1
            time.sleep(1)

def run():
    log.info("=== Streamable + Gfycat fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()
    _streamable(stats, seen)
    _gfycat(stats, seen)
    log.info("Done: %s", stats)
