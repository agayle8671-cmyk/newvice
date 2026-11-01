"""
backfill_phash.py — Backfills V3 64-Bit Perceptual Hashes & Viral Heat Scores
=============================================================================
Computes 64-bit DCT perceptual hashes and initial viral_heat_score values across
all active rows in Supabase `video_catalog`, and merges any visual near-duplicates
(Hamming distance <= 10 with compatible durations).

Usage:
  python -m crawler.backfill_phash
  python -m crawler.backfill_phash --dry-run
"""

from __future__ import annotations

import argparse
import requests
from .common import SUPABASE_URL, SB_HEADERS, get_logger
from .perceptual_hash import (
    HAMMING_DUPLICATE_THRESHOLD,
    compute_video_phash,
    compute_viral_heat_score,
    durations_compatible,
    hamming_distance_64,
)

log = get_logger("crawler.backfill_phash")


def archive_thumb_fallback(canonical_url: str, direct_mp4_url: str | None) -> str | None:
    """Derives Archive.org __ia_thumb.jpg when thumbnail_url is missing on older rows."""
    for u in (canonical_url or "", direct_mp4_url or ""):
        if "archive.org/details/" in u:
            ident = u.split("archive.org/details/", 1)[1].split("/")[0].split("?")[0]
            if ident:
                return f"https://archive.org/services/img/{ident}"
        if "archive.org/download/" in u:
            ident = u.split("archive.org/download/", 1)[1].split("/")[0].split("?")[0]
            if ident:
                return f"https://archive.org/services/img/{ident}"
    return None


def run_backfill(dry_run: bool = False) -> None:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/video_catalog",
        headers=SB_HEADERS,
        params={
            "is_active": "eq.true",
            "select": "id,canonical_url,title,thumbnail_url,direct_mp4_url,manifest_url,duration_sec,view_count,play_count,high_beam_count,cross_platform_urls,perceptual_hash,viral_heat_score",
            "order": "play_count.desc,fetched_at.asc",
            "limit": "500",
        },
        timeout=15,
    )
    r.raise_for_status()
    rows = r.json()
    log.info("Loaded %d active catalog rows for V3 pHash & Viral Heat backfill.", len(rows))

    kept_rows: list[dict] = []
    hashed_count = 0
    merged_count = 0

    for row in rows:
        vid_id = row["id"]
        thumb = row.get("thumbnail_url") or archive_thumb_fallback(
            row.get("canonical_url", ""), row.get("direct_mp4_url")
        )
        media_url = row.get("direct_mp4_url") or row.get("manifest_url")

        phash = row.get("perceptual_hash")
        if not phash:
            phash = compute_video_phash(media_url=media_url, thumbnail_url=thumb)

        if phash:
            hashed_count += 1

        mirrors = list(row.get("cross_platform_urls") or [])
        heat = compute_viral_heat_score(
            view_count=row.get("view_count") or 0,
            cross_platform_count=1 + len(mirrors),
            high_beam_count=row.get("high_beam_count") or 0,
            play_count=row.get("play_count") or 0,
        )

        # Check against already-kept rows for visual near-duplicates (Hamming <= 10)
        duplicate_target = None
        best_dist = 65
        if phash:
            for prev in kept_rows:
                prev_hash = prev.get("perceptual_hash")
                if not prev_hash:
                    continue
                dist = hamming_distance_64(phash, prev_hash)
                if dist <= HAMMING_DUPLICATE_THRESHOLD and durations_compatible(
                    row.get("duration_sec"), prev.get("duration_sec")
                ):
                    if dist < best_dist:
                        best_dist = dist
                        duplicate_target = prev

        if duplicate_target is not None:
            merged_count += 1
            target_id = duplicate_target["id"]
            target_mirrors = list(duplicate_target.get("cross_platform_urls") or [])
            if row["canonical_url"] not in target_mirrors:
                target_mirrors.append(row["canonical_url"])
            duplicate_target["cross_platform_urls"] = target_mirrors

            merged_views = max(
                int(duplicate_target.get("view_count") or 0),
                int(row.get("view_count") or 0),
            )
            duplicate_target["view_count"] = merged_views
            new_target_heat = compute_viral_heat_score(
                view_count=merged_views,
                cross_platform_count=1 + len(target_mirrors),
                high_beam_count=duplicate_target.get("high_beam_count") or 0,
                play_count=duplicate_target.get("play_count") or 0,
            )
            duplicate_target["viral_heat_score"] = new_target_heat

            log.info(
                "  [DUP Hamming=%d] '%s' (%s) -> merged into '%s' (%s), heat=%.2f",
                best_dist,
                (row.get("title") or "")[:42],
                vid_id[:8],
                (duplicate_target.get("title") or "")[:42],
                target_id[:8],
                new_target_heat,
            )

            if not dry_run:
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/video_catalog?id=eq.{target_id}",
                    headers={**SB_HEADERS, "Prefer": "return=minimal"},
                    json={
                        "cross_platform_urls": target_mirrors,
                        "view_count": merged_views or duplicate_target.get("view_count"),
                        "viral_heat_score": new_target_heat,
                    },
                    timeout=10,
                )
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/video_catalog?id=eq.{vid_id}",
                    headers={**SB_HEADERS, "Prefer": "return=minimal"},
                    json={
                        "is_active": False,
                        "perceptual_hash": phash,
                    },
                    timeout=10,
                )
            continue

        row["perceptual_hash"] = phash
        row["viral_heat_score"] = heat
        kept_rows.append(row)

        patch_body: dict = {"viral_heat_score": heat}
        if phash:
            patch_body["perceptual_hash"] = phash
        if not row.get("thumbnail_url") and thumb:
            patch_body["thumbnail_url"] = thumb

        log.info(
            "  [OK] %s | pHash=%s | heat=%.2f | %s",
            vid_id[:8],
            phash or "none            ",
            heat,
            (row.get("title") or "")[:50],
        )

        if not dry_run:
            pr = requests.patch(
                f"{SUPABASE_URL}/rest/v1/video_catalog?id=eq.{vid_id}",
                headers={**SB_HEADERS, "Prefer": "return=minimal"},
                json=patch_body,
                timeout=10,
            )
            if pr.status_code not in (200, 204):
                log.warning("  Failed PATCH for %s: %s", vid_id[:8], pr.text[:120])

    log.info(
        "Backfill complete (dry_run=%s): %d hashed, %d duplicates merged, %d unique active clips.",
        dry_run,
        hashed_count,
        merged_count,
        len(kept_rows),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill V3 perceptual hashes & viral heat")
    parser.add_argument("--dry-run", action="store_true", help="Preview hashes & merges without DB writes")
    args = parser.parse_args()
    run_backfill(dry_run=args.dry_run)
