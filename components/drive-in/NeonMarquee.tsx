"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getViceNightlyState,
  VICE_NIGHTLY_BLOCKS,
  type ActiveScheduleState,
} from "@/lib/schedule/vice-nightly";

// ─── NewVice V3 Neon Marquee Live Ticker & Drive-In Screen Tower ─────────────
// Matches the architectural diagram (image6.png) in Drive-In Platform Upgrade Strategy.docx:
//   • Top: Two-tier NEON MARQUEE LIVE TICKER (Brand + "Vice Nightly" EST Block + Wanted Level)
//   • Middle: High-clarity 16:9 Drive-In Screen & Ambient Glow Engine (zero CRT blur on video)
//   • Bottom: Architectural steel trusses + Downward Volumetric Screen Light Cone onto Row A/B/C

interface NeonMarqueeProps {
  children: React.ReactNode;
  nowPlayingBar?: React.ReactNode;
  encoreActive?: boolean;
  empGlitchActive?: boolean;
  wantedLevel?: 1 | 2 | 3 | 4 | 5;
  onChangeWantedLevel?: (stars: 1 | 2 | 3 | 4 | 5) => void;
}

export default function NeonMarquee({
  children,
  nowPlayingBar,
  encoreActive = false,
  empGlitchActive = false,
  wantedLevel = 2,
  onChangeWantedLevel,
}: NeonMarqueeProps) {
  const [schedule, setSchedule] = useState<ActiveScheduleState>(() =>
    getViceNightlyState()
  );
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSchedule(getViceNightlyState());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const marqueeBorderColor = encoreActive
    ? "#ffdd00"
    : wantedLevel >= 4
    ? "#ff6b00"
    : "#ff007f";

  return (
    <div className="relative w-full max-w-[900px] mx-auto flex flex-col items-center select-none">
      {/* ── 1. Elevated Two-Tier NEON MARQUEE LIVE TICKER Sign ────────────── */}
      <div className="relative z-30 flex flex-col items-center w-[92%] sm:w-[82%] -mb-1">
        {/* Top Sign: LEONIDAVICE.COM + Wanted Stars */}
        <div
          className="relative px-4 sm:px-6 py-1 rounded-t-xl flex items-center justify-between gap-4 w-full"
          style={{
            background: "linear-gradient(180deg, #16042c 0%, #090118 100%)",
            border: `1.5px solid ${marqueeBorderColor}`,
            borderBottom: "none",
            boxShadow: encoreActive
              ? "0 0 30px #ffdd00, 0 0 60px #00f3ff, inset 0 0 20px rgba(255,221,0,0.35)"
              : `0 0 20px ${marqueeBorderColor}66, inset 0 0 12px rgba(255,0,127,0.2)`,
          }}
        >
          {/* Left: Palm Icon + Brand */}
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base drop-shadow-[0_0_8px_#00f3ff]">
              🌴
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className="font-[family-name:var(--font-display)] font-black tracking-[0.18em] text-xs sm:text-sm"
                style={{
                  color: "#00f3ff",
                  textShadow: "0 0 10px rgba(0,243,255,0.85)",
                }}
              >
                LEONIDA
              </span>
              <span
                className="font-[family-name:var(--font-display)] font-black tracking-[0.18em] text-xs sm:text-sm"
                style={{
                  color: "#ff007f",
                  textShadow: "0 0 10px rgba(255,0,127,0.9)",
                }}
              >
                VICE.COM
              </span>
            </div>
          </div>

          {/* Center: Encore Surge Callout OR Tagline */}
          <span
            className="hidden md:inline-block font-[family-name:var(--font-display)] font-bold tracking-[0.2em] uppercase text-[9px]"
            style={{
              color: encoreActive ? "#ffdd00" : "rgba(255,255,255,0.65)",
              textShadow: encoreActive ? "0 0 12px #ffdd00" : "none",
            }}
          >
            {encoreActive
              ? "⚡ CROWD ENCORE SURGE • +15s REPLAY BOOST ⚡"
              : "24/7 SYNCHRONIZED GTA VI DRIVE-IN THEATER"}
          </span>

          {/* Right: Interactive 1–5★ Wanted Level World-State Indicator */}
          <div
            className="flex items-center gap-0.5 cursor-pointer"
            onClick={() => {
              if (!onChangeWantedLevel) return;
              const next = ((wantedLevel % 5) + 1) as 1 | 2 | 3 | 4 | 5;
              onChangeWantedLevel(next);
            }}
            title="World-State Wanted Level (Click to preview 1★–5★ Lockdown states)"
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= wantedLevel;
              return (
                <span
                  key={star}
                  className={`text-[10px] sm:text-xs transition-all ${
                    active && wantedLevel >= 4 ? "animate-pulse" : ""
                  }`}
                  style={{
                    color: active
                      ? wantedLevel === 5
                        ? "#ff007f"
                        : "#ffdd00"
                      : "rgba(255,255,255,0.18)",
                    textShadow: active ? "0 0 8px #ffdd00" : "none",
                  }}
                >
                  ★
                </span>
              );
            })}
          </div>
        </div>

        {/* Lower Marquee Strip: LIVE TICKER ("Vice Nightly" Scheduled Block + Countdown) */}
        <button
          type="button"
          onClick={() => setShowGuide((p) => !p)}
          className="w-[104%] px-3 py-1 rounded-md flex items-center justify-between gap-2 cursor-pointer transition-all"
          style={{
            background: "linear-gradient(90deg, #0b021d 0%, #1d0538 50%, #0b021d 100%)",
            border: `1px solid ${schedule.currentBlock.accentColor}88`,
            boxShadow: `0 0 16px ${schedule.currentBlock.accentColor}33`,
          }}
          title="Click to open the Vice Nightly EST Broadcast Schedule"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-1.5 py-0.2 rounded text-[8px] font-[family-name:var(--font-display)] font-black uppercase bg-[#ff007f] text-white shrink-0">
              LIVE TICKER
            </span>
            <span className="text-xs shrink-0">{schedule.currentBlock.badgeIcon}</span>
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-wider uppercase truncate text-[10px] sm:text-xs"
              style={{ color: schedule.currentBlock.accentColor }}
            >
              {schedule.currentBlock.title}
            </span>
            <span className="hidden sm:inline font-[family-name:var(--font-chat)] text-[11px] text-white/60 truncate">
              — {schedule.currentBlock.tagline}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(0,243,255,0.1)",
                color: "#00f3ff",
                border: "1px solid rgba(0,243,255,0.28)",
              }}
            >
              {schedule.currentBlock.isPremiereBlock
                ? `ENDS IN ${schedule.countdownLabel}`
                : `NEXT: ${schedule.nextBlock.shortTitle} (${schedule.countdownLabel})`}
            </span>
            <span className="text-[9px] text-white/50">▾</span>
          </div>
        </button>

        {/* Vice Nightly Schedule Popover */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="absolute top-full mt-1.5 z-50 w-[min(440px,92vw)] rounded-xl p-3.5"
              style={{
                background: "rgba(7, 5, 22, 0.97)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(0,243,255,0.4)",
                boxShadow: "0 0 40px rgba(0,0,0,0.85), 0 0 25px rgba(0,243,255,0.2)",
              }}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="font-[family-name:var(--font-display)] font-black text-[10px] tracking-[0.18em] uppercase text-[#00f3ff]">
                  📺 VICE NIGHTLY APPOINTMENT SCHEDULE ({schedule.estClockLabel})
                </span>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="text-white/50 hover:text-white text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1.5">
                {VICE_NIGHTLY_BLOCKS.map((blk) => {
                  const isLive = schedule.currentBlock.id === blk.id;
                  const hrs =
                    blk.id === "mod_matinee"
                      ? "18:00–20:00 EST"
                      : blk.id === "prime_countdown"
                      ? "21:00–22:00 EST"
                      : blk.id === "rp_late_show"
                      ? "23:00–01:00 EST"
                      : "01:00–04:00 EST";
                  return (
                    <div
                      key={blk.id}
                      className="rounded-lg p-2 flex flex-col gap-0.5"
                      style={{
                        background: isLive
                          ? `${blk.accentColor}22`
                          : "rgba(255,255,255,0.03)",
                        border: isLive
                          ? `1px solid ${blk.accentColor}`
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="font-[family-name:var(--font-display)] font-bold text-[10px] uppercase"
                          style={{ color: blk.accentColor }}
                        >
                          {blk.badgeIcon} {blk.title}
                        </span>
                        <span className="font-mono text-[9px] text-white/70">
                          {isLive ? "● ON AIR NOW" : hrs}
                        </span>
                      </div>
                      <p className="text-[10px] font-[family-name:var(--font-chat)] text-white/65">
                        {blk.tagline}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 2. Drive-In Screen Frame & Ambient Glow Engine ────────────────── */}
      <div className="relative z-20 w-full">
        {/* Outer Ambient Screen Aura */}
        <div
          className="absolute -inset-2 sm:-inset-3 rounded-2xl pointer-events-none blur-md"
          style={{
            background:
              "linear-gradient(135deg, rgba(var(--vice-aura-top, 0,243,255), 0.35), rgba(var(--vice-aura-bot, 255,0,127), 0.35))",
          }}
        />

        {/* Steel Truss Wing Finials (Left & Right Outdoor Drive-In Speakers) */}
        <div
          className="hidden sm:flex absolute -left-5 top-1/2 -translate-y-1/2 w-4 h-[72%] rounded-l-md flex-col items-center justify-around py-2 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, #16062d 0%, #080114 100%)",
            border: "1px solid rgba(0,243,255,0.3)",
            borderRight: "none",
          }}
        >
          <span className="w-2 h-2 rounded-full bg-[#00f3ff]/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff007f]/50 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-[#00f3ff]/40" />
        </div>
        <div
          className="hidden sm:flex absolute -right-5 top-1/2 -translate-y-1/2 w-4 h-[72%] rounded-r-md flex-col items-center justify-around py-2 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, #16062d 0%, #080114 100%)",
            border: "1px solid rgba(0,243,255,0.3)",
            borderLeft: "none",
          }}
        >
          <span className="w-2 h-2 rounded-full bg-[#00f3ff]/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff007f]/50 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-[#00f3ff]/40" />
        </div>

        {/* Main 16:9 Screen Bezel */}
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{
            border: encoreActive
              ? "2px solid #ffdd00"
              : "2px solid rgba(255, 0, 127, 0.85)",
            boxShadow: encoreActive
              ? "0 0 35px rgba(255,221,0,0.85), 0 0 70px rgba(0,243,255,0.5)"
              : "0 0 28px rgba(255,0,127,0.45), 0 0 60px rgba(0,243,255,0.2)",
          }}
        >
          <div className="relative w-full aspect-video max-h-[38vh] sm:max-h-[42vh] bg-black">
            {children}

            {/* EMP CRT Glitch Sweep (Only during >50% Hazard Skip so normal video stays 100% sharp) */}
            {empGlitchActive && (
              <div
                className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none"
                style={{
                  background:
                    "repeating-linear-gradient(0deg, rgba(255,0,127,0.42) 0px, rgba(0,243,255,0.42) 3px, rgba(0,0,0,0.88) 6px)",
                  boxShadow: "inset 0 0 50px #ff007f",
                }}
              >
                <span className="font-[family-name:var(--font-display)] font-black tracking-[0.25em] text-sm sm:text-lg text-[#ff007f] drop-shadow-[0_0_12px_#00f3ff]">
                  ⚡ EMP CROWD OVERRIDE ⚡
                </span>
                <span className="font-[family-name:var(--font-chat)] text-xs text-[#00f3ff] tracking-widest uppercase">
                  HAZARD VOTE PASSED — CUTTING TO NEXT REEL
                </span>
              </div>
            )}
          </div>

          {/* Now Playing Metadata Strip Integrated Into Bottom Screen Bezel */}
          {nowPlayingBar && (
            <div className="w-full h-[24px]">{nowPlayingBar}</div>
          )}
        </div>
      </div>

      {/* ── 3. Screen Support Trusses & Downward Projector Light Cone ─────── */}
      <div className="relative w-full flex justify-between px-12 sm:px-24 h-4 z-10 pointer-events-none">
        <div className="w-4 h-full bg-gradient-to-b from-[#2b0948] to-[#0d021a] border-x border-[#ff007f]/40" />
        <div className="w-4 h-full bg-gradient-to-b from-[#2b0948] to-[#0d021a] border-x border-[#ff007f]/40" />

        {/* Downward Screen-to-Lot Light Wash Cone (matches image6.png) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 w-[112%] h-28 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(var(--vice-aura-bot, 255,0,127), 0.24) 0%, rgba(var(--vice-aura-top, 0,243,255), 0.08) 60%, transparent 100%)",
            clipPath: "polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)",
            mixBlendMode: "screen",
          }}
        />
      </div>
    </div>
  );
}
