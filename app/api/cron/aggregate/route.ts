import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Daily Vercel Cron tick (see vercel.json). Retires long-running stale clips and
// kicks off a lightweight crawl on the bound Python service. The full 20-platform
// crawl + perceptual dedup runs in the GitHub Actions worker (crawler-worker.yml).

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
      message: "Supabase service role not configured — aggregator skipped.",
    });
  }

  try {
    // Retire stale, heavily-played clips (>30 days old, 10+ plays)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: retired, error: retireError } = await supabase
      .from("video_catalog")
      .update({ is_active: false })
      .lt("fetched_at", thirtyDaysAgo)
      .gte("play_count", 10)
      .eq("is_active", true)
      .select("id");

    if (retireError) throw retireError;
    const deactivated = retired?.length ?? 0;

    let dispatched = false;
    let dispatchError: string | null = null;
    const crawlerBaseUrl = process.env.CRAWLER_SERVICE_URL;
    if (crawlerBaseUrl) {
      try {
        const crawlUrl = new URL("crawl", crawlerBaseUrl.endsWith("/") ? crawlerBaseUrl : `${crawlerBaseUrl}/`);
        const res = await fetch(crawlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platforms: ["archive", "peertube"] }),
          signal: AbortSignal.timeout(50_000),
        });
        dispatched = res.ok;
        if (!res.ok) dispatchError = `crawler responded ${res.status}`;
      } catch (err) {
        dispatchError = String(err);
        console.error("[aggregate-cron] crawler dispatch error:", err);
      }
    }

    await supabase.from("aggregator_runs").insert({
      run_at: new Date().toISOString(),
      sources_crawled: dispatched ? 2 : 0,
      videos_found: 0,
      videos_added: 0,
      videos_rejected: deactivated,
      error_log: dispatchError,
    });

    return NextResponse.json({
      ok: true,
      message: "Cron tick complete",
      deactivated,
      crawlerDispatched: dispatched,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
