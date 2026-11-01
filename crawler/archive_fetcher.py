"""archive_fetcher.py — Internet Archive crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok)

log = get_logger("archive")
PLATFORM = "archive"
SEARCH_API = "https://archive.org/advancedsearch.php"
SEARCH_QUERIES = [
    "GTA 6 trailer",
    "GTA VI trailer",
    "GTA 6",
    "GTA VI",
    "Grand Theft Auto VI",
    "Grand Theft Auto 6",
    "GTA 6 gameplay",
]

def run():
    log.info("=== Internet Archive fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for q in SEARCH_QUERIES:
        r = get(SEARCH_API, params={
            "q":        f'({q}) AND mediatype:movies',
            "fl[]":     ["identifier", "title", "creator", "description", "publicdate", "length"],
            "rows":     30,
            "output":   "json",
        })
        if not r:
            time.sleep(2)
            continue

        docs = r.json().get("response", {}).get("docs", [])
        log.info("Query %r → %d docs", q, len(docs))
        stats["searched"] += len(docs)
        time.sleep(2)

        for doc in docs:
            ident = doc.get("identifier", "")
            if not ident or ident in seen:
                continue
            seen.add(ident)

            title = doc.get("title", "")
            desc  = doc.get("description", "")
            ok, reason = passes_filter(title, desc if isinstance(desc, str) else "")
            if not ok:
                stats["skipped_filter"] += 1
                continue

            # Archive "length" is seconds as string sometimes
            raw_dur = doc.get("length")
            dur = None
            try:
                dur = int(float(raw_dur)) if raw_dur else None
            except Exception:
                pass

            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue

            page_url = f"https://archive.org/details/{ident}"
            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            log.info("  Extracting: %s", page_url)
            info = extract(page_url)
            time.sleep(3)
            if not info:
                stats["skipped_ydl"] += 1
                continue

            creator = doc.get("creator", "")
            if isinstance(creator, list):
                creator = creator[0] if creator else ""

            final_dur = info.get("duration_sec") or dur
            if not duration_ok(final_dur):
                log.debug("  SKIP duration: %s", final_dur)
                stats["skipped_filter"] += 1
                continue

            row = make_row(
                canonical_url=page_url, platform=PLATFORM,
                title=info["title"] or title,
                creator_name=info["uploader"] or creator,
                creator_url=info["uploader_url"] or "",
                thumbnail_url=info["thumbnail"],
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=final_dur,
                view_count=info["view_count"],
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ %s", (info["title"] or title)[:70])
                stats["added"] += 1
            time.sleep(2)

    log.info("Done: %s", stats)
