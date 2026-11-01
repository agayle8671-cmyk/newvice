import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

// ─── Crowd Reaction Persistence API (/api/video/react) ───────────────────────
// Persists High-Beam Flashes (+1 high_beam_count, +5 viral_heat_score) to
// Supabase video_catalog when running in deterministic server-clock mode.

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit("video-react", ip, 30, 60))) {
      return NextResponse.json(
        { ok: false, error: "Too many reactions — cool your headlights for a moment." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const videoId = typeof body?.videoId === "string" ? body.videoId.trim().slice(0, 128) : "";
    const reaction = body?.reaction === "hazard" ? "hazard" : "high_beam";

    if (!videoId) {
      return NextResponse.json({ ok: false, error: "Missing videoId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: true, mode: "local" });
    }

    if (reaction === "high_beam") {
      const { data: row } = await supabase
        .from("video_catalog")
        .select("id, high_beam_count, viral_heat_score")
        .eq("id", videoId)
        .maybeSingle();

      if (row) {
        const nextBeams = (row.high_beam_count ?? 0) + 1;
        const nextHeat = (row.viral_heat_score ?? 0) + 5;
        await supabase
          .from("video_catalog")
          .update({
            high_beam_count: nextBeams,
            viral_heat_score: nextHeat,
          })
          .eq("id", videoId);

        return NextResponse.json({
          ok: true,
          videoId,
          highBeamCount: nextBeams,
          viralHeatScore: nextHeat,
        });
      }
    }

    return NextResponse.json({ ok: true, videoId });
  } catch (err) {
    console.error("[video-react] error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
