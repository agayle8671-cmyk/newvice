// ─── Video Engine Types ───────────────────────────────────────────────────────

export type VideoSource =
  | "youtube"
  | "rumble"
  | "dailymotion"
  | "kick"
  | "peertube"
  | "odyssee"
  | "archive"
  | "reddit"
  | "bilibili"
  | "vk"
  | "nicovideo"
  | "medal"
  | "streamable"
  | "vimeo"
  | "bitchute"
  | "coub"
  | "imgur"
  | "soop"
  | "x"
  | "modsites"
  | "community"
  | "direct";

export type VideoCategory =
  | "trailer"
  | "gameplay"
  | "user_clip"
  | "mod_showcase"
  | "rp_drama"
  | "synthwave"
  | "pre_launch_archive"
  | "leak"
  | "analysis"
  | "reaction"
  | "fan_edit"
  | "unknown";

export interface VideoItem {
  id: string;
  source: VideoSource;

  // Playback — one of these will be populated
  youtubeId?: string;    // YouTube IFrame API / Official Embed
  manifestUrl?: string;  // HLS .m3u8 or DASH .mpd
  directMp4Url?: string; // Progressive MP4
  embedUrl?: string;     // Official platform OEmbed / iframe fallback URL

  // Metadata
  title: string;
  creatorName: string;
  creatorUrl: string;
  creatorAvatar?: string;
  platform: string;         // Display name: "Rumble", "Kick", etc.
  platformIcon?: string;    // Emoji or icon identifier
  sourceUrl: string;        // Original page URL — opens in new tab
  thumbnail?: string;
  durationSec?: number;
  category: VideoCategory;
  viewCount?: number;

  // V3 Curation & Deduplication Metadata
  scoutName?: string;
  viralHeatScore?: number;
  highBeamCount?: number;
  perceptualHash?: string;

  // Internal
  fetchedAt: string;
  playCount: number;
}

export interface VideoQueueItem {
  videoId: string;
  manifestUrl: string;    // Active (non-expired) CDN manifest
  expiresAt: number;      // Unix timestamp when manifest expires
  metadata: VideoItem;
}

export interface PlayerState {
  status: "idle" | "loading" | "playing" | "paused" | "transitioning" | "error";
  current: VideoItem | null;
  next: VideoItem | null;
  isMuted: boolean;
  volume: number;
  progress: number;       // 0–1
  duration: number;       // seconds
}

export interface NextStreamResponse {
  ok: boolean;
  item: VideoItem | null;
  error?: string;
}
