"use client";

import { motion } from "framer-motion";
import type { ChatMessage as ChatMessageType } from "@/lib/realtime/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

const VEHICLE_ICONS: Record<string, string> = {
  muscle_car: "🚗",
  sports_car: "🏎️",
  truck: "🚛",
  synth_coupe: "⚡",
  lowrider: "🌴",
  vice_pd: "🚓",
  motorcycle: "🏍️",
  default: "🚗",
};

export default function ChatMessageComponent({ message }: ChatMessageProps) {
  const icon = VEHICLE_ICONS[message.vehicleBadge] || VEHICLE_ICONS.default;

  if (message.isAnnouncement) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        className="mx-2 my-1 px-2.5 py-1.5 rounded bg-[#ffdd00]/10 border border-[#ffdd00]/35 text-left"
      >
        <span
          className="text-[#ffdd00] font-[family-name:var(--font-chat)] text-xs leading-snug block"
          style={{ textShadow: "0 0 8px rgba(255, 221, 0, 0.55)" }}
        >
          📢 {message.content}
        </span>
      </motion.div>
    );
  }

  const badgeColor = message.badgeColor || "#ff007f";

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="group px-3 py-1.5 hover:bg-white/[0.04] transition-colors border-b border-white/[0.03]"
    >
      <div className="flex items-start gap-2">
        {/* Vehicle chassis badge */}
        <span
          className="text-xs mt-0.5 shrink-0 select-none"
          title={message.vehicleBadge}
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            {/* Driver Handle with CRT phosphor glow */}
            <span
              className="font-[family-name:var(--font-display)] text-[11px] font-bold tracking-wider truncate"
              style={{
                color: badgeColor,
                textShadow: `0 0 6px ${badgeColor}66`,
              }}
            >
              {message.username}
            </span>

            {/* Timestamp */}
            <span className="text-[9px] text-[#00f3ff]/40 font-[family-name:var(--font-chat)] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Message Body with subtle phosphor text shader */}
          <p
            className="text-xs text-[#f2f4ff] font-[family-name:var(--font-chat)] break-words leading-relaxed mt-0.5"
            style={{
              textShadow: "0 0 4px rgba(0, 243, 255, 0.16)",
            }}
          >
            {message.content}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
