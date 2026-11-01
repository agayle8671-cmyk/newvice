"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import ChatMessageComponent from "./ChatMessage";
import ChatInput from "./ChatInput";
import PresenceCounter from "./PresenceCounter";
import CRTOverlay from "@/components/ui/CRTOverlay";
import type { ChatMessage } from "@/lib/realtime/chat";

interface ChatTerminalProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  presenceCount: number;
  isConnected: boolean;
  currentUserId?: string;
}

export default function ChatTerminal({
  messages,
  onSendMessage,
  presenceCount,
  isConnected,
  currentUserId,
}: ChatTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.6 }}
      className="relative w-full max-w-5xl mx-auto mt-2 px-2 sm:px-4"
    >
      <div className="relative glass-panel rounded-lg overflow-hidden neon-border-cyan">
        {/* CRT Scanlines */}
        <CRTOverlay />

        {/* Terminal Header */}
        <div className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-vice-cyan/20 bg-vice-deep-purple/50">
          <div className="flex items-center gap-2">
            <span className="text-vice-cyan text-xs font-[family-name:var(--font-display)] tracking-widest">
              💬 CHAT ROOM — LIVE FEED
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-neon-green" : "bg-vice-orange animate-pulse"}`} />
            <span className="text-[10px] font-[family-name:var(--font-chat)] text-vice-cyan/50">
              {isConnected ? "CONNECTED" : "CONNECTING..."}
            </span>
          </div>
        </div>

        {/* Presence */}
        <div className="relative z-10">
          <PresenceCounter count={presenceCount} />
        </div>

        {/* Messages Area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative z-10 h-48 sm:h-64 overflow-y-auto chat-scroll"
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-vice-cyan/30 text-sm font-[family-name:var(--font-chat)]">
                No messages yet. Be the first to say something!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessageComponent key={msg.id} message={msg} />
            ))
          )}

          {/* Scroll to bottom indicator */}
          {!autoScroll && (
            <button
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  setAutoScroll(true);
                }
              }}
              className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-vice-pink/80 text-white text-[10px] font-[family-name:var(--font-chat)] px-3 py-1 rounded-full hover:bg-vice-pink transition-colors z-20"
            >
              ↓ New messages
            </button>
          )}
        </div>

        {/* Input Area */}
        <div className="relative z-10">
          <ChatInput
            onSend={onSendMessage}
            disabled={!currentUserId}
            placeholder={!currentUserId ? "Sign in to join the conversation..." : "Type your message..."}
          />
        </div>
      </div>
    </motion.div>
  );
}
