"""
common.py — Shared utilities for all LeonidaVice crawlers
==========================================================
Every fetcher imports from here. One place to fix Supabase auth,
keyword filters, yt-dlp options, and ID generation.
"""

import os
import re
import hashlib
import logging
import requests
import yt_dlp
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

# Load .env and .env.local from project root
_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_dir)
load_dotenv(os.path.join(_root, ".env.local"))
load_dotenv(os.path.join(_root, ".env"))

# ─── Env ──────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
        "Copy .env.example to .env and fill in your Supabase credentials."
    )

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ─── Logging ──────────────────────────────────────────────────────────────────
def get_logger(name: str) -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    return logging.getLogger(name)

# ─── Launch Phase & Date Boundary ─────────────────────────────────────────────
# Automatically switches or can be forced via GTA6_LAUNCH_MODE=true
# Once GTA 6 is out, all speculation, leak, and pre-launch rumor content is discarded.
GTA6_LAUNCH_DATE = os.environ.get("GTA6_LAUNCH_DATE", "2025-10-01T00:00:00Z")
GTA6_LAUNCH_MODE = os.environ.get("GTA6_LAUNCH_MODE", "false").lower() in ("true", "1", "yes")

def is_post_launch() -> bool:
    """True if launch mode is explicitly enabled or today is past the release date."""
    if GTA6_LAUNCH_MODE:
        return True
    try:
        launch_dt = datetime.fromisoformat(GTA6_LAUNCH_DATE.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) >= launch_dt
    except Exception:
        return False

# ─── Keyword & English filter ─────────────────────────────────────────────────
GTA6_TITLE_REGEX = re.compile(
    r"\b(gta\s*6|gta\s*vi|gtavi|gta6|grand\s+theft\s+auto\s*(6|vi)|leonida|lucia|jason\s+gta|vice\s*city\s*online)\b",
    re.IGNORECASE,
)

REJECT_TOPIC_REGEX = re.compile(
    r"\b(minecraft|fortnite|roblox|valorant|warzone|call\s+of\s+duty|apex\s+legends|genshin|gta\s*sa|san\s+andreas|gta\s*iv|gta\s*4|gta\s*3|gta\s*iii)\b",
    re.IGNORECASE,
)

# Post-launch strict banlist: eliminate all pre-launch leaks, rumors, speculations, wishlists
POST_LAUNCH_REJECT_REGEX = re.compile(
    r"\b(leak|leaks|leaked|speculation|speculate|rumor|rumors|rumour|rumours|theory|theories|wishlist|concept\s*trailer|fan\s*trailer|trailer\s*breakdown|trailer\s*analysis|trailer\s*reaction|when\s*will\s*gta\s*6|release\s*date\s*rumor|what\s*to\s*expect|before\s*you\s*buy|countdown|delay\s*rumor|fake\s*leak)\b",
    re.IGNORECASE,
)

# User gameplay clips & cool moments keywords
GAMEPLAY_CLIP_REGEX = re.compile(
    r"\b(gameplay|clip|stunt|drift|pursuit|police\s*chase|wanted|busted|fails|funny\s*moments|insane|physics|easter\s*egg|secret|glitch|mod|speedrun|heist|rampage|custom|customization|killcam|highlight|clutch|shootout|free\s*roam)\b",
    re.IGNORECASE,
)

# Reject foreign alphabets (Cyrillic, Arabic, Hebrew, Devanagari, Thai, CJK, etc.)
FOREIGN_SCRIPT_REGEX = re.compile(
    r"[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]"
)

# Common non-English stop words & phrases (French, German, Spanish, Italian, Portuguese)
NON_ENGLISH_WORDS_REGEX = re.compile(
    r"\b(el|los|las|del|della|delle|degli|dei|des|les|du|dans|pour|avec|sur|par|neuer|und|oder|mit|auf|nach|ist|nicht|der|die|das|dem|den|einer|como|para|por|pero|mais|porque|jugar|juego|jogar|jogo|reacción|reaccion|análisis|analisis|reagiert|lebt|uhr|vidéo|jeu|jeux|palaver|meilleurs|graphismes|descargar|jugarlo|lanzamiento|reagisco|analizzo)\b",
    re.IGNORECASE,
)

def passes_filter(title: str, description: str = "", uploaded_at: Optional[str] = None) -> tuple[bool, str]:
    """
    Strict filter:
    1. Title must explicitly contain a GTA VI keyword.
    2. Must be English only (no foreign script, no foreign stopwords).
    3. Must not be about other games (GTA SA, GTA IV, Fortnite, etc.).
    4. Post-launch mode:
       - Strictly rejects obsolete leaks, rumors, wishlists, speculation, trailer breakdowns.
       - Discards any video uploaded prior to the official game release date.
    """
    if not title:
        return False, "missing title"

    # Require GTA 6 in the title
    if not GTA6_TITLE_REGEX.search(title):
        return False, "title does not reference GTA 6"

    # Reject non-English scripts
    if FOREIGN_SCRIPT_REGEX.search(title):
        return False, "non-English script detected"

    # Reject non-English stopwords in title
    if NON_ENGLISH_WORDS_REGEX.search(title):
        return False, "non-English language detected"

    # Reject other games / previous GTA titles if GTA 6 was not primary
    text = (title + " " + (description[:300] if description else "")).lower()
    if REJECT_TOPIC_REGEX.search(text):
        return False, "rejected non-GTA6 topic"

    # ── Post-Launch Gameplay Enforcement ──
    if is_post_launch():
        # Discard any obsolete leak/rumor/speculation keywords
        if POST_LAUNCH_REJECT_REGEX.search(text):
            return False, "obsolete pre-launch speculation or leak content"

        # Discard videos uploaded before the launch date cutoff
        if uploaded_at:
            try:
                up_dt = datetime.fromisoformat(uploaded_at.replace("Z", "+00:00"))
                launch_dt = datetime.fromisoformat(GTA6_LAUNCH_DATE.replace("Z", "+00:00"))
                if up_dt < launch_dt:
                    return False, f"uploaded before launch date ({uploaded_at} < {GTA6_LAUNCH_DATE})"
            except Exception:
                pass

    return True, "ok"

# ─── Duration bounds ──────────────────────────────────────────────────────────
MIN_DURATION_SEC = 15     # skip anything shorter (reaction thumbnails, etc.)
MAX_DURATION_SEC = 10800  # skip anything over 3 h (full streams; separate later)

def duration_ok(sec: Optional[int]) -> bool:
    if sec is None:
        return True   # unknown — let yt-dlp decide
    return MIN_DURATION_SEC <= sec <= MAX_DURATION_SEC

# ─── Stable ID ────────────────────────────────────────────────────────────────
def stable_id(canonical_url: str) -> str:
    h = hashlib.sha256(canonical_url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# ─── Supabase helpers ─────────────────────────────────────────────────────────
def sb_exists(canonical_url: str) -> bool:
    """True if the URL is already in video_catalog."""
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/video_catalog",
            headers=SB_HEADERS,
            params={"canonical_url": f"eq.{canonical_url}", "select": "id", "limit": "1"},
            timeout=10,
        )
        return r.status_code == 200 and len(r.json()) > 0
    except Exception:
        return False

def sb_upsert(row: dict) -> bool:
    """
    Upsert a row into video_catalog.
    Returns True on success.
    """
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/video_catalog",
            headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=row,
            timeout=15,
        )
        if r.status_code not in (200, 201):
            logging.getLogger("crawler.common").error("Supabase upsert failed %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:
        logging.getLogger("crawler.common").error("Supabase upsert exception: %s", e)
        return False

def make_row(
    *,
    canonical_url: str,
    platform: str,
    title: str,
    creator_name: str,
    creator_url: str = "",
    thumbnail_url: Optional[str] = None,
    manifest_url: Optional[str] = None,
    direct_mp4_url: Optional[str] = None,
    duration_sec: Optional[int] = None,
    view_count: Optional[int] = None,
    uploaded_at: Optional[str] = None,
    category: str = "gameplay",
    is_approved: bool = True,
) -> dict:
    """Build a video_catalog row dict ready for sb_upsert."""
    dur = None
    if duration_sec is not None:
        try:
            dur = int(float(duration_sec))
        except (ValueError, TypeError):
            dur = None

    views = None
    if view_count is not None:
        try:
            views = int(float(view_count))
        except (ValueError, TypeError):
            views = None

    return {
        "id":                    stable_id(canonical_url),
        "canonical_url":         canonical_url,
        "source_platform":       platform,
        "source_category":       category,
        "title":                 title or "GTA VI Clip",
        "creator_name":          creator_name or "Unknown",
        "creator_url":           creator_url or "",
        "thumbnail_url":         thumbnail_url,
        "manifest_url":          manifest_url,
        "direct_mp4_url":        direct_mp4_url,
        "duration_sec":          dur,
        "view_count":            views,
        "uploaded_at":           uploaded_at,
        "fetched_at":            datetime.now(timezone.utc).isoformat(),
        "manifest_refreshed_at": datetime.now(timezone.utc).isoformat(),
        "is_active":             True,
        "is_approved":           is_approved,
        "play_count":            0,
    }

# ─── yt-dlp manifest extraction ──────────────────────────────────────────────
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

YDL_OPTS: dict = {
    "skip_download": True,
    "quiet":         True,
    "no_warnings":   True,
    "socket_timeout": 20,
    "http_headers":  {"User-Agent": UA},
    # Don't error on geo-restricted — just skip
    "ignoreerrors":  True,
}

def extract(url: str, extra_opts: Optional[dict] = None) -> Optional[dict]:
    """
    Run yt-dlp on a video page URL.
    Returns a dict with keys: manifest_url, direct_mp4_url, title, uploader,
    uploader_url, thumbnail, duration_sec, view_count, upload_date (YYYYMMDD).
    Returns None on failure.
    """
    opts = {**YDL_OPTS, **(extra_opts or {})}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if not info:
            return None
    except Exception:
        return None

    formats  = info.get("formats", [])
    manifest = None
    mp4      = None

    # Best HLS
    hls = [f for f in formats if f.get("protocol") in ("m3u8", "m3u8_native") and f.get("url")]
    if hls:
        hls.sort(key=lambda f: f.get("height") or 0, reverse=True)
        manifest = hls[0]["url"]

    # Best MP4 fallback
    if not manifest:
        mp4s = [f for f in formats if f.get("ext") == "mp4" and f.get("url")]
        if mp4s:
            mp4s.sort(key=lambda f: f.get("height") or 0, reverse=True)
            mp4 = mp4s[0]["url"]

    if not manifest and not mp4:
        return None

    # Parse upload_date → ISO
    raw_date = info.get("upload_date", "")  # YYYYMMDD
    uploaded_at = None
    if raw_date and len(raw_date) == 8:
        uploaded_at = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}T00:00:00Z"

    return {
        "manifest_url":  manifest,
        "direct_mp4_url": mp4,
        "title":         info.get("title", ""),
        "uploader":      info.get("uploader", ""),
        "uploader_url":  info.get("uploader_url", ""),
        "thumbnail":     info.get("thumbnail", ""),
        "duration_sec":  info.get("duration"),
        "view_count":    info.get("view_count"),
        "uploaded_at":   uploaded_at,
    }

# ─── ISO 8601 duration → seconds ─────────────────────────────────────────────
def parse_iso_duration(iso: str) -> Optional[int]:
    if not iso:
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return None
    h, mn, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + s

# ─── Polite request helper ────────────────────────────────────────────────────
def get(url: str, **kwargs) -> Optional[requests.Response]:
    """GET with UA header set. Returns None on error."""
    try:
        r = requests.get(
            url,
            headers={"User-Agent": UA},
            timeout=kwargs.pop("timeout", 20),
            **kwargs,
        )
        r.raise_for_status()
        return r
    except Exception:
        return None
