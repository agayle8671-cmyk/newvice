"use client";

import { motion } from "framer-motion";
import type { ChatMessage as ChatMessageType } from "@/lib/realtime/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

const VEHICLE_ICONS: Record<string, string> = {
  muscle_car: "🚗",
  sports_car: "🏎️",
  truck: "🛻",
  lowrider: "🚙",
  motorcycle: "🏍️",
  default: "🚗",
};

export default function ChatMessageComponent({ message }: ChatMessageProps) {
  const icon = VEHICLE_ICONS[message.vehicleBadge] || VEHICLE_ICONS.default;

  if (message.isAnnouncement) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="px-3 py-1.5 text-center"
      >
        <span className="text-vice-yellow font-[family-name:var(--font-chat)] text-sm">
          📢 {message.content}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="group px-3 py-1 hover:bg-vice-purple/20 transition-colors"
    >
      <div className="flex items-start gap-2">
        {/* Vehicle badge */}
        <span className="text-sm mt-0.5 shrink-0">{icon}</span>

        <div className="min-w-0 flex-1">
          {/* Username */}
          <span
            className="font-[family-name:var(--font-display)] text-xs font-bold tracking-wide mr-2"
            style={{ color: message.badgeColor || "#ff007f" }}
          >
            {message.username}
          </span>

          {/* Timestamp */}
          <span className="text-[10px] text-vice-cyan/30 font-[family-name:var(--font-chat)] opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>

          {/* Message content */}
          <p className="text-sm text-gray-200 font-[family-name:var(--font-chat)] break-words leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
