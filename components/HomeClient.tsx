"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/auth/context";
import AuthModal from "@/components/auth/AuthModal";
import ProfileModal from "@/components/profile/ProfileModal";
import VideoEngine from "@/components/video-engine/VideoEngine";
import NowPlaying from "@/components/video-engine/NowPlaying";
import { filterMessage } from "@/lib/moderation/filter";
import type { ChatMessage } from "@/lib/realtime/chat";
import type { RealtimeChannel } from "@supabase/supabase-js";

const DEFAULT_VIDEO_ID = "QdBZY2fkU-0";

// ─── QWERTY KEY POSITIONS (0..1 within the keyboard canvas area) ─────────────
// x = horizontal fraction, y = row fraction
const QWERTY_ROWS = [
  { chars: "QWERTYUIOP".split(""), y: 0.22, x0: 0.04, x1: 0.96 },
  { chars: "ASDFGHJKL".split(""),  y: 0.52, x0: 0.10, x1: 0.90 },
  { chars: "ZXCVBNM".split(""),    y: 0.78, x0: 0.18, x1: 0.82 },
];
const KEY_POS: Record<string, [number, number]> = {};
QWERTY_ROWS.forEach(({ chars, y, x0, x1 }) => {
  chars.forEach((c, i) => {
    KEY_POS[c] = [x0 + (i / (chars.length - 1)) * (x1 - x0), y];
  });
});
KEY_POS[" "] = [0.5, 0.92]; // space bar centre

type GlowKey = { x: number; y: number; born: number; color: string };

// Convert hex colour + 0‥1 alpha → rgba() string for canvas
function hexAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

interface HomeClientProps {
  roomSlug?: string;
  roomTitle?: string;
  videoId?: string;
}

// ─── PIXEL-PERFECT COORDINATES (1408 × 768 source) ──────────────────────────
//
//  All values derived from actual pixel scanning of drive-in-background.jpg.
//  The container is locked to the same 1408/768 aspect ratio and uses
//  object-fill, so percentage values map 1:1 to the painted artwork.
//
//  ELEMENT               PX (L, T, W, H)      % (L, T, W, H)
//  ─────────────────────────────────────────────────────────────
//  Movie screen inner    367, 140, 676, 270    26.07, 18.23, 48.01, 35.16
//  Chat body only        300, 442,  820,  34   21.31, 57.55, 58.24,  4.43
//  Input field           472, 676,  368,  50   33.52, 88.02, 26.14,  6.51
//  SEND button           851, 676,   89,  50   60.44, 88.02,  6.32,  6.51
//  Popular topics panel  175, 242,  118, 135   12.43, 31.51,  8.38, 17.58
//  JOIN button rect     1100, 326,   65,  30   78.13, 42.45,  4.62,  3.91

export default function HomeClient({
  roomSlug = "main-theater",
  roomTitle,
  videoId = DEFAULT_VIDEO_ID,
}: HomeClientProps) {
  const { user, profile, isLoading, setShowAuthModal, signOut } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presenceCount, setPresenceCount] = useState(24);
  const [isConnected, setIsConnected] = useState(false);
  const [guestId, setGuestId] = useState("guest_loading");
  const [guestName, setGuestName] = useState("User");
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentVideoItem, setCurrentVideoItem] = useState<import("@/lib/video/types").VideoItem | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Derived auth state — declared here so keyboard glow effects can reference them
  const currentUserId = user ? user.id : guestId;
  const currentUsername = profile?.username ?? guestName;
  const currentBadge = profile?.vehicle_badge ?? "muscle_car";
  const currentBadgeColor = profile?.badge_color ?? "#ff007f";
  const isAuthenticated = !!user;

  // ── Keyboard glow canvas ────────────────────────────────────────────────────
  const kbCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowKeys   = useRef<GlowKey[]>([]);
  const animRef    = useRef<number>(0);
  const prevLen    = useRef(0);
  const GLOW_DURATION = 550; // ms

  // Animation loop — runs while component is mounted
  useEffect(() => {
    const canvas = kbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function frame() {
      const now = Date.now();
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      glowKeys.current = glowKeys.current.filter(
        (k) => now - k.born < GLOW_DURATION
      );

      for (const k of glowKeys.current) {
        const t = (now - k.born) / GLOW_DURATION; // 0→1
        const alpha = Math.pow(1 - t, 1.8);        // fast fade
        const cx = k.x * canvas!.width;
        const cy = k.y * canvas!.height;
        const r  = 18 * (1 - t * 0.5);            // shrinks slightly

        // Outer neon halo
        const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r * 3.5);
        grad.addColorStop(0,   hexAlpha(k.color, alpha * 0.85));
        grad.addColorStop(0.5, hexAlpha(k.color, alpha * 0.35));
        grad.addColorStop(1,   hexAlpha(k.color, 0));
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r * 3.5, 0, Math.PI * 2);
        ctx!.fill();

        // Bright core
        ctx!.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx!.fill();
      }

      animRef.current = requestAnimationFrame(frame);
    }
    frame();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Spawn a glow on each new character typed
  useEffect(() => {
    const newLen = inputValue.length;
    if (newLen > prevLen.current) {
      const char = inputValue[newLen - 1].toUpperCase();
      const isSpace = char === " ";
      const color = "#00f3ff"; // default cyan; badge color applied after mount

      if (isSpace) {
        glowKeys.current.push(
          { x: 0.5,  y: 0.92, born: Date.now(),      color: "#ff007f" },
          { x: 0.35, y: 0.92, born: Date.now() - 40, color: "#ff007f" },
          { x: 0.65, y: 0.92, born: Date.now() - 80, color: "#ff007f" }
        );
      } else {
        const pos = KEY_POS[char] ?? [
          Math.random() * 0.7 + 0.15,
          Math.random() * 0.6 + 0.15,
        ];
        glowKeys.current.push({ x: pos[0], y: pos[1], born: Date.now(), color });
      }
    }
    prevLen.current = newLen;
  }, [inputValue]);

  // Send pulse — wave across all keys
  const triggerSendPulse = useCallback(() => {
    const now = Date.now();
    const allKeys = Object.values(KEY_POS);
    allKeys.forEach(([x, y], i) => {
      glowKeys.current.push({
        x, y, color: "#00f3ff", born: now + i * 18,
      });
    });
  }, []);

  useEffect(() => {
    const num = Math.floor(Math.random() * 899) + 100;
    setGuestId(`guest_${num}`);
    setGuestName(`User${num}`);
  }, []);

  useEffect(() => {
    if (autoScroll && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleChatScroll = useCallback(() => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  }, []);

  const isDemoMode = useRef(true); // flipped to false only when live Supabase confirmed

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const live = url.startsWith("https://") && key.length > 10;

    setIsConnected(true);
    setPresenceCount(Math.floor(Math.random() * 25) + 18);

    if (!live) {
      // DEMO MODE — zero network, zero Supabase, pure local React state.
      // Chat is blank. Only messages you send appear. Nothing persists.
      isDemoMode.current = true;
      return;
    }

    // LIVE MODE — real Supabase realtime
    isDemoMode.current = false;
    async function connectRealtime() {
      try {
        const { subscribeToChatRoom } = await import("@/lib/realtime/chat");
        const channel = subscribeToChatRoom(roomSlug, currentUserId, {
          onMessage: (message) =>
            setMessages((prev) => [...prev.slice(-150), message]),
          onPresenceUpdate: (count) => setPresenceCount(count),
        });
        channelRef.current = channel;
      } catch {
        isDemoMode.current = true;
      }
    }
    connectRealtime();

    return () => {
      const ch = channelRef.current;
      if (ch) {
        import("@/lib/supabase/client")
          .then(({ createClient }) => createClient().removeChannel(ch))
          .catch(() => {});
      }
    };
  }, [currentUserId, roomSlug]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const filterResult = filterMessage(content);
      if (!filterResult.allowed) {
        setInputError(filterResult.reason || "Message blocked");
        setTimeout(() => setInputError(null), 3000);
        return;
      }

      const message: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: currentUserId,
        username: currentUsername,
        vehicleBadge: currentBadge,
        badgeColor: currentBadgeColor,
        content,
        isAnnouncement: false,
        createdAt: new Date().toISOString(),
      };

      // Demo mode: purely local — never touch Supabase
      if (isDemoMode.current || !channelRef.current) {
        setMessages((prev) => [...prev.slice(-150), message]);
        return;
      }

      // Live mode: broadcast + persist
      try {
        const { sendChatMessage, persistMessage } = await import(
          "@/lib/realtime/chat"
        );
        await sendChatMessage(channelRef.current, message);
        if (isAuthenticated) {
          persistMessage(roomSlug, currentUserId, content).catch(() => {});
        }
      } catch {
        setMessages((prev) => [...prev.slice(-150), message]);
      }
    },
    [
      currentUserId,
      currentUsername,
      currentBadge,
      currentBadgeColor,
      isAuthenticated,
      roomSlug,
    ]
  );

  const handleInputSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      triggerSendPulse();
      handleSendMessage(trimmed);
      setInputValue("");
    },
    [inputValue, handleSendMessage, triggerSendPulse]
  );

  return (
    <div className="relative w-screen h-screen bg-[#020008] flex items-center justify-center overflow-hidden select-none">
      <AuthModal />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CANVAS — locked to 1408:768 aspect ratio.
          CSS calc ensures it fills viewport width OR height, whichever
          hits the boundary first, exactly like object-contain but we
          maintain full control over child positioning.
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="relative overflow-hidden"
        style={{
          width: "100vw",
          height: "100vh",
        }}
      >
        {/* ── BACKGROUND: Concept-art fills container via object-fill ── */}
        <Image
          src="/images/drive-in-background.jpg"
          alt="Leonida Vice Drive-In Theater"
          fill
          priority
          sizes="100vw"
          className="object-fill pointer-events-none select-none"
          draggable={false}
        />

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: STATUS BAR  (top-right, outside painted elements)
        ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute top-[2%] right-[1.5%] z-40 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/70 border border-[#00f3ff]/25 rounded-full px-2.5 py-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39ff14] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#39ff14]" />
            </span>
            <span
              className="font-[family-name:var(--font-chat)] tracking-wider text-[#39ff14]"
              style={{ fontSize: "clamp(8px,0.85vw,11px)" }}
            >
              {presenceCount} CARS PARKED
            </span>
          </div>
          <button
            onClick={() => setIsVideoPlaying((p) => !p)}
            className="bg-black/70 border border-[#00f3ff]/25 rounded-full px-2 py-0.5 text-[#00f3ff] hover:text-[#ff007f] hover:border-[#ff007f]/30 transition-colors font-[family-name:var(--font-chat)]"
            style={{ fontSize: "clamp(7px,0.75vw,10px)" }}
            title="Toggle screen"
          >
            {isVideoPlaying ? "📺 LIVE" : "🖼️ ART"}
          </button>
          <button
            onClick={() => setShowProfileModal(true)}
            className="bg-black/70 border border-[#00f3ff]/25 rounded-full px-2 py-0.5 text-[#00f3ff] hover:text-[#ffdd00] hover:border-[#ffdd00]/30 transition-colors font-[family-name:var(--font-chat)]"
            style={{ fontSize: "clamp(7px,0.75vw,10px)" }}
            title="Profile Settings"
          >
            ⚙
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: MOVIE SCREEN
            Screen:      L=26.07%, T=18.23%, W=48.01%, H=35.16%
            Now Playing: L=26.07%, T=53.39%, W=48.01%, H=2.5%
            VideoEngine handles seamless double-buffer HLS/MP4 playback.
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-10 overflow-hidden"
          style={{
            left: "26.07%",
            top: "18.23%",
            width: "48.01%",
            height: "35.16%",
            background: "#000",
          }}
        >
          {isVideoPlaying ? (
            <>
              <VideoEngine onItemChange={setCurrentVideoItem} />
              {/* CRT scanline overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-10 opacity-15"
                style={{
                  background:
                    "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,1) 2px,rgba(0,0,0,1) 4px)",
                  mixBlendMode: "multiply",
                }}
              />
            </>
          ) : (
            <button
              onClick={() => setIsVideoPlaying(true)}
              className="w-full h-full flex items-center justify-center bg-black group"
            >
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 border border-[#ff007f]/50 px-4 py-2 rounded text-[#ff007f] tracking-wider font-[family-name:var(--font-display)] font-bold shadow-[0_0_20px_rgba(255,0,127,0.5)]" style={{fontSize:"clamp(9px,0.9vw,13px)"}}>
                ▶ START PROJECTOR
              </span>
            </button>
          )}
        </div>

        {/* Now Playing bar — just below the screen bezel */}
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: "26.07%",
            top: "53.39%",
            width: "48.01%",
            height: "2.2%",
          }}
        >
          <NowPlaying item={isVideoPlaying ? currentVideoItem : null} />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: POPULAR TOPICS  — INVISIBLE HIT AREAS ONLY
            Zero visible rendering. Pure transparent click targets.
            The painted art already shows the text — we never duplicate it.
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-20"
          style={{
            left: "12.43%",
            top: "31.51%",
            width: "8.38%",
            height: "17.58%",
          }}
        >
          {/* Three fully transparent hit zones — no bg, no border, no outline, no hover style */}
          {(["#Maps ", "#Vehicles ", "#Story "] as const).map(
            (tag, i) => (
              <button
                key={tag}
                onClick={() => setInputValue((v) => `${v}${tag}`)}
                title={`Topic: ${tag.replace("#", "").trim()}`}
                style={{
                  position: "absolute",
                  inset: "auto 0 auto 0",
                  top: `${38 + i * 20}%`,
                  height: "20%",
                  background: "none",
                  border: "none",
                  outline: "none",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                  boxShadow: "none",
                  padding: 0,
                  margin: 0,
                }}
              />
            )
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: JOIN BUTTON
            Covers ONLY the small painted "Button" pill inside the right
            wing panel. The "JOIN THE CONVERSATION" label is painted art
            — we never render text on top of that area.
            Pixel rect: L=1100, T=326, W=65, H=30 → L=78.13%, T=42.45%
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-20"
          style={{
            left: "78.13%",
            top: "42.45%",
            width: "4.62%",
            height: "3.91%",
          }}
        >
          {isAuthenticated && profile ? (
            <button
              onClick={() => signOut()}
              style={{
                width: "100%",
                height: "100%",
                background: "rgba(26,5,53,0.85)",
                border: "none",
                outline: "none",
                cursor: "pointer",
                color: "#ff007f",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                letterSpacing: "0.1em",
                fontSize: "clamp(6px,0.65vw,9px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "3px",
              }}
              title={`Exit — ${profile.username}`}
            >
              EXIT
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              style={{
                width: "100%",
                height: "100%",
                background: "rgba(26,5,53,0.85)",
                border: "none",
                outline: "none",
                cursor: "pointer",
                color: "#ffffff",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                letterSpacing: "0.1em",
                fontSize: "clamp(6px,0.65vw,9px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "3px",
                WebkitTapHighlightColor: "transparent",
              }}
              title="Join the Conversation"
            >
              JOIN
            </button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: FULL CHAT PANEL (header + messages body)
            The painted "CHAT ROOM – LIVE FEED" header AND the painted
            demo messages below it ALL live between y=425–515 in the
            1408×768 image. We must cover the entire band with an opaque
            overlay so zero painted text bleeds through.

            Full panel: L=270, T=425, W=870, H=90 → 1408×768
            Pct:        L=19.18%, T=55.34%, W=61.79%, H=11.72%

            Inside we render our own HTML header strip + scrollable body.
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-20 overflow-hidden flex flex-col"
          style={{
            left: "19.18%",
            top: "55.34%",
            width: "61.79%",
            height: "14.50%",
            background: "#08091e",
          }}
        >
          {/* ── HTML header row — replaces painted "CHAT ROOM – LIVE FEED" ── */}
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              height: "28%",
              background: "#0a0b26",
              borderBottom: "1px solid rgba(0,243,255,0.25)",
            }}
          >
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-[0.2em] uppercase"
              style={{
                fontSize: "clamp(7px,0.8vw,11px)",
                color: "#ffdd00",
                textShadow: "0 0 8px rgba(255,221,0,0.7)",
              }}
            >
              ● CHAT ROOM – LIVE FEED
            </span>
          </div>

          {/* ── Scrollable messages body ── */}
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto px-2 py-1 flex flex-col justify-start"
            style={{ scrollBehavior: "smooth", scrollbarWidth: "none" }}
          >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-baseline gap-1 leading-none shrink-0"
                style={{ paddingBottom: "2px" }}
              >
                <span
                  className="font-[family-name:var(--font-display)] font-bold shrink-0"
                  style={{
                    fontSize: "clamp(8px,0.8vw,11px)",
                    color: msg.isAnnouncement
                      ? "#ffdd00"
                      : msg.badgeColor || "#00f3ff",
                    textShadow: `0 0 4px ${
                      msg.isAnnouncement
                        ? "#ffdd0077"
                        : (msg.badgeColor || "#00f3ff") + "77"
                    }`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {msg.username}:
                </span>
                <span
                  style={{
                    fontSize: "clamp(8px,0.8vw,11px)",
                    fontFamily: "var(--font-chat)",
                    color: msg.isAnnouncement ? "#ffea75" : "#e0e0e0",
                    textShadow: "0 0 3px rgba(255,255,255,0.2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {msg.content}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          </div>

          {/* Live scroll button */}
          {!autoScroll && (
            <button
              onClick={() => {
                if (chatScrollRef.current) {
                  chatScrollRef.current.scrollTop =
                    chatScrollRef.current.scrollHeight;
                  setAutoScroll(true);
                }
              }}
              className="absolute bottom-1 right-1 bg-[#ff007f] text-white font-[family-name:var(--font-chat)] px-1 py-0 rounded-full z-30"
              style={{ fontSize: "clamp(7px,0.7vw,9px)" }}
            >
              ↓
            </button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: INPUT FIELD
            Scanned: L=472, T=676, W=368, H=50 → 1408×768
            Pct: L=33.52%, T=88.02%, W=26.14%, H=6.51%
            Background: #07081a sampled from painted console keyboard area
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-30"
          style={{
            left: "33.52%",
            top: "88.02%",
            width: "26.14%",
            height: "6.51%",
          }}
        >
          {inputError && (
            <div className="absolute -top-5 left-0 right-0 text-center pointer-events-none z-40">
              <span
                className="text-[#ff6b00] font-[family-name:var(--font-chat)] bg-black/90 px-2 py-0.5 rounded border border-[#ff6b00]/50"
                style={{ fontSize: "clamp(7px,0.7vw,9px)" }}
              >
                ⚠ {inputError}
              </span>
            </div>
          )}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={
              isLoading
                ? "Tuning radio..."
                : isAuthenticated
                ? `Chat as ${currentUsername}...`
                : "TYPE YOUR MESSAGE..."
            }
            maxLength={500}
            autoComplete="off"
            className="w-full h-full outline-none border-none text-white font-[family-name:var(--font-chat)] tracking-wider px-2 focus:ring-0 transition-all"
            style={{
              fontSize: "clamp(9px,0.9vw,13px)",
              background: "#07081a",
              caretColor: "#00f3ff",
              boxShadow: inputFocused
                ? "inset 0 0 0 1px rgba(0,243,255,0.6), 0 0 12px rgba(0,243,255,0.25)"
                : "none",
              transition: "box-shadow 0.2s ease",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleInputSubmit();
              }
            }}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: SEND BUTTON
            Scanned: L=851, T=676, W=89, H=50 → 1408×768
            Pct: L=60.44%, T=88.02%, W=6.32%, H=6.51%
            The painted "SEND" label is visible in the art — we match it.
        ═══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute z-30"
          style={{
            left: "60.44%",
            top: "88.02%",
            width: "6.32%",
            height: "6.51%",
          }}
        >
          <button
            onClick={() => handleInputSubmit()}
            disabled={!inputValue.trim()}
            className="w-full h-full flex items-center justify-center font-[family-name:var(--font-display)] font-black tracking-widest uppercase active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            style={{
              fontSize: "clamp(8px,0.85vw,12px)",
              background: inputValue.trim() ? "#0d4070" : "#0b3460",
              color: inputValue.trim() ? "#00f3ff" : "#00f3ff88",
              textShadow: inputValue.trim() ? "0 0 12px rgba(0,243,255,1)" : "none",
              boxShadow: inputValue.trim()
                ? "0 0 15px rgba(0,243,255,0.4), inset 0 0 10px rgba(0,243,255,0.1)"
                : "none",
              transition: "all 0.15s ease",
            }}
          >
            SEND
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER: KEYBOARD GLOW CANVAS
            Transparent canvas sits over the painted keyboard console.
            Each keypress paints a neon glow burst at the QWERTY position.
            Space → triple pink burst on space bar.
            Send  → cyan ripple wave across every key.

            Keyboard graphic occupies approx:
            L=23%, T=93%, W=54%, H=6.5% in the 1408×768 image.
        ═══════════════════════════════════════════════════════════════ */}
        <canvas
          ref={kbCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: "23%",
            top: "93%",
            width: "54%",
            height: "6.5%",
            zIndex: 25,
          }}
          width={756}
          height={50}
        />

        {/* ═══════════════════════════════════════════════════════════════
            FOOTER DISCLAIMER
        ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute bottom-[0.4%] left-0 right-0 text-center pointer-events-none z-20">
          <p
            className="text-[#00f3ff]/20 font-[family-name:var(--font-chat)] tracking-wider"
            style={{ fontSize: "clamp(6px,0.55vw,8px)" }}
          >
            LeonidaVice.com • Fan-Made Drive-In Community • Not affiliated with
            Rockstar Games or Take-Two Interactive.
          </p>
        </div>
      </div>
    </div>
  );
}
