"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { VideoItem } from "@/lib/video/types";

interface NowPlayingProps {
  item: VideoItem | null;
}

export default function NowPlaying({ item }: NowPlayingProps) {
  return (
    <div
      className="w-full flex items-center gap-2 overflow-hidden"
      style={{
        height: "100%",
        background: "#04050f",
        borderTop: "1px solid rgba(0,243,255,0.12)",
        padding: "0 10px",
      }}
    >
      <AnimatePresence mode="wait">
        {item ? (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-2 w-full min-w-0"
          >
            {/* Pulse dot */}
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00f3ff] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00f3ff]" />
            </span>

            {/* Label */}
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-widest uppercase shrink-0"
              style={{
                fontSize: "clamp(6px,0.6vw,8px)",
                color: "#00f3ff66",
              }}
            >
              NOW SHOWING
            </span>

            {/* Divider */}
            <span style={{ color: "#ffffff22", fontSize: 10 }}>▸</span>

            {/* Title */}
            <span
              className="font-[family-name:var(--font-chat)] truncate"
              style={{
                fontSize: "clamp(8px,0.78vw,11px)",
                color: "#e0e0e0cc",
              }}
              title={item.title}
            >
              {item.title}
            </span>

            {/* By */}
            <span
              className="font-[family-name:var(--font-chat)] shrink-0"
              style={{
                fontSize: "clamp(7px,0.7vw,10px)",
                color: "#ffffff44",
              }}
            >
              by
            </span>

            {/* Creator link */}
            <a
              href={item.creatorUrl || item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 hover:underline"
              style={{
                fontSize: "clamp(7px,0.7vw,10px)",
                fontFamily: "var(--font-chat)",
                color: "#00f3ffaa",
                textDecoration: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {item.platformIcon} {item.creatorName}
            </a>

            {/* Platform */}
            <span
              className="shrink-0"
              style={{
                fontSize: "clamp(6px,0.6vw,8px)",
                fontFamily: "var(--font-chat)",
                color: "#ffffff33",
              }}
            >
              on {item.platform}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-widest uppercase"
              style={{
                fontSize: "clamp(6px,0.6vw,8px)",
                color: "#00f3ff33",
              }}
            >
              ◌ PROJECTOR WARMING UP...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
