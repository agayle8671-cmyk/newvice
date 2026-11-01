"""reddit_fetcher.py — Reddit video post crawler"""
import time
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("reddit")
PLATFORM = "reddit"
REDDIT_HEADERS = {"User-Agent": f"LeonidaViceCrawler/1.0 (by /u/leonidavice_bot)"}
SUBREDDITS = ["GTA6", "GrandTheftAutoVI", "gtaonline", "gaming"]
SEARCH_QUERIES = ["GTA 6 gameplay", "GTA VI"]

def _fetch_sub(url: str, stats: dict, seen: set):
    r = get(url, headers=REDDIT_HEADERS)
    if not r:
        return
    posts = r.json().get("data", {}).get("children", [])
    log.info("  %s → %d posts", url, len(posts))
    stats["searched"] += len(posts)
    time.sleep(2)

    for child in posts:
        p = child.get("data", {})
        if not p.get("is_video"):
            # Also accept v.redd.it links even if not flagged
            url_val = p.get("url", "")
            if "v.redd.it" not in url_val:
                continue

        permalink = p.get("permalink", "")
        if not permalink or permalink in seen:
            continue
        seen.add(permalink)

        title = p.get("title", "")
        ok, reason = passes_filter(title)
        if not ok:
            stats["skipped_filter"] += 1
            continue

        page_url = f"https://www.reddit.com{permalink}"
        if sb_exists(page_url):
            stats["skipped_exists"] += 1
            continue

        # Reddit native video — grab HLS manifest directly
        media = p.get("media") or {}
        rv    = media.get("reddit_video") or {}
        hls   = rv.get("hls_url")
        dur   = rv.get("duration")

        if hls:
            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue
            row = make_row(
                canonical_url=page_url, platform=PLATFORM,
                title=title,
                creator_name=p.get("author", ""),
                creator_url=f"https://www.reddit.com/user/{p.get('author','')}",
                thumbnail_url=p.get("thumbnail") if p.get("thumbnail", "").startswith("http") else None,
                manifest_url=hls,
                duration_sec=dur,
                view_count=p.get("score"),
            )
            if sb_upsert(row):
                log.info("  ✓ reddit%s", permalink)
                stats["added"] += 1
        else:
            # v.redd.it URL — let yt-dlp resolve
            vreddit = p.get("url", "")
            if "v.redd.it" not in vreddit:
                continue
            log.info("  Extracting v.redd.it: %s", vreddit)
            info = extract(vreddit)
            time.sleep(2)
            if not info:
                stats["skipped_ydl"] += 1
                continue
            if not duration_ok(info.get("duration_sec")):
                stats["skipped_filter"] += 1
                continue
            row = make_row(
                canonical_url=page_url, platform=PLATFORM,
                title=info["title"] or title,
                creator_name=p.get("author", ""),
                creator_url=f"https://www.reddit.com/user/{p.get('author','')}",
                thumbnail_url=info["thumbnail"],
                manifest_url=info["manifest_url"],
                direct_mp4_url=info["direct_mp4_url"],
                duration_sec=info["duration_sec"],
                view_count=p.get("score"),
                uploaded_at=info["uploaded_at"],
            )
            if sb_upsert(row):
                log.info("  ✓ reddit%s", permalink)
                stats["added"] += 1
        time.sleep(2)

def run():
    log.info("=== Reddit fetcher ===")
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    # Subreddit new feeds
    for sub in SUBREDDITS:
        _fetch_sub(f"https://www.reddit.com/r/{sub}/new.json?limit=50", stats, seen)
        time.sleep(3)

    # Search
    for q in SEARCH_QUERIES:
        _fetch_sub(
            f"https://www.reddit.com/search.json?q={q}&sort=new&type=link&limit=50",
            stats, seen,
        )
        time.sleep(3)

    log.info("Done: %s", stats)
