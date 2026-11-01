import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { safeHttpUrl } from "@/lib/security/url";
import { filterMessage } from "@/lib/moderation/filter";
import { isAllowedMediaHost } from "@/lib/video/media-hosts";
import {
  getLaunchDateMs,
  isEnglishTitle,
  isPostLaunch,
  POST_LAUNCH_REJECT_REGEX,
} from "@/lib/video/catalog";

// ─── Community Clip Submission ───────────────────────────────────────────────
// Users paste a clip URL; we resolve it to a directly playable stream, then queue it.
//   • Playable + trusted source  → goes LIVE in rotation immediately
//   • Unresolvable / unknown host → saved as PENDING (is_approved=false) for review
// All writes use the service role; the public anon key can no longer write the catalog.

const MAX_URL_LENGTH = 500;
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

interface ResolvedStream {
  directMp4Url: string | null;
  manifestUrl: string | null;
  youtubeId: string | null;
  platform: string;
  durationSec: number | null;
  thumbnail: string | null;
  uploadedAt: string | null;
  trusted: boolean;
}

function sanitizeHandle(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, 30);
  return cleaned || "Vice Driver";
}

function parseYoutubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/") || u.pathname.startsWith("/live/")) {
      id = u.pathname.split("/")[2] ?? null;
    }
  }
  return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
}

async function resolveStreamable(shortcode: string): Promise<Partial<ResolvedStream> | null> {
  try {
    const res = await fetch(`https://api.streamable.com/videos/${encodeURIComponent(shortcode)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "LeonidaVice/3.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    let mp4: string | undefined = data?.files?.mp4?.url;
    if (!mp4) return null;
    if (mp4.startsWith("//")) mp4 = `https:${mp4}`;
    const safe = safeHttpUrl(mp4);
    if (!safe) return null;
    const thumb: string | undefined = data?.thumbnail_url;
    return {
      directMp4Url: safe,
      durationSec: Math.round(Number(data?.files?.mp4?.duration) || 0) || null,
      thumbnail: thumb ? safeHttpUrl(thumb.startsWith("//") ? `https:${thumb}` : thumb) : null,
    };
  } catch {
    return null;
  }
}

async function resolveViaCrawler(url: string): Promise<Partial<ResolvedStream> | null> {
  const base = process.env.CRAWLER_SERVICE_URL;
  if (!base) return null;
  try {
    const endpoint = new URL("resolve", base.endsWith("/") ? base : `${base}/`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || (!data.direct_mp4_url && !data.manifest_url)) return null;
    return {
      directMp4Url: safeHttpUrl(data.direct_mp4_url),
      manifestUrl: safeHttpUrl(data.manifest_url),
      durationSec: data.duration_sec ? Math.round(Number(data.duration_sec)) : null,
      thumbnail: safeHttpUrl(data.thumbnail),
      uploadedAt: typeof data.uploaded_at === "string" ? data.uploaded_at : null,
    };
  } catch {
    return null;
  }
}

async function resolveClip(url: URL): Promise<ResolvedStream> {
  const out: ResolvedStream = {
    directMp4Url: null,
    manifestUrl: null,
    youtubeId: null,
    platform: "community",
    durationSec: null,
    thumbnail: null,
    uploadedAt: null,
    trusted: false,
  };

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();

  // 1) Direct media links
  if (path.endsWith(".mp4") || path.endsWith(".webm")) {
    out.directMp4Url = url.toString();
    out.trusted = isAllowedMediaHost(url.hostname);
    return out;
  }
  if (path.endsWith(".m3u8")) {
    out.manifestUrl = url.toString();
    out.trusted = isAllowedMediaHost(url.hostname);
    return out;
  }

  // 2) YouTube (official iframe embed)
  const ytId = parseYoutubeId(url);
  if (ytId) {
    out.youtubeId = ytId;
    out.platform = "youtube";
    out.thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    out.trusted = true;
    return out;
  }

  // 3) Streamable (public JSON API → real CDN MP4)
  if (host === "streamable.com") {
    out.platform = "streamable";
    const shortcode = url.pathname.split("/").filter(Boolean).pop();
    if (shortcode) {
      const info = await resolveStreamable(shortcode);
      if (info?.directMp4Url) {
        Object.assign(out, info, { trusted: true });
      }
    }
    return out;
  }

  // 4) Everything else (Medal, Reddit, Rumble, Kick, ...) → yt-dlp on the crawler service
  if (host.endsWith("medal.tv")) out.platform = "medal";
  else if (host.endsWith("reddit.com") || host === "redd.it") out.platform = "reddit";
  else if (host.endsWith("rumble.com")) out.platform = "rumble";
  else if (host.endsWith("kick.com")) out.platform = "kick";
  else if (host.endsWith("dailymotion.com")) out.platform = "dailymotion";
  else if (host.endsWith("vimeo.com")) out.platform = "vimeo";

  const info = await resolveViaCrawler(url.toString());
  if (info) {
    Object.assign(out, info, { trusted: out.platform !== "community" });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const cleanTitle = typeof body?.title === "string" ? body.title.trim().replace(/[\u0000-\u001f\u007f<>]/g, "") : "";
    const handle = sanitizeHandle(body?.creatorName);

    if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "Please provide a valid video clip URL (Streamable, Medal.tv, Reddit, YouTube, MP4)." },
        { status: 400 }
      );
    }
    const safeUrl = safeHttpUrl(rawUrl);
    if (!safeUrl || !safeUrl.startsWith("https://")) {
      return NextResponse.json({ ok: false, error: "Clip links must be secure https:// URLs." }, { status: 400 });
    }
    const parsedUrl = new URL(safeUrl);
    parsedUrl.hash = "";

    if (cleanTitle.length < 3 || cleanTitle.length > 100) {
      return NextResponse.json({ ok: false, error: "Title must be between 3 and 100 characters." }, { status: 400 });
    }
    if (!isEnglishTitle(cleanTitle)) {
      return NextResponse.json({ ok: false, error: "Clip title must be in English." }, { status: 400 });
    }
    for (const text of [cleanTitle, handle]) {
      const verdict = filterMessage(text);
      if (!verdict.allowed) {
        return NextResponse.json({ ok: false, error: `Rejected: ${verdict.reason}` }, { status: 400 });
      }
    }

    const launchEnv = {
      GTA6_LAUNCH_DATE: process.env.GTA6_LAUNCH_DATE,
      GTA6_LAUNCH_MODE: process.env.GTA6_LAUNCH_MODE,
    };
    const postLaunch = isPostLaunch(launchEnv);
    if (postLaunch && POST_LAUNCH_REJECT_REGEX.test(cleanTitle)) {
      return NextResponse.json(
        { ok: false, error: "The game is out — we only play your real gameplay clips now (no leaks/speculation)." },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    if (!(await checkRateLimit("clip-submit", ip, 5, 600))) {
      return NextResponse.json(
        { ok: false, error: "Slow down, driver — max 5 clip submissions per 10 minutes." },
        { status: 429 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Video database not configured." }, { status: 503 });
    }

    const canonicalUrl = parsedUrl.toString();
    const { data: existing } = await supabase
      .from("video_catalog")
      .select("id, is_active, is_approved")
      .eq("canonical_url", canonicalUrl)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { ok: false, error: "That clip has already been submitted — it's in the rotation." },
        { status: 409 }
      );
    }

    const resolved = await resolveClip(parsedUrl);
    const playable = Boolean(resolved.directMp4Url || resolved.manifestUrl || resolved.youtubeId);

    // Post-launch: the clip must have been uploaded AFTER release (when the host tells us)
    if (postLaunch && resolved.uploadedAt) {
      const up = Date.parse(resolved.uploadedAt);
      if (!Number.isNaN(up) && up < getLaunchDateMs(launchEnv)) {
        return NextResponse.json(
          { ok: false, error: "That clip was uploaded before launch — only post-release gameplay is allowed." },
          { status: 400 }
        );
      }
    }

    const live = playable && resolved.trusted;
    const now = new Date().toISOString();

    const newVideo = {
      id: `user-${crypto.randomUUID()}`,
      canonical_url: canonicalUrl,
      direct_mp4_url: resolved.directMp4Url,
      manifest_url: resolved.manifestUrl,
      youtube_id: resolved.youtubeId,
      thumbnail_url: resolved.thumbnail,
      duration_sec: resolved.durationSec,
      title: cleanTitle,
      creator_name: handle,
      creator_url: canonicalUrl,
      source_platform: resolved.platform,
      source_category: "user_clip",
      tags: ["user_submission", "gameplay_clip"],
      is_approved: live,
      is_active: true,
      play_count: 0,
      viral_heat_score: 25, // community clips rank near the top of the rotation
      fetched_at: now,
      uploaded_at: resolved.uploadedAt ?? now,
      manifest_refreshed_at: now,
    };

    const { error } = await supabase.from("video_catalog").insert(newVideo);
    if (error) {
      console.error("Failed to insert community video:", error);
      return NextResponse.json({ ok: false, error: "Database error while queueing clip." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: live ? "live" : "pending",
      id: newVideo.id,
      message: live
        ? "Clip added to rotation! It will hit the drive-in screen shortly."
        : "Clip received! We couldn't auto-verify that link, so it's queued for a quick review before it plays.",
    });
  } catch (err: unknown) {
    console.error("[video-submit] error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
