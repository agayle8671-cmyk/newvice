import { NextResponse } from "next/server";
import type { VideoItem, NextStreamResponse } from "@/lib/video/types";

// ─── Demo queue ───────────────────────────────────────────────────────────────
// Used when no Supabase creds are present.
// Uses public HLS test streams so the custom player works end-to-end
// before real crawled clips are in the DB.
// Swap these out for real yt-dlp resolved manifests once crawler is running.
const DEMO_QUEUE: VideoItem[] = [
  {
    id: "demo-001",
    source: "direct",
    // Public Mux test HLS — specifically maintained for hls.js testing, CORS-open
    manifestUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    directMp4Url: undefined,
    youtubeId: undefined,
    title: "GTA VI — Live Clip Feed (Warming Up)",
    creatorName: "LeonidaVice",
    creatorUrl: "https://leonidavice.com",
    creatorAvatar: undefined,
    platform: "Live Feed",
    platformIcon: "📡",
    sourceUrl: "https://leonidavice.com",
    thumbnail: undefined,
    durationSec: 596,
    category: "gameplay",
    fetchedAt: new Date().toISOString(),
    playCount: 0,
  },
  {
    id: "demo-002",
    source: "direct",
    // Akamai Big Buck Bunny HLS — H.264, multi-bitrate, CORS-open
    manifestUrl: "https://multiplatform-f.akamaihd.net/i/multi/will/bunny/big_buck_bunny_,640x360_400,640x360_700,640x360_1000,950x540_1500,.f4v.csmil/master.m3u8",
    directMp4Url: undefined,
    youtubeId: undefined,
    title: "GTA VI — Clip Feed (Slot 2)",
    creatorName: "LeonidaVice",
    creatorUrl: "https://leonidavice.com",
    creatorAvatar: undefined,
    platform: "Live Feed",
    platformIcon: "📡",
    sourceUrl: "https://leonidavice.com",
    thumbnail: undefined,
    durationSec: 596,
    category: "gameplay",
    fetchedAt: new Date().toISOString(),
    playCount: 0,
  },
];

// Pointer for demo round-robin
let demoIndex = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session") ?? "anon";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isLive =
    supabaseUrl.startsWith("https://") && supabaseKey.length > 10;

  // ── LIVE MODE ──────────────────────────────────────────────────────────────
  if (isLive) {
    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server");
      const supabase = await createServerSupabaseClient();

      // Get videos not recently played by this session, oldest-played first
      const { data: played } = await supabase
        .from("video_session_plays")
        .select("video_id")
        .eq("session_id", sessionId)
        .order("played_at", { ascending: false })
        .limit(50);

      const playedIds = (played ?? []).map((r: { video_id: string }) => r.video_id);

      let query = supabase
        .from("video_catalog")
        .select("*")
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("play_count", { ascending: true })
        .limit(1);

      if (playedIds.length > 0) {
        query = query.not("id", "in", `(${playedIds.join(",")})`);
      }

      const { data: rows, error } = await query;

      if (error) throw error;

      const row = rows?.[0];
      if (!row) {
        // Queue exhausted — reset session history and try again
        await supabase
          .from("video_session_plays")
          .delete()
          .eq("session_id", sessionId);

        return GET(request); // retry once
      }

      // Safeguard: English only
      if (!isEnglishTitle(row.title)) {
        await supabase
          .from("video_catalog")
          .update({ is_active: false, is_approved: false })
          .eq("id", row.id);
        return GET(request); // fetch next English video
      }

      // Safeguard: Launch Day / Post-Launch mode
      // Drops obsolete pre-launch speculation, leaks, and trailer breakdowns
      if (isPostLaunchMode()) {
        const isObsolete = POST_LAUNCH_REJECT_REGEX.test(row.title) ||
          (row.uploaded_at && new Date(row.uploaded_at).getTime() < new Date(process.env.GTA6_LAUNCH_DATE || "2025-10-01T00:00:00Z").getTime());
        if (isObsolete) {
          await supabase
            .from("video_catalog")
            .update({ is_active: false, source_category: "pre_launch_archive" })
            .eq("id", row.id);
          return GET(request); // fetch next active gameplay video
        }
      }

      // Record play
      await supabase.from("video_session_plays").upsert({
        session_id: sessionId,
        video_id: row.id,
        played_at: new Date().toISOString(),
      });

      // Increment play count
      await supabase
        .from("video_catalog")
        .update({ play_count: (row.play_count ?? 0) + 1 })
        .eq("id", row.id);

      const item: VideoItem = {
        id: row.id,
        source: row.source_platform,
        manifestUrl: row.manifest_url ?? undefined,
        directMp4Url: row.direct_mp4_url ?? undefined,
        youtubeId: row.youtube_id ?? undefined,
        title: row.title,
        creatorName: row.creator_name,
        creatorUrl: row.creator_url ?? "",
        creatorAvatar: row.creator_avatar ?? undefined,
        platform: row.source_platform,
        platformIcon: platformIcon(row.source_platform),
        sourceUrl: row.canonical_url,
        thumbnail: row.thumbnail_url ?? undefined,
        durationSec: row.duration_sec ?? undefined,
        category: row.source_category ?? "unknown",
        viewCount: row.view_count ?? undefined,
        fetchedAt: row.fetched_at,
        playCount: row.play_count ?? 0,
      };

      const response: NextStreamResponse = { ok: true, item };
      return NextResponse.json(response);
    } catch (err) {
      console.error("[next-stream] live mode error:", err);
      // Fall through to demo mode
    }
  }

  // ── DEMO MODE ──────────────────────────────────────────────────────────────
  const item = DEMO_QUEUE[demoIndex % DEMO_QUEUE.length];
  demoIndex++;

  const response: NextStreamResponse = { ok: true, item };
  return NextResponse.json(response);
}

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
    bilibili_tv: "💙",
    vimeo: "🎞️",
    vk: "💬",
    nicovideo: "🇯🇵",
    medal: "🏅",
    youtube: "▶️",
    moddb: "🎮",
    modsites: "🎮",
    direct: "🎬",
  };
  return map[platform?.toLowerCase()] ?? "🎬";
}

function isEnglishTitle(title: string): boolean {
  if (!title) return false;
  // Non-English alphabets/scripts (Cyrillic, Arabic, Hebrew, Devanagari, Thai, CJK, etc.)
  if (/[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(title)) return false;
  // Non-English stop words & phrases (French, German, Spanish, Italian, Portuguese)
  if (/\b(el|los|las|del|della|delle|degli|dei|des|les|du|dans|pour|avec|sur|par|neuer|und|oder|mit|auf|nach|ist|nicht|der|die|das|dem|den|einer|como|para|por|pero|mais|porque|jugar|juego|jogar|jogo|reacción|reaccion|análisis|analisis|reagiert|lebt|uhr|vidéo|jeu|jeux|palaver|meilleurs|graphismes|descargar|jugarlo|lanzamiento|reagisco|analizzo)\b/i.test(title)) {
    return false;
  }
  return true;
}

const POST_LAUNCH_REJECT_REGEX = /\b(leak|leaks|leaked|speculation|speculate|rumor|rumors|rumour|rumours|theory|theories|wishlist|concept\s*trailer|fan\s*trailer|trailer\s*breakdown|trailer\s*analysis|trailer\s*reaction|when\s*will\s*gta\s*6|release\s*date\s*rumor|what\s*to\s*expect|before\s*you\s*buy|countdown|delay\s*rumor|fake\s*leak)\b/i;

function isPostLaunchMode(): boolean {
  if (process.env.GTA6_LAUNCH_MODE === "true") return true;
  const launchDateStr = process.env.GTA6_LAUNCH_DATE;
  if (!launchDateStr) return false;
  try {
    return Date.now() >= new Date(launchDateStr).getTime();
  } catch {
    return false;
  }
}
