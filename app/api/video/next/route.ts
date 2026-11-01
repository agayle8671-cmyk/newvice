import { NextResponse } from "next/server";
import type { NextStreamResponse } from "@/lib/video/types";
import { filterCatalogRows, rowToVideoItem, type CatalogRow } from "@/lib/video/catalog";
import { getSupabaseAdmin, getSupabaseReader } from "@/lib/supabase/admin";

// ─── Real Scraped Clip Queue (/api/video/next) ───────────────────────────────
// Serves only real scraped clips (and approved community clips) from Supabase
// video_catalog. Demo/placeholder streams are never returned.

const CANDIDATE_LIMIT = 150;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = (searchParams.get("session") ?? "anon").slice(0, 80);

  const reader = getSupabaseReader();
  if (!reader) {
    return NextResponse.json(
      { ok: false, item: null, error: "Supabase not configured" } satisfies NextStreamResponse,
      { status: 503 }
    );
  }
  const admin = getSupabaseAdmin();
  const dbWriter = admin ?? reader;

  try {
    const launchEnv = {
      GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
      GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
    };

    // 1. Fetch recently played clip IDs for this viewer session
    const { data: played } = await reader
      .from("video_session_plays")
      .select("video_id")
      .eq("session_id", sessionId)
      .order("played_at", { ascending: false })
      .limit(100);

    const playedSet = new Set(
      (played ?? []).map((r: { video_id: string }) => r.video_id)
    );

    // 2. Fetch active, approved real scraped clips ordered by play_count ascending
    const { data: rows, error } = await reader
      .from("video_catalog")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .neq("source_platform", "direct")
      .not("id", "like", "demo-%")
      .order("play_count", { ascending: true })
      .limit(CANDIDATE_LIMIT);

    if (error) throw error;

    // 3. Apply English-only + Demo rejection + Launch-Day filter
    const eligible = filterCatalogRows((rows ?? []) as CatalogRow[], launchEnv);

    if (eligible.length === 0) {
      return NextResponse.json(
        { ok: false, item: null, error: "No eligible scraped clips in catalog" } satisfies NextStreamResponse,
        { status: 404 }
      );
    }

    // 4. Pick the first eligible clip not yet played in this session
    let chosen = eligible.find((r) => !playedSet.has(r.id));

    // If the viewer has already watched every clip in the catalog, reset their session history and cycle cleanly
    if (!chosen) {
      chosen = eligible[0];
      void dbWriter
        .from("video_session_plays")
        .delete()
        .eq("session_id", sessionId)
        .then(
          () => {},
          () => {}
        );
    }

    // 5. Record play (best-effort, non-blocking)
    void Promise.all([
      dbWriter.from("video_session_plays").upsert({
        session_id: sessionId,
        video_id: chosen.id,
        played_at: new Date().toISOString(),
      }),
      dbWriter
        .from("video_catalog")
        .update({
          play_count: (chosen.play_count ?? 0) + 1,
          last_played: new Date().toISOString(),
        })
        .eq("id", chosen.id),
    ]).catch(() => {});

    const response: NextStreamResponse = {
      ok: true,
      item: rowToVideoItem(chosen),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[next-stream] live mode error:", err);
    return NextResponse.json(
      { ok: false, item: null, error: "Failed to load clip from catalog" } satisfies NextStreamResponse,
      { status: 500 }
    );
  }
}
