import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─── Manifest Refresh Cron ─────────────────────────────────────────────────────
// Daily via Vercel Cron (Hobby plan limit). Finds video_catalog rows whose HLS
// manifest URLs are stale (manifest_refreshed_at older than 90 min) and asks the
// bound Python crawler service to re-resolve them via yt-dlp.

export async function GET(request: Request) {
  // Opt this handler out of build-time prerendering (cacheComponents) — it must run per request.
  await connection();

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      message: "Supabase service role not configured — manifest refresh skipped.",
    });
  }

  try {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    const { data: stale, error } = await supabase
      .from("video_catalog")
      .select("id")
      .eq("is_active", true)
      .eq("is_approved", true)
      .not("manifest_url", "is", null)
      .lt("manifest_refreshed_at", ninetyMinAgo)
      .order("manifest_refreshed_at", { ascending: true })
      .limit(20);

    if (error) throw error;

    if (!stale || stale.length === 0) {
      return NextResponse.json({ ok: true, refreshed: 0, message: "All manifests fresh." });
    }

    const crawlerBaseUrl = process.env.CRAWLER_SERVICE_URL || process.env.CRAWLER_WEBHOOK_URL;
    if (!crawlerBaseUrl) {
      return NextResponse.json({
        ok: true,
        stale: stale.length,
        message: `Found ${stale.length} stale manifests. Bind the crawler service (CRAWLER_SERVICE_URL) to auto-refresh.`,
      });
    }

    const ids = stale.map((r: { id: string }) => r.id);
    const refreshUrl = new URL("refresh", crawlerBaseUrl.endsWith("/") ? crawlerBaseUrl : `${crawlerBaseUrl}/`);
    const res = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CRAWLER_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${process.env.CRAWLER_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify({ video_ids: ids }),
      signal: AbortSignal.timeout(50_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Crawler service responded ${res.status}`, dispatched: 0 },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      dispatched: ids.length,
      message: `Dispatched ${ids.length} IDs to crawler service.`,
    });
  } catch (err) {
    console.error("[refresh-cron] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
