import { NextResponse } from "next/server";

// Vercel Cron calls this every 4 hours.
// Add to vercel.json:
//   "crons": [{ "path": "/api/cron/aggregate", "schedule": "0 */4 * * *" }]

export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isLive = supabaseUrl.startsWith("https://") && supabaseKey.length > 10;

  if (!isLive) {
    return NextResponse.json({
      ok: false,
      message: "Demo mode — no Supabase. Aggregator skipped.",
    });
  }

  // The Python crawler is the primary ingestion engine.
  // This route handles two things:
  //   1. Marking stale videos (>30 days old, played 10+ times) as inactive
  //   2. Logging that a cron tick occurred
  //
  // The actual crawling happens in the Python sidecar (crawler/main.py).
  // Point the Python cron at Supabase directly using the service role key.

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabaseClient();

    // Deactivate stale videos
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    await supabase
      .from("video_catalog")
      .update({ is_active: false })
      .lt("fetched_at", thirtyDaysAgo)
      .gte("play_count", 10)
      .eq("is_active", true);

    const deactivated = 0; // count not needed for logging

    // Log run
    await supabase.from("aggregator_runs").insert({
      run_at: new Date().toISOString(),
      sources_crawled: 0,   // Python crawler updates this directly
      videos_found: 0,
      videos_added: 0,
      videos_rejected: 0,
      error_log: null,
    });

    return NextResponse.json({
      ok: true,
      message: "Cron tick complete",
      deactivated: deactivated ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
