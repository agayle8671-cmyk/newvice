// ─── Shared Catalog Logic ────────────────────────────────────────────────────
// One implementation of row→VideoItem mapping, platform icons, English-only
// filtering, demo-stream rejection, and the Launch-Day "post-launch" gate.
// Used by:
//   • app/api/room/[slug]/sync/route.ts   (deterministic server-clock coordinator)
//   • app/api/video/next/route.ts         (standalone queue)
//   • party/src/server.ts                 (Cloudflare Durable Object coordinator)
// Pure TypeScript — no Next.js / Node imports so it bundles inside Workers.

import type { VideoCategory, VideoItem, VideoSource } from "./types";

export interface CatalogRow {
  id: string;
  source_platform: string;
  canonical_url: string;
  youtube_id?: string | null;
  manifest_url?: string | null;
  direct_mp4_url?: string | null;
  title: string;
  creator_name?: string | null;
  creator_url?: string | null;
  creator_avatar?: string | null;
  thumbnail_url?: string | null;
  duration_sec?: number | null;
  view_count?: number | null;
  source_category?: string | null;
  uploaded_at?: string | null;
  fetched_at: string;
  play_count?: number | null;
  scout_name?: string | null;
  viral_heat_score?: number | null;
  high_beam_count?: number | null;
  perceptual_hash?: string | null;
}

export interface LaunchEnv {
  GTA6_LAUNCH_DATE?: string;
  GTA6_LAUNCH_MODE?: string;
}

// Rockstar's announced release date (Nov 19, 2026). Override with GTA6_LAUNCH_DATE.
export const DEFAULT_GTA6_LAUNCH_DATE = "2026-11-19T00:00:00Z";

export const DEFAULT_CLIP_DURATION_SEC = 75;

const PLATFORM_ICONS: Record<string, string> = {
  kick: "🟩",
  rumble: "🟧",
  dailymotion: "🟦",
  peertube: "🐘",
  odyssee: "🔵",
  archive: "📦",
  reddit: "🟥",
  bilibili: "💙",
  bilibili_tv: "💙",
  vimeo: "🎞️",
  vk: "💬",
  nicovideo: "🇯🇵",
  medal: "🏅",
  streamable: "⚡",
  youtube: "▶️",
  moddb: "🎮",
  modsites: "🎮",
  community: "🎬",
  direct: "🎬",
};

export function platformIcon(platform: string | null | undefined): string {
  return PLATFORM_ICONS[(platform ?? "").toLowerCase()] ?? "🎬";
}

// ─── Reject any demo / test streams (e.g. Mux / Big Buck Bunny) ──────────────
const DEMO_URL_REGEX =
  /(test-streams\.mux\.dev|big_buck_bunny|akamaihd\.net\/i\/multi\/will\/bunny|x36xhzz\.m3u8)/i;

export function isDemoOrPlaceholderRow(
  row: Pick<
    CatalogRow,
    "id" | "source_platform" | "manifest_url" | "direct_mp4_url" | "canonical_url"
  >
): boolean {
  const id = (row.id ?? "").toLowerCase();
  if (id.startsWith("demo-") || id.startsWith("fallback-")) return true;
  if ((row.source_platform ?? "").toLowerCase() === "direct") return true;
  const urls = [row.manifest_url, row.direct_mp4_url, row.canonical_url]
    .filter(Boolean)
    .join(" ");
  if (DEMO_URL_REGEX.test(urls)) return true;
  return false;
}

// ─── English-only filter ─────────────────────────────────────────────────────
const FOREIGN_SCRIPT_REGEX =
  /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;
const NON_ENGLISH_WORDS_REGEX =
  /\b(el|los|las|del|della|delle|degli|dei|des|les|du|dans|pour|avec|sur|par|neuer|und|oder|mit|auf|nach|ist|nicht|der|die|das|dem|den|einer|como|para|por|pero|mais|porque|jugar|juego|jogar|jogo|reacción|reaccion|análisis|analisis|reagiert|lebt|uhr|vidéo|jeu|jeux|palaver|meilleurs|graphismes|descargar|jugarlo|lanzamiento|reagisco|analizzo)\b/i;

export function isEnglishTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  if (FOREIGN_SCRIPT_REGEX.test(title)) return false;
  if (NON_ENGLISH_WORDS_REGEX.test(title)) return false;
  return true;
}

// ─── Launch-Day gate ─────────────────────────────────────────────────────────
export const POST_LAUNCH_REJECT_REGEX =
  /\b(leak|leaks|leaked|speculation|speculate|rumor|rumors|rumour|rumours|theory|theories|wishlist|concept\s*trailer|fan\s*trailer|trailer\s*breakdown|trailer\s*analysis|trailer\s*reaction|when\s*will\s*gta\s*6|release\s*date\s*rumor|what\s*to\s*expect|before\s*you\s*buy|countdown|delay\s*rumor|fake\s*leak)\b/i;

const PRE_LAUNCH_CATEGORIES = new Set([
  "trailer",
  "leak",
  "analysis",
  "reaction",
  "pre_launch_archive",
]);

export function getLaunchDateMs(env: LaunchEnv = {}): number {
  const ms = Date.parse(env.GTA6_LAUNCH_DATE || DEFAULT_GTA6_LAUNCH_DATE);
  return Number.isNaN(ms) ? Date.parse(DEFAULT_GTA6_LAUNCH_DATE) : ms;
}

/** True once the game is out (or when GTA6_LAUNCH_MODE is forced on). */
export function isPostLaunch(env: LaunchEnv = {}, nowMs: number = Date.now()): boolean {
  const mode = (env.GTA6_LAUNCH_MODE ?? "").toLowerCase();
  if (mode === "true" || mode === "1" || mode === "yes") return true;
  return nowMs >= getLaunchDateMs(env);
}

/** True when a catalog row must NOT be shown post-launch (leaks, speculation, old uploads...). */
export function isObsoleteAfterLaunch(
  row: Pick<CatalogRow, "title" | "uploaded_at" | "source_category">,
  env: LaunchEnv = {}
): boolean {
  if (POST_LAUNCH_REJECT_REGEX.test(row.title ?? "")) return true;
  if (row.source_category && PRE_LAUNCH_CATEGORIES.has(row.source_category)) return true;
  if (row.uploaded_at) {
    const up = Date.parse(row.uploaded_at);
    if (!Number.isNaN(up) && up < getLaunchDateMs(env)) return true;
  }
  return false;
}

/** Applies real-scraped-only, English-only, and (post-launch) obsolete-content gates to catalog rows. */
export function filterCatalogRows<T extends CatalogRow>(rows: T[], env: LaunchEnv = {}): T[] {
  const postLaunch = isPostLaunch(env);
  return rows.filter((row) => {
    if (isDemoOrPlaceholderRow(row)) return false;
    if (!isEnglishTitle(row.title)) return false;
    if (postLaunch && isObsoleteAfterLaunch(row, env)) return false;
    // Require a playable scraped stream (HLS manifest or direct MP4)
    return Boolean(row.direct_mp4_url || row.manifest_url);
  });
}

export function rowToVideoItem(row: CatalogRow): VideoItem {
  const platform = row.source_platform || "archive";
  return {
    id: row.id,
    source: platform as VideoSource,
    manifestUrl: row.manifest_url ?? undefined,
    directMp4Url: row.direct_mp4_url ?? undefined,
    youtubeId: row.youtube_id ?? undefined,
    title: row.title,
    creatorName: row.creator_name || "Unknown",
    creatorUrl: row.creator_url ?? row.canonical_url ?? "",
    creatorAvatar: row.creator_avatar ?? undefined,
    platform,
    platformIcon: platformIcon(platform),
    sourceUrl: row.canonical_url,
    thumbnail: row.thumbnail_url ?? undefined,
    durationSec:
      row.duration_sec && row.duration_sec > 5
        ? Math.min(row.duration_sec, 1800)
        : undefined,
    category: (row.source_category || "gameplay") as VideoCategory,
    viewCount: row.view_count ?? undefined,
    scoutName: row.scout_name ?? undefined,
    viralHeatScore: row.viral_heat_score ?? undefined,
    highBeamCount: row.high_beam_count ?? undefined,
    perceptualHash: row.perceptual_hash ?? undefined,
    fetchedAt: row.fetched_at,
    playCount: row.play_count ?? 0,
  };
}
