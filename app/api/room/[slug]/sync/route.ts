import { NextResponse } from "next/server";
import type { VideoItem, VideoCategory, VideoSource } from "@/lib/video/types";

// ─── Deterministic Server-Clock Room Coordinator ─────────────────────────────
// Computes CurrentClipOffset = ServerNow() - ClipStartTimestamp deterministically
// from the Unix epoch across the active catalog so every viewer worldwide sees
// the exact same frame even before Cloudflare PartyServer is configured.

const DEFAULT_CLIP_DURATION_SEC = 75;

function platformIcon(platform: string): string {
  const map: Record<string, string> = {
    kick: "🟩",
    rumble: "🟧",
    dailymotion: "🟦",
    peertube: "🐘",
    odyssee: "🔵",
    archive: "📦",
    reddit: "🟥",
    bilibili: "💙",
    vimeo: "🎞️",
    vk: "💬",
    nicovideo: "🇯🇵",
    medal: "🏅",
    streamable: "⚡",
    youtube: "▶️",
    community: "🎬",
    direct: "🎬",
  };
  return map[platform?.toLowerCase()] ?? "🎬";
}

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
    fetchedAt: new Date().toISOString(),
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl.startsWith("https://") || supabaseKey.length < 10) {
    return DEMO_FALLBACK;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: rows } = await supabase
      .from("video_catalog")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("id", { ascending: true })
      .limit(80);

    if (rows && rows.length > 0) {
      const items: VideoItem[] = rows
        .filter((r) => Boolean(r.direct_mp4_url || r.manifest_url || r.youtube_id))
        .map((row) => ({
          id: row.id,
          source: (row.source_platform || "direct") as VideoSource,
          manifestUrl: row.manifest_url ?? undefined,
          directMp4Url: row.direct_mp4_url ?? undefined,
          youtubeId: row.youtube_id ?? undefined,
          title: row.title,
          creatorName: row.creator_name || "Unknown",
          creatorUrl: row.creator_url ?? row.canonical_url ?? "",
          creatorAvatar: row.creator_avatar ?? undefined,
          platform: row.source_platform || "archive",
          platformIcon: platformIcon(row.source_platform),
          sourceUrl: row.canonical_url,
          thumbnail: row.thumbnail_url ?? undefined,
          durationSec:
            row.duration_sec && row.duration_sec > 5
              ? Math.min(row.duration_sec, 1800)
              : DEFAULT_CLIP_DURATION_SEC,
          category: (row.source_category || "gameplay") as VideoCategory,
          viewCount: row.view_count ?? undefined,
          scoutName: row.scout_name ?? undefined,
          viralHeatScore: row.viral_heat_score ?? undefined,
          highBeamCount: row.high_beam_count ?? undefined,
          perceptualHash: row.perceptual_hash ?? undefined,
          fetchedAt: row.fetched_at,
          playCount: row.play_count ?? 0,
        }));

      if (items.length > 0) {
        cachedPlaylist = items;
        cachedAtMs = now;
        return items;
      }
    }
  } catch (err) {
    console.error("[room-sync] catalog load error:", err);
  }

  return DEMO_FALLBACK;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const roomSlug = slug || "main";
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
