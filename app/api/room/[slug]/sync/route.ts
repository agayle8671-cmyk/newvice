import { NextResponse } from "next/server";
import type { VideoItem } from "@/lib/video/types";
import {
  DEFAULT_CLIP_DURATION_SEC,
  filterCatalogRows,
  getCatalogRevision,
  getForcedBroadcastClip,
  rowToVideoItem,
  type CatalogRow,
} from "@/lib/video/catalog";
import { getSupabaseReader } from "@/lib/supabase/admin";

// ─── Deterministic Server-Clock Room Coordinator ─────────────────────────────
// Serves only real scraped clips from Supabase video_catalog (zero demo streams).

function hashRoomOffset(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return slug === "main" || slug === "main-theater" ? 0 : (h % 3600) * 1000;
}

// Short in-memory catalog cache (15s) to prevent hammering Supabase on concurrent sync checks
let cachedPlaylist: VideoItem[] | null = null;
let cachedAtMs = 0;
let cachedRevision = -1;

async function getActivePlaylist(): Promise<VideoItem[]> {
  const now = Date.now();
  const rev = getCatalogRevision();
  if (
    cachedPlaylist &&
    cachedPlaylist.length > 0 &&
    now - cachedAtMs < 15_000 &&
    cachedRevision === rev
  ) {
    return cachedPlaylist;
  }

  const supabase = getSupabaseReader();
  if (!supabase) return [];

  try {
    const { data: rows, error } = await supabase
      .from("video_catalog")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .neq("source_platform", "direct")
      .not("id", "like", "demo-%")
      .order("play_count", { ascending: true })
      .limit(200);

    if (error) throw error;

    const eligible = filterCatalogRows((rows ?? []) as CatalogRow[], {
      GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
      GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
    });

    if (eligible.length > 0) {
      const items = eligible.map((row) => {
        const item = rowToVideoItem(row);
        return { ...item, durationSec: item.durationSec ?? DEFAULT_CLIP_DURATION_SEC };
      });
      cachedPlaylist = items;
      cachedAtMs = now;
      cachedRevision = rev;
      return items;
    }
  } catch (err) {
    console.error("[room-sync] catalog load error:", err);
    if (cachedPlaylist && cachedPlaylist.length > 0) return cachedPlaylist;
  }

  return [];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const roomSlug = (slug || "main-theater").slice(0, 64);
  const playlist = await getActivePlaylist();
  const serverNow = Date.now();

  if (playlist.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        roomSlug,
        serverNow,
        current: null,
        next: null,
        clipStartTimestamp: serverNow,
        currentOffsetMs: 0,
      },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // If the admin forced/pinned a clip in /admin, play it immediately across the broadcast!
  const forced = getForcedBroadcastClip(serverNow);
  if (forced) {
    const forcedIdx = playlist.findIndex((it) => it.id === forced.videoId);
    if (forcedIdx >= 0) {
      const current = playlist[forcedIdx];
      const next = playlist[(forcedIdx + 1) % playlist.length] ?? null;
      const currentOffsetMs = Math.max(0, serverNow - forced.startedAtMs);
      return NextResponse.json(
        {
          ok: true,
          roomSlug,
          serverNow,
          current,
          next,
          clipStartTimestamp: forced.startedAtMs,
          currentOffsetMs,
          adminPinned: true,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
  }

  const durationsMs = playlist.map(
    (item) => Math.max(12, Math.min(item.durationSec || DEFAULT_CLIP_DURATION_SEC, 300)) * 1000
  );
  const totalCycleMs = durationsMs.reduce((acc, d) => acc + d, 0);

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
