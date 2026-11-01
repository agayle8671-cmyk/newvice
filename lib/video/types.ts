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
  | "direct";

export type VideoCategory =
  | "trailer"
  | "gameplay"
  | "leak"
  | "analysis"
  | "reaction"
  | "fan_edit"
  | "unknown";

export interface VideoItem {
  id: string;
  source: VideoSource;

  // Playback — one of these will be populated
  youtubeId?: string;    // YouTube IFrame API
  manifestUrl?: string;  // HLS .m3u8 or DASH .mpd
  directMp4Url?: string; // Progressive MP4

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
