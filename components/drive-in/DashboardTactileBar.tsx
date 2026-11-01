"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getViceNightlyState,
  VICE_NIGHTLY_BLOCKS,
  type ActiveScheduleState,
} from "@/lib/schedule/vice-nightly";
import {
  dismissTowImpoundNotice,
  type EconomyState,
  type ScoutRankInfo,
} from "@/lib/economy/vice-cred";

interface DashboardTactileBarProps {
  highBeamsOn: boolean;
  hazardsOn: boolean;
  highBeamCount: number;
  hazardCount: number;
  occupiedCount: number;
  windowsUpFmMode: boolean;
  cabinCode: string | null;
  economy: EconomyState & { rank: ScoutRankInfo };
  onToggleHighBeams: () => void;
  onHonkHorn: () => void;
  onToggleHazards: () => void;
  onToggleWindowsUpFm: () => void;
  onOpenCabinDrawer: () => void;
  onOpenProfileModal: () => void;
}

export default function DashboardTactileBar({
  highBeamsOn,
  hazardsOn,
  highBeamCount,
  hazardCount,
  occupiedCount,
  windowsUpFmMode,
  cabinCode,
  economy,
  onToggleHighBeams,
  onHonkHorn,
  onToggleHazards,
  onToggleWindowsUpFm,
  onOpenCabinDrawer,
  onOpenProfileModal,
}: DashboardTactileBarProps) {
  const [schedule, setSchedule] = useState<ActiveScheduleState>(() =>
    getViceNightlyState()
  );
  const [showScheduleGuide, setShowScheduleGuide] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSchedule(getViceNightlyState());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const totalCars = Math.max(1, occupiedCount);

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          TOP-LEFT HUD: "VICE NIGHTLY" BROADCAST GUIDE & SCOUT CRED BADGE
          Symmetrically balances the top-right status bar in the night sky.
      ══════════════════════════════════════════════════════════════════ */}
      <div className="absolute top-[2%] left-[1.5%] z-40 flex items-center gap-1.5 flex-wrap">
        {/* Active Broadcast Block Pill */}
        <button
          type="button"
          onClick={() => setShowScheduleGuide((p) => !p)}
          className="flex items-center gap-1.5 bg-black/75 hover:bg-black/90 rounded-full px-2.5 py-0.5 cursor-pointer transition-all"
          style={{
            border: `1px solid ${schedule.currentBlock.accentColor}55`,
            boxShadow: `0 0 12px ${schedule.currentBlock.accentColor}22`,
          }}
          title="View Vice Nightly Broadcast Schedule (EST)"
        >
          <span>{schedule.currentBlock.badgeIcon}</span>
          <span
            className="font-[family-name:var(--font-display)] font-black tracking-wider uppercase"
            style={{
              fontSize: "clamp(7px,0.75vw,10px)",
              color: schedule.currentBlock.accentColor,
            }}
          >
            {schedule.currentBlock.shortTitle}
          </span>
          <span
            className="font-[family-name:var(--font-chat)] text-white/55"
            style={{ fontSize: "clamp(7px,0.7vw,9px)" }}
          >
            {schedule.currentBlock.isPremiereBlock
              ? `• ${schedule.countdownLabel} left`
              : `• Next: ${schedule.nextBlock.shortTitle} (${schedule.countdownLabel})`}
          </span>
        </button>

        {/* Talent Scout Rank, Vice Cred & Row A Streak Pill */}
        <button
          type="button"
          onClick={onOpenProfileModal}
          className="flex items-center gap-1.5 bg-black/75 hover:bg-black/90 border border-[#ffdd00]/35 rounded-full px-2.5 py-0.5 cursor-pointer transition-all"
          title="Driver Garage, Talent Scout Rank & Row A Streak"
        >
          <span>{economy.rank.badge}</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider text-[#ffdd00]"
            style={{ fontSize: "clamp(7px,0.75vw,10px)" }}
          >
            {economy.viceCred} CRED
          </span>
          <span
            className="font-[family-name:var(--font-chat)] text-[#39ff14]"
            style={{ fontSize: "clamp(7px,0.7vw,9px)" }}
          >
            🔥{economy.streakDays}d {economy.rank.qualifiesRowA ? "• ROW A" : ""}
          </span>
        </button>
      </div>

      {/* ── Vice Nightly TV Guide Popover ─────────────────────────────────── */}
      <AnimatePresence>
        {showScheduleGuide && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-[6.2%] left-[1.5%] z-50 w-[min(340px,88vw)] rounded-xl p-3.5"
            style={{
              background: "rgba(6, 7, 24, 0.96)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0,243,255,0.35)",
              boxShadow: "0 0 32px rgba(0,243,255,0.2)",
            }}
          >
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
              <div>
                <span className="font-[family-name:var(--font-display)] font-black text-[10px] tracking-[0.2em] uppercase text-[#00f3ff] block">
                  📺 VICE NIGHTLY BROADCAST SCHEDULE
                </span>
                <span className="font-[family-name:var(--font-chat)] text-[9px] text-white/50">
                   Leonida Network Clock: {schedule.estClockLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleGuide(false)}
                className="text-white/50 hover:text-white text-xs font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              {VICE_NIGHTLY_BLOCKS.map((blk) => {
                const isLive = schedule.currentBlock.id === blk.id;
                const timeRange =
                  blk.id === "mod_matinee"
                    ? "6:00–8:00 PM EST"
                    : blk.id === "prime_countdown"
                    ? "9:00–10:00 PM EST"
                    : blk.id === "rp_late_show"
                    ? "11:00 PM–1:00 AM EST"
                    : "1:00–4:00 AM EST";

                return (
                  <div
                    key={blk.id}
                    className="rounded-lg p-2 flex flex-col gap-0.5"
                    style={{
                      background: isLive
                        ? `${blk.accentColor}1f`
                        : "rgba(255,255,255,0.03)",
                      border: isLive
                        ? `1px solid ${blk.accentColor}`
                        : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="font-[family-name:var(--font-display)] font-bold text-[10px] uppercase"
                        style={{ color: blk.accentColor }}
                      >
                        {blk.badgeIcon} {blk.title}
                      </span>
                      <span className="font-mono text-[9px] text-white/65 shrink-0">
                        {isLive ? "● ON AIR" : timeRange}
                      </span>
                    </div>
                    <p className="text-[9px] font-[family-name:var(--font-chat)] text-white/60">
                      {blk.tagline}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════
          48-HOUR VICE CITY TOW-TRUCK IMPOUND BANNER
      ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {economy.towStatus !== "safe" && (
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="absolute top-[7%] left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl flex items-center gap-3"
            style={{
              background: "rgba(24, 6, 18, 0.95)",
              border: "1.5px solid #ff6b00",
              boxShadow: "0 0 30px rgba(255,107,0,0.45)",
            }}
          >
            <span className="text-xl animate-bounce">🚛</span>
            <div>
              <p className="font-[family-name:var(--font-display)] font-black text-[10px] tracking-widest uppercase text-[#ff6b00]">
                {economy.towStatus === "impounded"
                  ? "VICE CITY IMPOUND: ROW A STALL HAULED AWAY (48H INACTIVITY)"
                  : `VICE TOW WARNING: ${economy.hoursUntilTow}H UNTIL ROW A IMPOUND`}
              </p>
              <p className="font-[family-name:var(--font-chat)] text-[10px] text-white/75">
                {economy.towStatus === "impounded"
                  ? "Your vehicle was towed after 48h away. Flash High-Beams or scout a clip to reclaim Row A!"
                  : "Check in daily to keep your Front Row Center VIP parking stall."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismissTowImpoundNotice()}
              className="px-2.5 py-1 rounded bg-[#ff6b00] text-black font-[family-name:var(--font-display)] font-black text-[9px] uppercase tracking-wider cursor-pointer shrink-0"
            >
              Reclaim Car
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════
          TACTILE DASHBOARD SWITCH BAR (Docked on Console Bezel at top=84.4%)
          Zero overlap with chat panel (55.3-69.8%) or text input (88.0%).
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
        style={{
          top: "84.4%",
          background: "rgba(6, 7, 23, 0.90)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(0, 243, 255, 0.28)",
          boxShadow: "0 0 18px rgba(0, 0, 0, 0.75)",
        }}
      >
        {/* 1. High-Beam Flash (SPACE) */}
        <button
          type="button"
          onClick={onToggleHighBeams}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all"
          style={{
            background: highBeamsOn
              ? "rgba(255, 221, 0, 0.24)"
              : "rgba(255, 255, 255, 0.04)",
            border: highBeamsOn
              ? "1px solid #ffdd00"
              : "1px solid rgba(255, 255, 255, 0.14)",
            color: highBeamsOn ? "#ffdd00" : "#e0e0e0",
            boxShadow: highBeamsOn ? "0 0 12px rgba(255,221,0,0.45)" : "none",
          }}
          title="Flash High-Beams (Spacebar when not typing) — >25% of lot triggers +15s Encore!"
        >
          <span style={{ fontSize: "clamp(7px,0.7vw,10px)" }}>💡</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider uppercase"
            style={{ fontSize: "clamp(6px,0.62vw,9px)" }}
          >
            BEAMS ({highBeamCount}/{totalCars})
          </span>
        </button>

        {/* 2. 3D Spatial Horn (H) */}
        <button
          type="button"
          onClick={onHonkHorn}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all bg-white/5 hover:bg-[#00f3ff]/20 border border-[#00f3ff]/25 text-[#00f3ff]"
          title="Honk 3D Spatial Horn (Shortcut: H)"
        >
          <span style={{ fontSize: "clamp(7px,0.7vw,10px)" }}>🔊</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider uppercase"
            style={{ fontSize: "clamp(6px,0.62vw,9px)" }}
          >
            HORN
          </span>
        </button>

        {/* 3. Hazard Lights / Vote to Skip (X) */}
        <button
          type="button"
          onClick={onToggleHazards}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all"
          style={{
            background: hazardsOn
              ? "rgba(255, 107, 0, 0.25)"
              : "rgba(255, 255, 255, 0.04)",
            border: hazardsOn
              ? "1px solid #ff6b00"
              : "1px solid rgba(255, 255, 255, 0.14)",
            color: hazardsOn ? "#ff6b00" : "#e0e0e0",
            boxShadow: hazardsOn ? "0 0 12px rgba(255,107,0,0.45)" : "none",
          }}
          title="Toggle Hazard Lights to Vote Skip (Shortcut: X) — >50% triggers EMP Cut!"
        >
          <span style={{ fontSize: "clamp(7px,0.7vw,10px)" }}>⚠️</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider uppercase"
            style={{ fontSize: "clamp(6px,0.62vw,9px)" }}
          >
            SKIP ({hazardCount}/{totalCars})
          </span>
        </button>

        {/* 4. Roll Up Windows FM Radio DSP (R) */}
        <button
          type="button"
          onClick={onToggleWindowsUpFm}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all"
          style={{
            background: windowsUpFmMode
              ? "rgba(255, 0, 127, 0.24)"
              : "rgba(255, 255, 255, 0.04)",
            border: windowsUpFmMode
              ? "1px solid #ff007f"
              : "1px solid rgba(255, 255, 255, 0.14)",
            color: windowsUpFmMode ? "#ff007f" : "#00f3ff",
          }}
          title="Roll Up the Windows — Toggle 950 Hz FM Cabin Radio DSP (Shortcut: R)"
        >
          <span style={{ fontSize: "clamp(7px,0.7vw,10px)" }}>🪟</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider uppercase"
            style={{ fontSize: "clamp(6px,0.62vw,9px)" }}
          >
            {windowsUpFmMode ? "FM 88.6 ON" : "FM RADIO"}
          </span>
        </button>

        {/* 5. 4-Seat Crew Cabin Drawer */}
        <button
          type="button"
          onClick={onOpenCabinDrawer}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all"
          style={{
            background: cabinCode
              ? "rgba(57, 255, 20, 0.2)"
              : "rgba(191, 0, 255, 0.18)",
            border: cabinCode
              ? "1px solid #39ff14"
              : "1px solid rgba(191, 0, 255, 0.45)",
            color: cabinCode ? "#39ff14" : "#e599ff",
          }}
          title="Unlock 4-Seat Car Crew Voice Cabin (6-character invite code)"
        >
          <span style={{ fontSize: "clamp(7px,0.7vw,10px)" }}>📻</span>
          <span
            className="font-[family-name:var(--font-display)] font-bold tracking-wider uppercase"
            style={{ fontSize: "clamp(6px,0.62vw,9px)" }}
          >
            {cabinCode ? `CREW: ${cabinCode}` : "4-SEAT CABIN"}
          </span>
        </button>
      </div>
    </>
  );
}
