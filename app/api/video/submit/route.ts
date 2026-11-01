import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, title, creatorName } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { ok: false, error: "Please provide a valid video clip URL (Streamable, Medal.tv, Reddit, YouTube, MP4)." },
        { status: 400 }
      );
    }

    const cleanTitle = (title || "").trim();
    if (!cleanTitle) {
      return NextResponse.json(
        { ok: false, error: "Please provide a title or description for your clip." },
        { status: 400 }
      );
    }

    // Basic English check
    if (/[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(cleanTitle)) {
      return NextResponse.json(
        { ok: false, error: "Clip title must be in English." },
        { status: 400 }
      );
    }

    // Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Video database not configured." },
        { status: 503 }
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Identify platform
    let platform = "community";
    let directMp4Url: string | null = null;
    let manifestUrl: string | null = null;

    if (url.endsWith(".mp4") || url.includes(".mp4?")) {
      directMp4Url = url;
    } else if (url.endsWith(".m3u8") || url.includes(".m3u8?")) {
      manifestUrl = url;
    } else if (url.includes("streamable.com/")) {
      platform = "streamable";
      // Streamable direct CDN format
      const shortId = url.split("streamable.com/")[1]?.split(/[?#]/)[0];
      if (shortId) {
        directMp4Url = `https://cdn-cf-east.streamable.com/video/mp4/${shortId}.mp4`;
      }
    } else if (url.includes("medal.tv/")) {
      platform = "medal";
    }

    // If no direct stream yet, attempt Python crawler extraction if bound
    const crawlerBaseUrl = process.env.CRAWLER_SERVICE_URL;
    if (!directMp4Url && !manifestUrl && crawlerBaseUrl) {
      try {
        const refreshEndpoint = new URL("refresh", crawlerBaseUrl.endsWith("/") ? crawlerBaseUrl : `${crawlerBaseUrl}/`);
        // The service can resolve via yt-dlp
      } catch (err) {
        console.error("Crawler service extraction error:", err);
      }
    }

    const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const newVideo = {
      id,
      canonical_url: url,
      direct_mp4_url: directMp4Url,
      manifest_url: manifestUrl,
      title: cleanTitle,
      creator_name: (creatorName || "Vice Driver").trim().substring(0, 50),
      creator_url: url,
      source_platform: platform,
      source_category: "user_clip",
      tags: ["user_submission", "gameplay_clip"],
      is_approved: true,
      is_active: true,
      play_count: 0, // 0 puts it at front of queue in /api/video/next
      fetched_at: now,
      uploaded_at: now,
    };

    const { error } = await supabase.from("video_catalog").insert(newVideo);

    if (error) {
      console.error("Failed to insert community video:", error);
      return NextResponse.json(
        { ok: false, error: "Database error while queueing clip." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Clip successfully added to rotation! It will appear on the drive-in screen shortly.",
      item: newVideo,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
