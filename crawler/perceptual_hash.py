"""
perceptual_hash.py — V3 64-Bit DCT Perceptual Video Hashing & Viral Heat Engine
===============================================================================
Eliminates cross-platform duplicate re-uploads across all 20 sources while turning
multi-platform sightings into a real-time `viral_heat_score` boost.

Pipeline:
1. Tier 1 (Containerized Worker / FFmpeg available):
   Samples a 3x3 1-fps keyframe storyboard grid directly from the video stream via FFmpeg.
2. Tier 2 (Serverless / Thumbnail Fallback):
   Downloads the keyframe thumbnail, trims outer 8% letterbox/watermark borders.
3. Computes a 64-bit 2D Type-II Discrete Cosine Transform (32x32 -> 8x8 AC-median pHash).
4. Compares against active catalog hashes via 64-bit XOR Hamming distance (<= 10 bits)
   plus duration compatibility guard to merge cross-platform mirrors cleanly.
"""

from __future__ import annotations

import io
import math
import shutil
import logging
import subprocess
from typing import Optional
import requests
from PIL import Image

log = logging.getLogger("crawler.phash")

HAMMING_DUPLICATE_THRESHOLD = 10

# Precompute 8x32 Type-II DCT basis table (only top-left 8x8 low frequencies needed)
_DCT_BASIS_8x32: list[list[float]] = [
    [math.cos(((2 * x + 1) * u * math.pi) / 64.0) for x in range(32)]
    for u in range(8)
]

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def dct_phash_from_image(img: Image.Image, trim_border_pct: float = 0.06) -> str:
    """
    Compute standard 64-bit DCT perceptual hash (16-char lowercase hex) from a PIL Image.
    Resistant to recompression, aspect-ratio letterbox padding, and minor watermarks.
    """
    if trim_border_pct > 0:
        w, h = img.size
        if w > 32 and h > 32:
            dx = int(w * trim_border_pct)
            dy = int(h * trim_border_pct)
            img = img.crop((dx, dy, w - dx, h - dy))

    gray = img.convert("L").resize((32, 32), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    rows = [pixels[r * 32 : (r + 1) * 32] for r in range(32)]

    # Separable 2D DCT: Step 1 — 1D DCT along each of the 32 rows for u=0..7 -> temp[32][8]
    temp: list[list[float]] = []
    for r in range(32):
        row = rows[r]
        t_row = [
            sum(row[x] * _DCT_BASIS_8x32[u][x] for x in range(32))
            for u in range(8)
        ]
        temp.append(t_row)

    # Step 2 — 1D DCT along columns for v=0..7 -> 8x8 low-frequency coefficients
    coeffs: list[float] = []
    for v in range(8):
        basis_v = _DCT_BASIS_8x32[v]
        for u in range(8):
            val = sum(temp[y][u] * basis_v[y] for y in range(32))
            coeffs.append(val)

    # Exclude DC coefficient coeffs[0] so global brightness shifts don't flip bits
    ac_sorted = sorted(coeffs[1:])
    median = ac_sorted[len(ac_sorted) // 2]

    bits = 0
    for c in coeffs:
        bits = (bits << 1) | (1 if c > median else 0)

    return f"{bits:016x}"


def extract_ffmpeg_storyboard(
    media_url: str, timeout_sec: int = 14
) -> Optional[Image.Image]:
    """
    Uses FFmpeg (when installed on PATH) to sample 9 frames at 1 fps into a 3x3
    storyboard mosaic in memory — zero temp files written to disk.
    """
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin or not media_url:
        return None

    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-rw_timeout",
        "8000000",
        "-t",
        "12",
        "-i",
        media_url,
        "-vf",
        "fps=1,scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=3x3",
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            check=False,
        )
        if proc.returncode == 0 and len(proc.stdout) > 256:
            return Image.open(io.BytesIO(proc.stdout))
    except Exception as exc:
        log.debug("FFmpeg storyboard fallback for %s: %s", media_url[:60], exc)
    return None


def compute_video_phash(
    *,
    media_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    use_ffmpeg: bool = True,
) -> Optional[str]:
    """
    Computes a 64-bit DCT perceptual hash for a video clip.
    Prefers 1-fps FFmpeg 3x3 storyboard mosaic when FFmpeg is present; falls back
    seamlessly to keyframe thumbnail DCT pHash in serverless environments.
    """
    if use_ffmpeg and media_url:
        storyboard = extract_ffmpeg_storyboard(media_url)
        if storyboard is not None:
            try:
                # Do not trim border on a 3x3 tiled mosaic
                return dct_phash_from_image(storyboard, trim_border_pct=0.0)
            except Exception as exc:
                log.debug("Storyboard pHash failed: %s", exc)

    if thumbnail_url:
        try:
            resp = requests.get(
                thumbnail_url,
                headers={"User-Agent": _UA},
                timeout=8,
            )
            if resp.status_code == 200 and len(resp.content) > 200:
                img = Image.open(io.BytesIO(resp.content))
                return dct_phash_from_image(img, trim_border_pct=0.06)
        except Exception as exc:
            log.debug("Thumbnail pHash failed for %s: %s", thumbnail_url[:60], exc)

    return None


def hamming_distance_64(hash_a: Optional[str], hash_b: Optional[str]) -> int:
    """Bitwise Hamming distance between two 16-char hex 64-bit perceptual hashes."""
    if not hash_a or not hash_b:
        return 64
    try:
        return (int(hash_a, 16) ^ int(hash_b, 16)).bit_count()
    except ValueError:
        return 64


def durations_compatible(
    dur_a: Optional[int], dur_b: Optional[int]
) -> bool:
    """
    Guards against false positives from channels sharing a static default banner thumbnail:
    two clips are considered the same edit only if their durations agree within max(8s, 20%).
    """
    if not dur_a or not dur_b or dur_a <= 0 or dur_b <= 0:
        return True
    tolerance = max(8.0, 0.20 * max(dur_a, dur_b))
    return abs(dur_a - dur_b) <= tolerance


def compute_viral_heat_score(
    *,
    view_count: Optional[int] = 0,
    cross_platform_count: int = 1,
    high_beam_count: int = 0,
    play_count: int = 0,
) -> float:
    """
    Computes Viral Heat Score combining source traction, cross-platform velocity
    (+18 pts per additional platform sighting), and Drive-In High-Beam reactions (+5 pts).
    """
    views = max(0, int(view_count or 0))
    view_component = math.log10(views + 1) * 10.0
    cross_bonus = max(0, cross_platform_count - 1) * 18.0
    beam_bonus = max(0, int(high_beam_count or 0)) * 5.0
    play_bonus = min(max(0, int(play_count or 0)), 50) * 0.25
    return round(view_component + cross_bonus + beam_bonus + play_bonus, 2)


def find_and_merge_near_duplicate(
    *,
    supabase_url: str,
    sb_headers: dict,
    candidate_row: dict,
    threshold: int = HAMMING_DUPLICATE_THRESHOLD,
) -> tuple[bool, Optional[str]]:
    """
    Checks active video_catalog rows for a perceptual near-duplicate (Hamming <= 10).
    If found:
      - Appends candidate canonical_url to existing `cross_platform_urls`
      - Boosts `viral_heat_score`
      - Upgrades stream URL if existing row lacked a direct stream
      - Returns (True, existing_row_id) so caller skips inserting a duplicate row.
    """
    phash = candidate_row.get("perceptual_hash")
    canonical_url = candidate_row.get("canonical_url")
    if not phash or not supabase_url or not canonical_url:
        return False, None

    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/video_catalog",
            headers=sb_headers,
            params={
                "is_active": "eq.true",
                "perceptual_hash": "not.is.null",
                "select": "id,canonical_url,perceptual_hash,duration_sec,view_count,cross_platform_urls,high_beam_count,play_count,direct_mp4_url,manifest_url",
                "limit": "500",
            },
            timeout=10,
        )
        if r.status_code != 200:
            return False, None

        existing_rows = r.json()
    except Exception as exc:
        log.debug("Catalog phash lookup skipped: %s", exc)
        return False, None

    cand_dur = candidate_row.get("duration_sec")

    best_match = None
    best_dist = 65
    for existing in existing_rows:
        if existing.get("canonical_url") == canonical_url:
            # Exact same URL — let normal upsert update it
            return False, None
        dist = hamming_distance_64(phash, existing.get("perceptual_hash"))
        if dist <= threshold and durations_compatible(cand_dur, existing.get("duration_sec")):
            if dist < best_dist:
                best_dist = dist
                best_match = existing

    if not best_match:
        return False, None

    existing_id = best_match["id"]
    mirrors: list[str] = list(best_match.get("cross_platform_urls") or [])
    if canonical_url not in mirrors:
        mirrors.append(canonical_url)

    merged_views = max(
        int(best_match.get("view_count") or 0),
        int(candidate_row.get("view_count") or 0),
    )
    new_heat = compute_viral_heat_score(
        view_count=merged_views,
        cross_platform_count=1 + len(mirrors),
        high_beam_count=int(best_match.get("high_beam_count") or 0),
        play_count=int(best_match.get("play_count") or 0),
    )

    patch_payload: dict = {
        "cross_platform_urls": mirrors,
        "view_count": merged_views or best_match.get("view_count"),
        "viral_heat_score": new_heat,
    }
    if not best_match.get("direct_mp4_url") and candidate_row.get("direct_mp4_url"):
        patch_payload["direct_mp4_url"] = candidate_row["direct_mp4_url"]
    if not best_match.get("manifest_url") and candidate_row.get("manifest_url"):
        patch_payload["manifest_url"] = candidate_row["manifest_url"]

    try:
        pr = requests.patch(
            f"{supabase_url}/rest/v1/video_catalog?id=eq.{existing_id}",
            headers={**sb_headers, "Prefer": "return=minimal"},
            json=patch_payload,
            timeout=10,
        )
        if pr.status_code in (200, 204):
            log.info(
                "Merged cross-platform duplicate (Hamming=%d) %s -> %s (heat=%.2f, platforms=%d)",
                best_dist,
                canonical_url[:55],
                existing_id,
                new_heat,
                1 + len(mirrors),
            )
            return True, existing_id
    except Exception as exc:
        log.debug("Failed to patch merged duplicate %s: %s", existing_id, exc)

    return False, None
