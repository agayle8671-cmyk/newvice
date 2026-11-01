"use client";

import { useMemo } from "react";
import type { VideoItem } from "@/lib/video/types";
import { safeHttpUrl } from "@/lib/security/url";

interface OfficialEmbedFallbackProps {
  item: VideoItem;
  initialOffsetSec?: number;
  isMuted: boolean;
  /** Blocks cross-origin iframe from swallowing clicks while any UI modal is open */
  modalOpen?: boolean;
  /** Incremented when user clicks Live Sync to force iframe reload at fresh live offset */
  resyncNonce?: number;
}

export function buildOfficialEmbedUrl(
  item: VideoItem,
  offsetSec: number,
  isMuted: boolean
): string | null {
  const start = Math.max(0, Math.floor(offsetSec));

  if (item.youtubeId) {
    const params = new URLSearchParams({
      autoplay: "1",
      mute: isMuted ? "1" : "0",
      controls: "0",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      start: String(start),
    });
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
      item.youtubeId
    )}?${params.toString()}`;
  }

  // Only https embeds — a javascript:/data: iframe src would run in our origin
  const embed = safeHttpUrl(item.embedUrl);
  if (embed && embed.startsWith("https://")) {
    try {
      const u = new URL(embed);
      if (!u.searchParams.has("autoplay")) u.searchParams.set("autoplay", "1");
      if (isMuted && !u.searchParams.has("muted")) {
        u.searchParams.set("muted", "1");
      }
      return u.toString();
    } catch {
      return null;
    }
  }

  return null;
}

export default function OfficialEmbedFallback({
  item,
  initialOffsetSec = 0,
  isMuted,
  modalOpen = false,
  resyncNonce = 0,
}: OfficialEmbedFallbackProps) {
  // Memoize on item.id + mute state + explicit resyncNonce so iframe doesn't reload every timeupdate tick
  const src = useMemo(
    () => buildOfficialEmbedUrl(item, initialOffsetSec, isMuted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, item.youtubeId, item.embedUrl, isMuted, resyncNonce]
  );

  if (!src) return null;

  return (
    <div className="absolute inset-0 z-10 w-full h-full bg-black overflow-hidden">
      <iframe
        key={`${item.id}-${isMuted ? "muted" : "audio"}-${resyncNonce}`}
        src={src}
        title={item.title || "Leonida Vice Official Stream"}
        className="w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      {/* Modal pointer-event shield prevents iframe focus theft when overlays are open */}
      {modalOpen && (
        <div
          className="absolute inset-0 z-30 bg-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
