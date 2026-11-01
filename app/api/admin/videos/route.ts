import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "child_process";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";
import { getSupabaseAdmin, getSupabaseReader } from "@/lib/supabase/admin";
import {
  bumpCatalogRevision,
  filterCatalogRows,
  getForcedBroadcastClip,
  isEnglishTitle,
  setForcedBroadcastClip,
  type CatalogRow,
} from "@/lib/video/catalog";

export interface AdminVideoCatalogRow extends CatalogRow {
  is_active?: boolean;
  is_approved?: boolean;
  manifest_refreshed_at?: string | null;
  eligibleForBroadcast?: boolean;
}

export interface AggregatorRunRow {
  id?: string | number;
  run_at: string;
  sources_crawled: number;
  videos_found: number;
  videos_added: number;
  videos_rejected: number;
  error_log?: string | null;
}

const GTA6_KEYWORD_REGEX =
  /\b(gta\s*6|gta\s*vi|grand\s*theft\s*auto\s*6|grand\s*theft\s*auto\s*vi|leonida|vice\s*city|lucia|jason\s*duval)\b/i;
const REJECT_CLICKBAIT_REGEX =
  /\b(gta\s*5\s*mod|gta\s*v\s*mod|fivem\s*server|roblox|minecraft|fortnite|san\s*andreas\s*definitive)\b/i;

function isRelevantGta6Title(title: string): boolean {
  if (!title || title.length < 6) return false;
  if (!isEnglishTitle(title)) return false;
  if (REJECT_CLICKBAIT_REGEX.test(title)) return false;
  return GTA6_KEYWORD_REGEX.test(title);
}

// ─── Fast Built-In Multi-Platform Scraper (Runs Directly in Node/Vercel) ──────
async function runFastBuiltInScraper(): Promise<{
  sourcesCrawled: number;
  found: number;
  added: number;
  rejected: number;
  discoveredItems: { id: string; title: string; platform: string }[];
  errors: string[];
}> {
  const supabase = getSupabaseAdmin();
  let sourcesCrawled = 0;
  let found = 0;
  let added = 0;
  let rejected = 0;
  const discoveredItems: { id: string; title: string; platform: string }[] = [];
  const errors: string[] = [];

  const candidateRows: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();

  // 1. Reddit r/GTA6 & r/GTA Native Video Scrape (v.redd.it MP4s)
  try {
    sourcesCrawled++;
    const redditRes = await fetch(
      "https://www.reddit.com/r/GTA6/hot.json?limit=35",
      {
        headers: {
          "User-Agent": "LeonidaViceNewsroom/3.0 (by /u/LeonidaViceDesk)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (redditRes.ok) {
      const json = await redditRes.json();
      const children = json?.data?.children ?? [];
      for (const child of children) {
        const post = child?.data;
        if (!post) continue;
        const fallbackUrl: string | undefined =
          post?.secure_media?.reddit_video?.fallback_url ||
          post?.preview?.reddit_video_preview?.fallback_url;
        const hlsUrl: string | undefined =
          post?.secure_media?.reddit_video?.hls_url;
        if (!fallbackUrl && !hlsUrl) continue;

        found++;
        const title = String(post.title || "").trim();
        if (!isEnglishTitle(title) || REJECT_CLICKBAIT_REGEX.test(title)) {
          rejected++;
          continue;
        }

        const cleanMp4 = fallbackUrl ? fallbackUrl.split("?")[0] : null;
        const id = `reddit_${post.id}`;
        candidateRows.push({
          id,
          source_platform: "reddit",
          canonical_url: `https://www.reddit.com${post.permalink}`,
          direct_mp4_url: cleanMp4,
          manifest_url: hlsUrl || null,
          title: title.slice(0, 220),
          creator_name: post.author || "r/GTA6",
          creator_url: `https://www.reddit.com/user/${post.author}`,
          thumbnail_url:
            typeof post.thumbnail === "string" && post.thumbnail.startsWith("http")
              ? post.thumbnail
              : null,
          duration_sec: post?.secure_media?.reddit_video?.duration || 45,
          view_count: post.ups || 100,
          source_category: "user_clip",
          uploaded_at: post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : nowIso,
          fetched_at: nowIso,
          manifest_refreshed_at: nowIso,
          is_active: true,
          is_approved: true,
          play_count: 0,
        });
      }
    }
  } catch (err) {
    errors.push(`reddit: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Internet Archive (archive.org) GTA VI Video Search + Metadata Resolution
  try {
    sourcesCrawled++;
    const query = encodeURIComponent(
      '(title:("GTA 6" OR "GTA VI" OR "Grand Theft Auto VI") AND mediatype:(movies))'
    );
    const archRes = await fetch(
      `https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier,title,creator,downloads,publicdate&sort[]=publicdate+desc&rows=12&page=1&output=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (archRes.ok) {
      const archData = await archRes.json();
      const docs = archData?.response?.docs ?? [];
      for (const doc of docs.slice(0, 6)) {
        const identifier = doc?.identifier;
        const title = String(doc?.title || "").trim();
        if (!identifier || !title) continue;
        found++;
        if (!isRelevantGta6Title(title)) {
          rejected++;
          continue;
        }
        try {
          const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!metaRes.ok) continue;
          const meta = await metaRes.json();
          const files: { name?: string; format?: string; length?: string }[] =
            meta?.files ?? [];
          const mp4File = files.find(
            (f) =>
              f.name &&
              f.name.toLowerCase().endsWith(".mp4") &&
              !f.name.toLowerCase().includes(".ia.")
          ) ?? files.find((f) => f.name?.toLowerCase().endsWith(".mp4"));

          if (!mp4File?.name) {
            rejected++;
            continue;
          }

          const mp4Url = `https://archive.org/download/${identifier}/${encodeURIComponent(
            mp4File.name
          ).replace(/%2F/g, "/")}`;
          const dur = Number.parseFloat(mp4File.length || "75");

          candidateRows.push({
            id: `archive_${identifier}`.slice(0, 90),
            source_platform: "archive",
            canonical_url: `https://archive.org/details/${identifier}`,
            direct_mp4_url: mp4Url,
            manifest_url: null,
            title: title.slice(0, 220),
            creator_name: Array.isArray(doc.creator)
              ? doc.creator[0]
              : doc.creator || "Internet Archive",
            creator_url: `https://archive.org/details/${identifier}`,
            thumbnail_url: `https://archive.org/services/img/${identifier}`,
            duration_sec: Number.isFinite(dur) && dur > 5 ? Math.round(dur) : 75,
            view_count: Number(doc.downloads || 50),
            source_category: "analysis",
            uploaded_at: doc.publicdate || nowIso,
            fetched_at: nowIso,
            manifest_refreshed_at: nowIso,
            is_active: true,
            is_approved: true,
            play_count: 0,
          });
        } catch {
          // skip individual metadata timeout
        }
      }
    }
  } catch (err) {
    errors.push(`archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. PeerTube Federation ("peertube.stream" & "tilvids.com") GTA 6 Direct MP4/HLS API
  const peertubeHosts = ["https://peertube.stream", "https://tilvids.com"];
  for (const host of peertubeHosts) {
    try {
      sourcesCrawled++;
      const ptRes = await fetch(
        `${host}/api/v1/search/videos?search=${encodeURIComponent("GTA 6")}&count=10&sort=-publishedAt`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!ptRes.ok) continue;
      const ptData = await ptRes.json();
      const items = ptData?.data ?? [];
      for (const v of items.slice(0, 4)) {
        found++;
        const title = String(v?.name || "").trim();
        if (!isRelevantGta6Title(title)) {
          rejected++;
          continue;
        }
        const detailRes = await fetch(`${host}/api/v1/videos/${v.uuid || v.id}`, {
          signal: AbortSignal.timeout(4500),
        });
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const files = detail?.files ?? [];
        const streamingPlaylists = detail?.streamingPlaylists ?? [];
        const directFile = files[0]?.fileDownloadUrl || files[0]?.fileUrl || null;
        const hlsPlaylist = streamingPlaylists[0]?.playlistUrl || null;

        if (!directFile && !hlsPlaylist) {
          rejected++;
          continue;
        }

        candidateRows.push({
          id: `peertube_${v.shortUUID || v.uuid || v.id}`,
          source_platform: "peertube",
          canonical_url: v.url || `${host}/w/${v.shortUUID || v.uuid}`,
          direct_mp4_url: directFile,
          manifest_url: hlsPlaylist,
          title: title.slice(0, 220),
          creator_name: v?.account?.displayName || v?.account?.name || "PeerTube Creator",
          creator_url: v?.account?.url || host,
          thumbnail_url: v.thumbnailPath ? `${host}${v.thumbnailPath}` : null,
          duration_sec: Number(v.duration || 75),
          view_count: Number(v.views || 25),
          source_category: "analysis",
          uploaded_at: v.publishedAt || nowIso,
          fetched_at: nowIso,
          manifest_refreshed_at: nowIso,
          is_active: true,
          is_approved: true,
          play_count: 0,
        });
      }
    } catch {
      // ignore offline PeerTube instance
    }
  }

  // Upsert discovered clips into Supabase video_catalog (preserving existing play_count if already present)
  if (supabase && candidateRows.length > 0) {
    const ids = candidateRows.map((r) => String(r.id));
    const { data: existingRows } = await supabase
      .from("video_catalog")
      .select("id")
      .in("id", ids);

    const existingSet = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
    const brandNewRows = candidateRows.filter((r) => !existingSet.has(String(r.id)));

    if (brandNewRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("video_catalog")
        .upsert(brandNewRows, { onConflict: "id" });
      if (insertErr) {
        errors.push(`supabase_upsert: ${insertErr.message}`);
      } else {
        added = brandNewRows.length;
        for (const r of brandNewRows) {
          discoveredItems.push({
            id: String(r.id),
            title: String(r.title),
            platform: String(r.source_platform),
          });
        }
      }
    }

    // Also refresh manifest/direct_mp4_url timestamps on existing matches
    await supabase.from("aggregator_runs").insert({
      run_at: nowIso,
      sources_crawled: sourcesCrawled,
      videos_found: found,
      videos_added: added,
      videos_rejected: rejected,
      error_log: errors.length > 0 ? JSON.stringify(errors) : null,
    });
  }

  bumpCatalogRevision();
  return {
    sourcesCrawled,
    found,
    added,
    rejected,
    discoveredItems,
    errors,
  };
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseReader();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      videos: [],
      recentRuns: [],
      forcedOverride: getForcedBroadcastClip(),
      stats: { total: 0, activePlayable: 0, inactive: 0, platforms: {} },
    });
  }

  try {
    const [{ data: videoRows, error: vidErr }, { data: runRows }] = await Promise.all([
      supabase
        .from("video_catalog")
        .select("*")
        .neq("source_platform", "direct")
        .not("id", "like", "demo-%")
        .order("fetched_at", { ascending: false })
        .limit(250),
      supabase
        .from("aggregator_runs")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(10),
    ]);

    if (vidErr) throw vidErr;

    const rawVideos = (videoRows ?? []) as AdminVideoCatalogRow[];
    const eligibleSet = new Set(
      filterCatalogRows(
        rawVideos.filter((r) => r.is_active !== false && r.is_approved !== false),
        {
          GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
          GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
        }
      ).map((r) => r.id)
    );

    const platforms: Record<string, number> = {};
    const enriched: AdminVideoCatalogRow[] = rawVideos.map((r) => {
      const p = (r.source_platform || "unknown").toLowerCase();
      platforms[p] = (platforms[p] || 0) + 1;
      return {
        ...r,
        eligibleForBroadcast: eligibleSet.has(r.id),
      };
    });

    return NextResponse.json({
      ok: true,
      videos: enriched,
      recentRuns: (runRows ?? []) as AggregatorRunRow[],
      forcedOverride: getForcedBroadcastClip(),
      stats: {
        total: enriched.length,
        activePlayable: eligibleSet.size,
        inactive: enriched.length - eligibleSet.size,
        platforms,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is required in .env.local to modify video_catalog.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action || "");

    // 1. SCRAPE FRESH CLIPS NOW (Fast Built-In Scraper + Optional Python 20-Platform Worker)
    if (action === "scrape_now") {
      const spawnPython = Boolean(body.spawnPython);
      let pythonDispatched = false;

      if (spawnPython && process.env.NODE_ENV !== "production") {
        try {
          const platformsArg = Array.isArray(body.platforms) && body.platforms.length > 0
            ? ["--platforms", ...body.platforms.map(String)]
            : ["--platforms", "rumble", "dailymotion", "reddit", "medal", "archive", "kick"];
          const child = spawn("python", ["-m", "crawler.run_all", ...platformsArg], {
            cwd: process.cwd(),
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          pythonDispatched = true;
        } catch {
          pythonDispatched = false;
        }
      }

      const fastResult = await runFastBuiltInScraper();
      return NextResponse.json({
        ok: true,
        ...fastResult,
        pythonDispatched,
      });
    }

    // 2. PLAY ON FRONT PAGE BROADCAST RIGHT NOW (Pin / Override + Reset play_count = 0)
    if (action === "play_now") {
      const videoId = String(body.videoId || "").trim();
      const durationSec = Number(body.durationSec || 75);
      if (!videoId) {
        return NextResponse.json({ ok: false, error: "videoId required" }, { status: 400 });
      }

      await supabase
        .from("video_catalog")
        .update({
          is_active: true,
          is_approved: true,
          play_count: 0,
          fetched_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      const override = setForcedBroadcastClip(videoId, durationSec);
      return NextResponse.json({
        ok: true,
        message: `Broadcast switched live to "${videoId}"!`,
        forcedOverride: override,
      });
    }

    // 3. CLEAR BROADCAST PIN (Return to normal master clock rotation)
    if (action === "clear_pin") {
      setForcedBroadcastClip(null);
      return NextResponse.json({
        ok: true,
        message: "Returned broadcast to automatic master rotation.",
        forcedOverride: null,
      });
    }

    // 4. TOGGLE ACTIVE / APPROVED STATUS
    if (action === "toggle_active") {
      const videoId = String(body.videoId || "").trim();
      const isActive = Boolean(body.isActive);
      const { error } = await supabase
        .from("video_catalog")
        .update({ is_active: isActive, is_approved: isActive })
        .eq("id", videoId);
      if (error) throw error;
      bumpCatalogRevision();
      return NextResponse.json({ ok: true, videoId, isActive });
    }

    // 5. RESET PLAY COUNT TO 0 (Move to Front of Rotation)
    if (action === "reset_plays") {
      const videoId = String(body.videoId || "").trim();
      const { error } = await supabase
        .from("video_catalog")
        .update({ play_count: 0, is_active: true, is_approved: true })
        .eq("id", videoId);
      if (error) throw error;
      bumpCatalogRevision();
      return NextResponse.json({ ok: true, videoId });
    }

    // 6. DELETE CLIP FROM CATALOG
    if (action === "delete") {
      const videoId = String(body.videoId || "").trim();
      const { error } = await supabase
        .from("video_catalog")
        .delete()
        .eq("id", videoId);
      if (error) throw error;
      bumpCatalogRevision();
      return NextResponse.json({ ok: true, videoId });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
