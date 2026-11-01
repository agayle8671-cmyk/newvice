"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { VideoItem } from "@/lib/video/types";

interface CreatorCreditProps {
  item: VideoItem | null;
  visible: boolean; // controlled externally (show on clip start, fade after 6s)
}

const PLATFORM_COLORS: Record<string, string> = {
  kick: "#53fc18",
  rumble: "#85c742",
  dailymotion: "#0066dc",
  peertube: "#f1680d",
  odyssee: "#ef1f7f",
  archive: "#ff6600",
  reddit: "#ff4500",
  bilibili: "#00aeec",
  vk: "#2787f5",
  youtube: "#ff0000",
  medal: "#ffd700",
  default: "#00f3ff",
};

function platformColor(platform: string): string {
  return PLATFORM_COLORS[platform?.toLowerCase()] ?? PLATFORM_COLORS.default;
}

export default function CreatorCredit({ item, visible }: CreatorCreditProps) {
  if (!item) return null;

  const color = platformColor(item.source);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="absolute bottom-10 left-3 z-30 pointer-events-auto"
          style={{ maxWidth: "65%" }}
        >
          <div
            className="flex items-center gap-2 rounded px-2.5 py-1.5"
            style={{
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(4px)",
              border: `1px solid ${color}33`,
              boxShadow: `0 0 12px ${color}22`,
            }}
          >
            {/* Avatar */}
            {item.creatorAvatar && (
              <img
                src={item.creatorAvatar}
                alt={item.creatorName}
                className="w-5 h-5 rounded-full shrink-0 object-cover"
              />
            )}

            {/* Name + platform */}
            <div className="flex flex-col min-w-0">
              <span
                className="font-[family-name:var(--font-display)] font-bold leading-none truncate"
                style={{
                  fontSize: "clamp(8px,0.75vw,11px)",
                  color,
                  textShadow: `0 0 6px ${color}88`,
                }}
              >
                {item.platformIcon} {item.creatorName}
              </span>
              <span
                className="font-[family-name:var(--font-chat)] leading-none truncate"
                style={{
                  fontSize: "clamp(7px,0.65vw,9px)",
                  color: "#ffffff66",
                  marginTop: 1,
                }}
              >
                on {item.platform}
              </span>
            </div>

            {/* View original link */}
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 ml-1"
              style={{
                fontFamily: "var(--font-chat)",
                fontSize: "clamp(7px,0.65vw,9px)",
                color: "#00f3ffaa",
                textDecoration: "none",
                whiteSpace: "nowrap",
                padding: "2px 5px",
                border: "1px solid rgba(0,243,255,0.25)",
                borderRadius: 3,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              ↗ Original
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
