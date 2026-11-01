import { NextResponse } from "next/server";
import type { VideoItem } from "@/lib/video/types";
import {
  DEFAULT_CLIP_DURATION_SEC,
  filterCatalogRows,
  rowToVideoItem,
  type CatalogRow,
} from "@/lib/video/catalog";
import { getSupabaseReader } from "@/lib/supabase/admin";
import { getViceNightlyState, scoreClipForBlock } from "@/lib/schedule/vice-nightly";

// ─── Deterministic Server-Clock Room Coordinator ─────────────────────────────
// Computes CurrentClipOffset = ServerNow() - ClipStartTimestamp deterministically
// from the Unix epoch across the active catalog so every viewer worldwide sees
// the exact same frame even before Cloudflare PartyServer is configured.
//
// The shared catalog gate (English-only + Launch-Day post-launch filter) is applied
// here too, so leaks/speculation/pre-launch uploads can never reach the screen
// once the game is out.

function hashRoomOffset(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return slug === "main" || slug === "main-theater" ? 0 : (h % 3600) * 1000;
}

const DEMO_FALLBACK: VideoItem[] = [
  {
    id: "demo-001",
    source: "direct",
    manifestUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    title: "GTA VI — Leonida Vice Broadcast Feed",
    creatorName: "LeonidaVice",
    creatorUrl: "https://leonidavice.com",
    platform: "direct",
    platformIcon: "📡",
    sourceUrl: "https://leonidavice.com",
    durationSec: 120,
    category: "gameplay",
    fetchedAt: new Date(0).toISOString(),
    playCount: 0,
  },
];

// Short in-memory catalog cache (15s) to prevent hammering Supabase on concurrent sync checks
let cachedPlaylist: VideoItem[] | null = null;
let cachedAtMs = 0;

async function getActivePlaylist(): Promise<VideoItem[]> {
  const now = Date.now();
  if (cachedPlaylist && cachedPlaylist.length > 0 && now - cachedAtMs < 15_000) {
    return cachedPlaylist;
  }

  const supabase = getSupabaseReader();
  if (!supabase) return DEMO_FALLBACK;

  try {
    const { data: rows, error } = await supabase
      .from("video_catalog")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("id", { ascending: true })
      .limit(200);

    if (error) throw error;

    const eligible = filterCatalogRows((rows ?? []) as CatalogRow[], {
      GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
      GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
    });

    if (eligible.length > 0) {
      const { currentBlock } = getViceNightlyState(now);
      const items = eligible
        .map((row) => {
          const item = rowToVideoItem(row);
          return { ...item, durationSec: item.durationSec ?? DEFAULT_CLIP_DURATION_SEC };
        })
        .sort((a, b) => {
          const scoreDiff = scoreClipForBlock(b, currentBlock) - scoreClipForBlock(a, currentBlock);
          if (scoreDiff !== 0) return scoreDiff;
          return a.id.localeCompare(b.id);
        });
      cachedPlaylist = items;
      cachedAtMs = now;
      return items;
    }
  } catch (err) {
    console.error("[room-sync] catalog load error:", err);
    // Serve stale cache rather than flapping to demo content on a transient DB error
    if (cachedPlaylist && cachedPlaylist.length > 0) return cachedPlaylist;
  }

  return DEMO_FALLBACK;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const roomSlug = (slug || "main-theater").slice(0, 64);
  const playlist = await getActivePlaylist();
  const serverNow = Date.now();

  const durationsMs = playlist.map(
    (item) => Math.max(12, Math.min(item.durationSec || DEFAULT_CLIP_DURATION_SEC, 1800)) * 1000
  );
  const totalCycleMs = durationsMs.reduce((acc, d) => acc + d, 0);

  // Deterministic position inside the global cycle (different rooms get deterministic phase shift)
  const shiftedNow = serverNow + hashRoomOffset(roomSlug);
  const posInCycleMs = shiftedNow % totalCycleMs;

  let accMs = 0;
  let currentIndex = 0;
  for (let i = 0; i < durationsMs.length; i++) {
    if (posInCycleMs < accMs + durationsMs[i]) {
      currentIndex = i;
      break;
    }
    accMs += durationsMs[i];
  }

  const currentOffsetMs = posInCycleMs - accMs;
  const clipStartTimestamp = serverNow - currentOffsetMs;
  const current = playlist[currentIndex] ?? null;
  const next = playlist[(currentIndex + 1) % playlist.length] ?? null;

  return NextResponse.json(
    {
      ok: true,
      roomSlug,
      serverNow,
      current,
      next,
      clipStartTimestamp,
      currentOffsetMs,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
