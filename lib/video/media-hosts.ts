// ─── Shared Media Host Allowlist (SSRF-safe) ─────────────────────────────────
// Single source of truth used by BOTH the Next.js /api/video/stream proxy and the
// Cloudflare PartyServer /proxy-media edge streamer. Pure TypeScript (no Node/Next
// imports) so it bundles in Workers too.
//
// Matching is strict dot-boundary SUFFIX matching on the parsed hostname, so
// "archive.org" and "ia801601.us.archive.org" match but "evilarchive.org" or
// "archive.org.evil.com" do NOT.

export const MEDIA_HOST_SUFFIXES: readonly string[] = [
  "archive.org",
  "streamable.com",
  "medal.tv",
  "redd.it",
  "redditmedia.com",
  "imgur.com",
  "coub.com",
  "odysee.com",
  "lbryplayer.xyz",
  "rumble.com",
  "dailymotion.com",
  "vimeo.com",
  "vimeocdn.com",
  "kick.com",
  "bitchute.com",
  "twimg.com",
  "hdslb.com",
  "vkuser.net",
  "supabase.co",
  "mux.dev",
];

const MAX_REDIRECT_HOPS = 4;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv6 literals are never legitimate CDN hosts for our catalog
  if (h.includes(":")) return true;
  // IPv4 literals
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return true; // any raw IP is rejected — catalog hosts are always named
  return false;
}

export function isAllowedMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (isPrivateOrLocalHostname(h)) return false;
  return MEDIA_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

/** Parses + validates a proxy target: https only, no credentials, allowlisted host. */
export function parseAllowedMediaUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!isAllowedMediaHost(parsed.hostname)) return null;
  return parsed;
}

/**
 * Fetch with manual redirect following so EVERY hop is re-validated against the
 * allowlist (prevents an allowlisted host from bouncing the proxy to an internal
 * address or arbitrary domain).
 */
export async function fetchAllowedMedia(
  target: URL,
  init: { method?: string; headers: Headers }
): Promise<Response | null> {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const res = await fetch(current.toString(), {
      method: init.method ?? "GET",
      headers: init.headers,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      const next = parseAllowedMediaUrl(new URL(location, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    return res;
  }
  return null;
}
