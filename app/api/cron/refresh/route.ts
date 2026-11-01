import { NextResponse } from "next/server";

// ─── Manifest Refresh Cron ─────────────────────────────────────────────────────
// Runs every 90 minutes via Vercel Cron.
// Finds video_catalog rows whose manifest URLs are close to expiring
// (manifest_refreshed_at older than 90 min) and calls yt-dlp via the
// Python sidecar (or direct exec if available) to refresh them.
//
// On Vercel Edge, we can't shell out — so instead this route calls
// the /api/cron/refresh/worker endpoint via a background fetch,
// OR signals a Cloud Run / Fly.io sidecar if CRAWLER_WEBHOOK_URL is set.
//
// vercel.json cron: "*/90 * * * *"

export async function GET(request: Request) {
  // Auth check
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
      message: "Demo mode — manifest refresh skipped.",
    });
  }

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabaseClient();

    // Find videos that haven't had their manifest refreshed in the last 90 min
    // and have a manifest_url that could expire (HLS/DASH streams)
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    const { data: stale, error } = await supabase
      .from("video_catalog")
      .select("id, canonical_url, source_platform, manifest_url")
      .eq("is_active", true)
      .eq("is_approved", true)
      .not("manifest_url", "is", null)
      .lt("manifest_refreshed_at", ninetyMinAgo)
      .order("manifest_refreshed_at", { ascending: true })
      .limit(20); // process in batches of 20

    if (error) throw error;

    if (!stale || stale.length === 0) {
      return NextResponse.json({ ok: true, refreshed: 0, message: "All manifests fresh." });
    }

    // Check for Vercel service binding first, fallback to CRAWLER_WEBHOOK_URL
    const crawlerBaseUrl = process.env.CRAWLER_SERVICE_URL || process.env.CRAWLER_WEBHOOK_URL;
    if (crawlerBaseUrl) {
      const ids = stale.map((r: { id: string }) => r.id);
      const refreshUrl = new URL("refresh", crawlerBaseUrl.endsWith("/") ? crawlerBaseUrl : `${crawlerBaseUrl}/`);
      await fetch(refreshUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRAWLER_WEBHOOK_SECRET ?? ""}`,
        },
        body: JSON.stringify({ video_ids: ids }),
      });

      return NextResponse.json({
        ok: true,
        dispatched: ids.length,
        message: `Dispatched ${ids.length} IDs to crawler service.`,
      });
    }

    // No webhook — mark them for crawler to pick up on next run
    // (Python crawler checks manifest_refreshed_at < NOW() - 90min)
    return NextResponse.json({
      ok: true,
      stale: stale.length,
      message: `Found ${stale.length} stale manifests. Set CRAWLER_WEBHOOK_URL to auto-refresh.`,
    });
  } catch (err) {
    console.error("[refresh-cron] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
