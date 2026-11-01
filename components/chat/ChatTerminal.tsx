"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ChatMessageComponent from "./ChatMessage";
import ChatInput from "./ChatInput";
import PresenceCounter from "./PresenceCounter";
import CRTOverlay from "@/components/ui/CRTOverlay";
import GlassPanel from "@/components/ui/GlassPanel";
import type { ChatMessage } from "@/lib/realtime/chat";

interface ChatTerminalProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  presenceCount: number;
  isConnected: boolean;
  currentUserId?: string;
  currentUsername?: string;
  isAuthenticated?: boolean;
  inputError?: string | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
  onInputFocusChange?: (focused: boolean) => void;
}

const TOPIC_TAGS = ["#Stunts", "#ViceRP", "#Maps", "#Vehicles"] as const;

export default function ChatTerminal({
  messages,
  onSendMessage,
  presenceCount,
  isConnected,
  currentUserId,
  currentUsername = "Driver",
  isAuthenticated = false,
  inputError = null,
  onOpenAuth,
  onSignOut,
  onOpenProfile,
  onInputFocusChange,
}: ChatTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 45;
    setAutoScroll(isAtBottom);
  }, []);

  const visibleMessages = activeTagFilter
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(activeTagFilter.toLowerCase())
      )
    : messages;

  return (
    <GlassPanel
      neonBorder="cyan"
      className="relative flex flex-col flex-1 min-h-[300px] overflow-hidden bg-[#07081c]/90"
    >
      {/* CRT Scanline & Phosphor Vignette strictly on the Terminal UI Chrome */}
      <CRTOverlay />

      {/* ── Terminal Header Bar ── */}
      <div className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-[#00f3ff]/25 bg-[#0c0622]/90">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              isConnected ? "bg-[#39ff14]" : "bg-[#ff6b00] animate-pulse"
            }`}
            style={{
              boxShadow: isConnected ? "0 0 8px #39ff14" : "0 0 8px #ff6b00",
            }}
          />
          <span
            className="text-[#ffdd00] text-[11px] font-[family-name:var(--font-display)] font-black tracking-[0.16em] uppercase truncate"
            style={{ textShadow: "0 0 8px rgba(255,221,0,0.45)" }}
          >
            💬 CHAT ROOM — LIVE FEED
          </span>
        </div>

        {/* Auth & Garage Profile Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="px-2 py-0.5 rounded text-[9px] font-[family-name:var(--font-display)] font-bold bg-white/5 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/30 transition-colors cursor-pointer"
              title="Customize Vehicle, Plate & 3D Horn"
            >
              ⚙ GARAGE
            </button>
          )}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onSignOut}
              className="px-2 py-0.5 rounded text-[9px] font-[family-name:var(--font-display)] font-black bg-[#ff007f]/20 hover:bg-[#ff007f]/35 text-[#ff007f] border border-[#ff007f]/45 transition-colors cursor-pointer"
              title={`Signed in as ${currentUsername} — Click to sign out`}
            >
              EXIT
            </button>
          ) : (
            onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-2.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-display)] font-black bg-[#00f3ff]/20 hover:bg-[#00f3ff]/35 text-white border border-[#00f3ff]/50 transition-colors cursor-pointer shadow-[0_0_10px_rgba(0,243,255,0.25)]"
              >
                JOIN
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Presence Counter & Popular Topics Bar ── */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10 bg-[#050616]/80">
        <PresenceCounter count={presenceCount} />

        <div className="flex items-center gap-1 overflow-x-auto">
          {TOPIC_TAGS.map((tag) => {
            const active = activeTagFilter === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setActiveTagFilter((prev) => (prev === tag ? null : tag))
                }
                className="px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-chat)] transition-colors cursor-pointer shrink-0"
                style={{
                  background: active
                    ? "rgba(255,0,127,0.28)"
                    : "rgba(255,255,255,0.05)",
                  color: active ? "#ff007f" : "#00f3ffaa",
                  border: active
                    ? "1px solid rgba(255,0,127,0.6)"
                    : "1px solid rgba(0,243,255,0.2)",
                }}
                title={`Filter or tag ${tag}`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Live Feed Scroll Container ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto chat-scroll py-1"
      >
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-1">
            <p className="text-[#00f3ff]/55 text-xs font-[family-name:var(--font-display)] tracking-wider uppercase">
              FM 88.6 TERMINAL READY
            </p>
            <p className="text-white/40 text-[11px] font-[family-name:var(--font-chat)]">
              {activeTagFilter
                ? `No messages tagged ${activeTagFilter} yet.`
                : `Parked as ${currentUsername}. Drop a message or flash your High-Beams [SPACE]!`}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => (
            <ChatMessageComponent key={msg.id} message={msg} />
          ))
        )}

        {/* Scroll-to-bottom indicator */}
        {!autoScroll && (
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                setAutoScroll(true);
              }
            }}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-[#ff007f] text-white text-[10px] font-[family-name:var(--font-display)] font-bold px-3 py-1 rounded-full hover:bg-[#ff007f]/85 transition-colors z-20 shadow-[0_0_12px_rgba(255,0,127,0.5)] cursor-pointer"
          >
            ↓ LIVE FEED
          </button>
        )}
      </div>

      {/* ── Moderation Error Banner ── */}
      {inputError && (
        <div className="relative z-20 px-3 py-1 bg-[#ff6b00]/20 border-t border-[#ff6b00]/50 text-[#ffdd00] text-[10px] font-[family-name:var(--font-chat)]">
          ⚠ {inputError}
        </div>
      )}

      {/* ── Terminal Input Row ── */}
      <div
        className="relative z-10"
        onFocusCapture={() => onInputFocusChange?.(true)}
        onBlurCapture={() => onInputFocusChange?.(false)}
      >
        <ChatInput
          onSend={onSendMessage}
          disabled={!currentUserId}
          placeholder={`Transmit as ${currentUsername}...`}
        />
      </div>
    </GlassPanel>
  );
}
