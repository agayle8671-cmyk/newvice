"""
supabase_setup.py — One-shot Supabase initialisation for LeonidaVice
=====================================================================
Run this ONCE after creating your Supabase project.

What it does:
  1. Tests your credentials
  2. Prints the SQL schema to apply (you paste it into the Supabase SQL editor)
  3. Seeds demo rows so the player has something to show immediately

Usage:
  python -m crawler.supabase_setup

Env vars needed:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import requests
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

# ─── Demo seed rows ───────────────────────────────────────────────────────────
import hashlib

def stable_id(url: str) -> str:
    h = hashlib.sha256(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

NOW = datetime.now(timezone.utc).isoformat()

SEED_ROWS = [
    {
        "id":                    stable_id("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"),
        "canonical_url":         "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "source_platform":       "direct",
        "source_category":       "gameplay",
        "title":                 "GTA VI — Live Feed (Warming Up)",
        "creator_name":          "LeonidaVice",
        "creator_url":           "https://leonidavice.com",
        "manifest_url":          "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "duration_sec":          596,
        "fetched_at":            NOW,
        "manifest_refreshed_at": NOW,
        "is_active":             True,
        "is_approved":           True,
        "play_count":            0,
    },
    {
        "id":                    stable_id("https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8"),
        "canonical_url":         "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
        "source_platform":       "direct",
        "source_category":       "gameplay",
        "title":                 "GTA VI — Clip Feed (Slot 2)",
        "creator_name":          "LeonidaVice",
        "creator_url":           "https://leonidavice.com",
        "manifest_url":          "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
        "duration_sec":          120,
        "fetched_at":            NOW,
        "manifest_refreshed_at": NOW,
        "is_active":             True,
        "is_approved":           True,
        "play_count":            0,
    },
]

def check_creds():
    print("\n[1/4] Checking credentials...")
    if not SUPABASE_URL.startswith("https://") or not SUPABASE_KEY:
        print("✗  Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)
    print(f"  URL: {SUPABASE_URL}")
    print("  KEY: ****" + SUPABASE_KEY[-6:])
    print("✓  Credentials found")

def ping_supabase():
    print("\n[2/4] Pinging Supabase REST API...")
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/",
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code in (200, 404):
            print("✓  Supabase reachable")
            return True
        else:
            print(f"✗  Unexpected status: {r.status_code}")
            return False
    except Exception as e:
        print(f"✗  Cannot reach Supabase: {e}")
        return False

def print_schema():
    print("\n[3/4] Schema SQL to apply...")
    schema_path = Path(__file__).parent.parent / "supabase" / "video_schema.sql"
    if schema_path.exists():
        print(f"\n{'─'*60}")
        print("Paste this into the Supabase SQL Editor and run it:")
        print(f"  Dashboard → SQL Editor → New query → paste → Run")
        print(f"{'─'*60}\n")
        print(schema_path.read_text())
        print(f"{'─'*60}")
    else:
        print(f"  Schema file not found at {schema_path}")
        print("  Run the SQL in supabase/video_schema.sql manually in your Supabase dashboard.")

def seed_rows():
    print("\n[4/4] Seeding demo rows into video_catalog...")
    # Check if table exists first
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/video_catalog",
        headers=HEADERS,
        params={"limit": "1"},
        timeout=10,
    )
    if r.status_code == 404 or (r.status_code == 200 and "does not exist" in r.text.lower()):
        print("  ✗ video_catalog table not found.")
        print("  Apply the schema SQL first (step 3), then re-run this script.")
        return

    for row in SEED_ROWS:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/video_catalog",
            headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=row,
            timeout=15,
        )
        status = "✓" if resp.status_code in (200, 201) else "✗"
        print(f"  {status} Seed: {row['title'][:60]}  (HTTP {resp.status_code})")

    print("\n✓  Setup complete! Your player will now show demo content.")
    print("   Run the crawlers to populate real GTA VI clips:")
    print("   python -m crawler.run_all\n")

def main():
    print("=" * 60)
    print("  LeonidaVice — Supabase Setup")
    print("=" * 60)
    check_creds()
    if not ping_supabase():
        sys.exit(1)
    print_schema()
    input("\nPress ENTER after you have applied the schema SQL in Supabase dashboard...")
    seed_rows()

if __name__ == "__main__":
    main()
