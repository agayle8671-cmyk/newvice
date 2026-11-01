import type { NextRequest } from "next/server";

// ─── Allowlisted Zero-Buffer Byte-Range CORS Media Streamer ──────────────────
// Enables Web Audio API (DynamicsCompressorNode loudness normalization, 20-120Hz
// sub-bass AnalyserNode, Cabin FM Radio BiquadFilterNode) and 32x18 ambient
// canvas sampling on cross-origin CDN MP4s (e.g. Archive.org storage nodes)
// that omit Access-Control-Allow-Origin headers.

const ALLOWED_MEDIA_HOSTS = [
  "archive.org",
  "streamable.com",
  "mux.dev",
  "medal.tv",
  "redd.it",
  "redditmedia.com",
  "peertube",
  "odysee.com",
  "lbryplayer.xyz",
  "rumble.com",
  "kick.com",
  "dailymotion.com",
  "vimeo.com",
  "imgur.com",
  "coub.com",
  "supabase.co",
  "bitchute.com",
  "twimg.com",
  "hdslb.com",
  "vkuser",
];

function isHostAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_MEDIA_HOSTS.some(
    (h) => lower === h || lower.endsWith(`.${h}`) || lower.includes(h)
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isHostAllowed(parsed.hostname)) {
    return Response.json({ error: "Host not in media allowlist" }, { status: 403 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);
  upstreamHeaders.set("User-Agent", "Mozilla/5.0 (compatible; LeonidaViceStream/3.0)");

  try {
    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const respHeaders = new Headers();
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "cache-control",
    ]) {
      const val = upstream.headers.get(key);
      if (val) respHeaders.set(key, val);
    }
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges"
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    return Response.json({ error: "Upstream stream unreachable" }, { status: 502 });
  }
}
