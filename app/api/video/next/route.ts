import { NextResponse } from "next/server";
import type { VideoItem, NextStreamResponse } from "@/lib/video/types";
import { filterCatalogRows, rowToVideoItem, type CatalogRow } from "@/lib/video/catalog";
import { getSupabaseAdmin, getSupabaseReader } from "@/lib/supabase/admin";

// ─── Demo queue ───────────────────────────────────────────────────────────────
// Used when Supabase isn't configured or the catalog has no eligible clips.
const DEMO_QUEUE: VideoItem[] = [
  {
    id: "demo-001",
    source: "direct",
    // Public Mux test HLS — specifically maintained for hls.js testing, CORS-open
    manifestUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    title: "GTA VI — Live Clip Feed (Warming Up)",
    creatorName: "LeonidaVice",
    creatorUrl: "https://leonidavice.com",
    platform: "Live Feed",
    platformIcon: "📡",
    sourceUrl: "https://leonidavice.com",
    durationSec: 596,
    category: "gameplay",
    fetchedAt: new Date(0).toISOString(),
    playCount: 0,
  },
];

let demoIndex = 0;

function demoResponse() {
  const item = DEMO_QUEUE[demoIndex % DEMO_QUEUE.length];
  demoIndex++;
  const response: NextStreamResponse = { ok: true, item };
  return NextResponse.json(response);
}

const CANDIDATE_BATCH = 25;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = (searchParams.get("session") ?? "anon").slice(0, 80);

  const reader = getSupabaseReader();
  if (!reader) return demoResponse();
  const admin = getSupabaseAdmin();

  try {
    const launchEnv = {
      GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
      GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
    };

    // Bounded loop (no unbounded recursion): at most one session-history reset.
    for (let pass = 0; pass < 2; pass++) {
      const { data: played } = await reader
        .from("video_session_plays")
        .select("video_id")
        .eq("session_id", sessionId)
        .order("played_at", { ascending: false })
        .limit(50);

      const playedIds = (played ?? []).map((r: { video_id: string }) => r.video_id);

      let query = reader
        .from("video_catalog")
        .select("*")
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("play_count", { ascending: true })
        .limit(CANDIDATE_BATCH);

      if (playedIds.length > 0) {
        const quoted = playedIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
        query = query.not("id", "in", `(${quoted})`);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // English-only + Launch-Day gate applied at read time (no destructive side effects)
      const eligible = filterCatalogRows((rows ?? []) as CatalogRow[], launchEnv);
      const row = eligible[0];

      if (!row) {
        // Queue exhausted for this session → reset history once and retry
        if (pass === 0 && playedIds.length > 0 && admin) {
          await admin.from("video_session_plays").delete().eq("session_id", sessionId);
          continue;
        }
        break;
      }

      // Record play (best-effort, never blocks playback)
      if (admin) {
        void Promise.all([
          admin.from("video_session_plays").upsert({
            session_id: sessionId,
            video_id: row.id,
            played_at: new Date().toISOString(),
          }),
          admin
            .from("video_catalog")
            .update({ play_count: (row.play_count ?? 0) + 1, last_played: new Date().toISOString() })
            .eq("id", row.id),
        ]).catch(() => {});
      }

      const response: NextStreamResponse = { ok: true, item: rowToVideoItem(row) };
      return NextResponse.json(response);
    }
  } catch (err) {
    console.error("[next-stream] live mode error:", err);
  }

  return demoResponse();
}
