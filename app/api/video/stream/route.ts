import type { NextRequest } from "next/server";
import { fetchAllowedMedia, parseAllowedMediaUrl } from "@/lib/video/media-hosts";

// ─── Allowlisted Zero-Buffer Byte-Range CORS Media Streamer ──────────────────
// Enables Web Audio API (loudness compressor, 20-120Hz sub-bass analyser, Cabin FM)
// on cross-origin CDN MP4s (e.g. Archive.org) that omit Access-Control-Allow-Origin.
//
// Hardened: https-only, strict dot-boundary host suffix allowlist, no raw IPs /
// localhost, every redirect hop re-validated, GET/HEAD only, video content-types only.
//
// NOTE: this streams bytes through the Vercel function. Prefer the Cloudflare
// PartyServer /proxy-media endpoint (zero egress cost) in production.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function proxy(request: NextRequest, method: "GET" | "HEAD") {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const parsed = parseAllowedMediaUrl(target);
  if (!parsed) {
    return Response.json({ error: "URL not permitted" }, { status: 403 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.set("Range", range);
  upstreamHeaders.set("User-Agent", "Mozilla/5.0 (compatible; LeonidaViceStream/3.0)");

  try {
    const upstream = await fetchAllowedMedia(parsed, { method, headers: upstreamHeaders });
    if (!upstream) {
      return Response.json({ error: "Upstream redirect not permitted" }, { status: 502 });
    }

    // Only relay actual media — never HTML/JSON error pages from the upstream host.
    const contentType = upstream.headers.get("content-type") ?? "";
    if (
      upstream.ok &&
      !/^(video\/|audio\/|application\/(octet-stream|mp4|vnd\.apple\.mpegurl|x-mpegurl))/i.test(contentType)
    ) {
      return Response.json({ error: "Upstream is not a media resource" }, { status: 415 });
    }

    const respHeaders = new Headers();
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const val = upstream.headers.get(key);
      if (val) respHeaders.set(key, val);
    }
    respHeaders.set("Cache-Control", "public, max-age=3600");
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    return new Response(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    return Response.json({ error: "Upstream stream unreachable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxy(request, "GET");
}

export async function HEAD(request: NextRequest) {
  return proxy(request, "HEAD");
}
