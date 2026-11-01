"""
crawler/launch_day_transition.py — Launch Day Automation Engine
===============================================================
Executes the transition from Pre-Launch (trailers/hype/speculation)
to Launch Day / Post-Launch (100% fresh user gameplay clips, stunts, chases).

Usage:
  python launch_day_transition.py --dry-run
  python launch_day_transition.py --execute
"""

import sys
import os
import argparse
from datetime import datetime, timezone
import requests

try:
    from .common import (
        SUPABASE_URL,
        SB_HEADERS,
        POST_LAUNCH_REJECT_REGEX,
        GTA6_LAUNCH_DATE,
        get_logger,
    )
except (ImportError, ValueError):
    from common import (
        SUPABASE_URL,
        SB_HEADERS,
        POST_LAUNCH_REJECT_REGEX,
        GTA6_LAUNCH_DATE,
        get_logger,
    )

log = get_logger("launch_day_transition")


def execute_transition(dry_run: bool = True):
    if not SUPABASE_URL:
        log.error("Missing Supabase credentials.")
        return

    log.info("Starting Launch Day transition check...")
    log.info(f"Target Launch Date cutoff: {GTA6_LAUNCH_DATE}")
    log.info(f"Mode: {'DRY RUN (Preview)' if dry_run else 'LIVE EXECUTION'}")

    # Fetch all currently active videos
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/video_catalog",
            headers=SB_HEADERS,
            params={
                "select": "id,title,canonical_url,source_platform,source_category,uploaded_at,is_active",
                "is_active": "eq.true",
            },
            timeout=15,
        )
        r.raise_for_status()
        active_videos = r.json()
    except Exception as e:
        log.error(f"Failed to query database: {e}")
        return

    log.info(f"Total active videos in database: {len(active_videos)}")

    obsolete_ids = []
    reasons = {}

    for v in active_videos:
        vid_id = v["id"]
        title = v.get("title", "")
        uploaded_at = v.get("uploaded_at")

        # 1. Obsolete keywords check
        if POST_LAUNCH_REJECT_REGEX.search(title):
            obsolete_ids.append(vid_id)
            reasons[vid_id] = f"Obsolete speculation/leak/breakdown title: '{title}'"
            continue

        # 2. Upload date cutoff check
        if uploaded_at:
            try:
                up_dt = datetime.fromisoformat(uploaded_at.replace("Z", "+00:00"))
                launch_dt = datetime.fromisoformat(GTA6_LAUNCH_DATE.replace("Z", "+00:00"))
                if up_dt < launch_dt:
                    obsolete_ids.append(vid_id)
                    reasons[vid_id] = f"Pre-launch upload date ({uploaded_at} < {GTA6_LAUNCH_DATE}): '{title}'"
                    continue
            except Exception:
                pass

    log.info(f"Identified {len(obsolete_ids)} obsolete videos to retire.")

    for vid_id in obsolete_ids[:10]:
        log.info(f" - {reasons[vid_id]}")
    if len(obsolete_ids) > 10:
        log.info(f" ... and {len(obsolete_ids) - 10} more.")

    if dry_run:
        log.info("DRY RUN completed. No changes made. Run with --execute to retire these clips.")
        return

    # Execute retirement in batches of 20
    retired_count = 0
    batch_size = 20
    for i in range(0, len(obsolete_ids), batch_size):
        batch = obsolete_ids[i:i + batch_size]
        try:
            patch_res = requests.patch(
                f"{SUPABASE_URL}/rest/v1/video_catalog",
                headers=SB_HEADERS,
                params={"id": f"in.({','.join(batch)})"},
                json={
                    "is_active": False,
                    "source_category": "pre_launch_archive",
                },
                timeout=15,
            )
            patch_res.raise_for_status()
            retired_count += len(batch)
        except Exception as e:
            log.error(f"Failed to retire batch: {e}")

    log.info(f"SUCCESS: Retired {retired_count} pre-launch videos to 'pre_launch_archive'.")
    log.info("Rotation queue is now primed exclusively for post-launch user gameplay clips!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transition LeonidaVice catalog to Launch Day mode.")
    parser.add_argument("--execute", action="store_true", help="Execute the transition in live Supabase DB")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Preview obsolete videos without changing DB")
    args = parser.parse_args()

    execute_transition(dry_run=not args.execute)
