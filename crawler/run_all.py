"""
run_all.py — LeonidaVice crawler orchestrator
===============================================
Runs all platform fetchers in sequence and logs a summary to Supabase.

Usage:
  # From the project root (leonida-vice/)
  python -m crawler.run_all                          # all platforms
  python -m crawler.run_all --platforms rumble kick  # specific ones
  python -m crawler.run_all --dry-run                # no DB writes, filter test only
  python -m crawler.run_all --list                   # show all platforms

Schedule this with Task Scheduler (Windows) or cron (Linux/Mac).
Recommended: every 6 hours.
"""

import sys
import time
import json
import logging
import argparse
import importlib
import traceback
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

import os
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── Platform priority order ──────────────────────────────────────────────────
# Fastest / most GTA VI content first; PeerTube last (many instances, slowest)
ALL_FETCHERS = [
    ("rumble",         "crawler.rumble_fetcher"),
    ("dailymotion",    "crawler.dailymotion_fetcher"),
    ("reddit",         "crawler.reddit_fetcher"),
    ("x",              "crawler.x_fetcher"),
    ("kick",           "crawler.kick_fetcher"),
    ("medal",          "crawler.medal_fetcher"),
    ("bitchute",       "crawler.bitchute_fetcher"),
    ("imgur",          "crawler.imgur_fetcher"),
    ("streamable",     "crawler.streamable_fetcher"),
    ("coub",           "crawler.coub_fetcher"),
    ("odyssee",        "crawler.odyssee_fetcher"),
    ("archive",        "crawler.archive_fetcher"),
    ("bilibili",       "crawler.bilibili_fetcher"),
    ("bilibili_tv",    "crawler.bilibili_global_fetcher"),
    ("vimeo",          "crawler.vimeo_fetcher"),
    ("vk",             "crawler.vk_fetcher"),
    ("nicovideo",      "crawler.nicovideo_fetcher"),
    ("soop",           "crawler.soop_fetcher"),
    ("modsites",       "crawler.modsite_fetcher"),
    ("peertube",       "crawler.peertube_fetcher"),   # slowest — 25 instances
]

def log_run(stats: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/aggregator_runs",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={
                "run_at":           datetime.now(timezone.utc).isoformat(),
                "sources_crawled":  stats.get("sources_crawled", 0),
                "videos_found":     stats.get("videos_found", 0),
                "videos_added":     stats.get("videos_added", 0),
                "videos_rejected":  stats.get("videos_rejected", 0),
                "error_log":        json.dumps(stats["errors"]) if stats.get("errors") else None,
            },
            timeout=15,
        )
    except Exception:
        pass

def run(platforms: list[str] | None = None, dry_run: bool = False):
    log.info("=" * 64)
    log.info("LeonidaVice Crawler — %s", datetime.now().strftime("%Y-%m-%d %H:%M"))
    if dry_run:
        log.info("DRY RUN — no DB writes")
    log.info("=" * 64)

    overall = {"sources_crawled": 0, "videos_found": 0,
               "videos_added": 0, "videos_rejected": 0, "errors": []}

    fetchers = ALL_FETCHERS
    if platforms:
        fetchers = [(p, m) for p, m in ALL_FETCHERS if p in platforms]
        if not fetchers:
            log.error("No fetchers matched: %s", platforms)
            log.info("Available: %s", [p for p, _ in ALL_FETCHERS])
            sys.exit(1)

    for platform, module_path in fetchers:
        log.info("\n── %s ──────────────────────────────────────────────", platform.upper())
        if dry_run:
            log.info("  [dry-run] skipping")
            overall["sources_crawled"] += 1
            continue

        try:
            mod = importlib.import_module(module_path)
            mod.run()
            overall["sources_crawled"] += 1
        except ModuleNotFoundError as e:
            msg = f"{platform}: module not found — {e}"
            log.warning("  SKIP — %s", msg)
            overall["errors"].append(msg)
        except Exception as e:
            msg = f"{platform}: {e}"
            log.error("  ERROR — %s", msg)
            log.debug(traceback.format_exc())
            overall["errors"].append(msg)

        time.sleep(5)

    log.info("\n" + "=" * 64)
    log.info("Crawl complete in %d platforms. Errors: %d",
             overall["sources_crawled"], len(overall["errors"]))
    log.info("=" * 64)

    log_run(overall)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LeonidaVice crawler orchestrator")
    parser.add_argument("--platforms", nargs="+", metavar="PLATFORM",
                        help="Only run these fetchers (e.g. rumble dailymotion)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Keyword filter only — no yt-dlp, no DB writes")
    parser.add_argument("--list", action="store_true",
                        help="List all available platforms and exit")
    args = parser.parse_args()

    if args.list:
        print("Available platforms:")
        for p, _ in ALL_FETCHERS:
            print(f"  {p}")
        sys.exit(0)

    run(platforms=args.platforms, dry_run=args.dry_run)
