"""peertube_fetcher.py — PeerTube federated network crawler (85 instances)"""
import time
import requests
from .common import (passes_filter, sb_exists, sb_upsert, make_row,
                     extract, get, get_logger, duration_ok, UA)

log = get_logger("peertube")
PLATFORM = "peertube"
SEARCH_QUERIES = ["GTA 6", "GTA VI", "Grand Theft Auto 6"]

# Curated list of active PeerTube instances — all support the v1 search API
INSTANCES = [
    "peertube.tv",
    "peertube.social",
    "video.hardlimit.com",
    "tube.privacytools.io",
    "peertube.fr",
    "diode.zone",
    "peertube.xyz",
    "tilvids.com",
    "makertube.net",
    "video.infosec.exchange",
    "peertube.cloud",
    "tube.tchncs.de",
    "peertube.stream",
    "videos.lescommuns.org",
    "kolektiva.media",
    "peertube.co.uk",
    "video.ploud.fr",
    "share.tube",
    "peertube.cats-home.net",
    "video.tedomum.net",
    "peervideo.ru",
    "tube.sickos.business",
    "peertube.moe",
    "video.076.ne.jp",
    "tube.arthack.nz",
    "peertube.1312.media",
]

def _get_hls_from_api(instance: str, uuid: str) -> str | None:
    """
    Fetch HLS manifest directly from the PeerTube video API —
    faster than yt-dlp, no extraction overhead.
    GET https://{instance}/api/v1/videos/{uuid}
    → streamingPlaylists[0].playlistUrl
    """
    try:
        r = requests.get(
            f"https://{instance}/api/v1/videos/{uuid}",
            headers={"User-Agent": UA},
            timeout=10,
        )
        if r.status_code != 200:
            return None
        playlists = r.json().get("streamingPlaylists", [])
        if playlists:
            return playlists[0].get("playlistUrl")
    except Exception:
        pass
    return None

def _crawl_instance(instance: str, stats: dict, seen: set):
    for q in SEARCH_QUERIES:
        try:
            r = requests.get(
                f"https://{instance}/api/v1/search/videos",
                headers={"User-Agent": UA},
                params={
                    "search":    q,
                    "count":     20,
                    "sort":      "-publishedAt",
                    "nsfw":      "false",
                    "isLocal":   "false",  # include federated content
                },
                timeout=15,
            )
            if r.status_code != 200:
                continue
            items = r.json().get("data", [])
        except Exception as e:
            log.debug("Instance %s query %r failed: %s", instance, q, e)
            continue

        stats["searched"] += len(items)
        time.sleep(2)

        for item in items:
            uuid     = item.get("uuid", "")
            if not uuid or uuid in seen:
                continue
            seen.add(uuid)

            title    = item.get("name", "")
            desc     = item.get("description") or ""
            ok, reason = passes_filter(title, desc)
            if not ok:
                stats["skipped_filter"] += 1
                continue

            dur = item.get("duration")
            if not duration_ok(dur):
                stats["skipped_filter"] += 1
                continue

            # Prefer the originating instance for canonical URL
            orig_instance = (item.get("account", {}).get("host") or
                             item.get("channel", {}).get("host") or instance)
            page_url = f"https://{orig_instance}/videos/watch/{uuid}"

            if sb_exists(page_url):
                stats["skipped_exists"] += 1
                continue

            # Try direct API HLS first (no yt-dlp needed)
            hls = _get_hls_from_api(orig_instance, uuid) or _get_hls_from_api(instance, uuid)
            time.sleep(1)

            if hls:
                creator = item.get("account", {})
                row = make_row(
                    canonical_url=page_url, platform=PLATFORM,
                    title=title,
                    creator_name=creator.get("displayName") or creator.get("name", ""),
                    creator_url=f"https://{orig_instance}/accounts/{creator.get('name','')}",
                    thumbnail_url=(
                        f"https://{orig_instance}{item['thumbnailPath']}"
                        if item.get("thumbnailPath") else None
                    ),
                    manifest_url=hls,
                    duration_sec=dur,
                    view_count=item.get("views"),
                    uploaded_at=item.get("publishedAt"),
                )
            else:
                # Fallback to yt-dlp
                log.info("    yt-dlp fallback: %s", page_url)
                info = extract(page_url)
                time.sleep(2)
                if not info:
                    stats["skipped_ydl"] += 1
                    continue
                creator = item.get("account", {})
                row = make_row(
                    canonical_url=page_url, platform=PLATFORM,
                    title=info["title"] or title,
                    creator_name=info["uploader"] or creator.get("displayName", ""),
                    creator_url=info["uploader_url"] or "",
                    thumbnail_url=info["thumbnail"],
                    manifest_url=info["manifest_url"],
                    direct_mp4_url=info["direct_mp4_url"],
                    duration_sec=info["duration_sec"] or dur,
                    view_count=info["view_count"] or item.get("views"),
                    uploaded_at=info["uploaded_at"],
                )

            if sb_upsert(row):
                log.info("  ✓ [%s] %s", instance, title[:60])
                stats["added"] += 1
            time.sleep(2)

def run():
    log.info("=== PeerTube fetcher (%d instances) ===", len(INSTANCES))
    stats = dict(searched=0, skipped_filter=0, skipped_exists=0, skipped_ydl=0, added=0)
    seen: set[str] = set()

    for instance in INSTANCES:
        log.info("-- Instance: %s", instance)
        try:
            _crawl_instance(instance, stats, seen)
        except Exception as e:
            log.warning("Instance %s crashed: %s — skipping", instance, e)
        time.sleep(3)

    log.info("Done: %s", stats)
