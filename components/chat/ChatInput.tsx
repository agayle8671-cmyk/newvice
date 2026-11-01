"use client";

import { useState, useRef, useCallback } from "react";
import { filterMessage } from "@/lib/moderation/filter";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your message...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    const result = filterMessage(trimmed);
    if (!result.allowed) {
      setError(result.reason || "Message blocked");
      setTimeout(() => setError(null), 3000);
      return;
    }

    onSend(trimmed);
    setValue("");
    setError(null);
    inputRef.current?.focus();
  }, [value, disabled, onSend]);

  return (
    <div className="relative">
      {/* Error tooltip */}
      {error && (
        <div className="absolute -top-8 left-0 right-0 text-center">
          <span className="text-xs text-vice-orange font-[family-name:var(--font-chat)] bg-surface-dark/90 px-3 py-1 rounded-full border border-vice-orange/30">
            {error}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 p-2 border-t border-vice-cyan/10">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={disabled ? "Sign in to chat..." : placeholder}
          disabled={disabled}
          maxLength={500}
          autoComplete="off"
          className="flex-1 bg-surface-input border border-vice-cyan/20 rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-chat)] text-gray-200 placeholder:text-vice-cyan/30 focus:outline-none focus:border-vice-pink/50 focus:shadow-[0_0_10px_rgba(255,0,127,0.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-gradient-to-r from-vice-pink to-vice-magenta text-white text-xs font-[family-name:var(--font-display)] font-bold tracking-wider rounded-lg hover:shadow-[0_0_15px_rgba(255,0,127,0.5)] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          SEND
        </button>
      </div>
    </div>
  );
}
