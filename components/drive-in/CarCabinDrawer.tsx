"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CabinQuickNote, CabinSeatOccupant } from "@/lib/realtime/cabin-voice";

const SEAT_LABELS = [
  "SEAT 1 • DRIVER",
  "SEAT 2 • SHOTGUN",
  "SEAT 3 • REAR LEFT",
  "SEAT 4 • REAR RIGHT",
] as const;

interface CarCabinDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cabinCode: string | null;
  windowsUpFmMode: boolean;
  micEnabled: boolean;
  micError: string | null;
  isLocalSpeaking: boolean;
  passengers: CabinSeatOccupant[];
  cabinNotes: CabinQuickNote[];
  onToggleWindowsUpFm: () => void;
  onToggleMicrophone: () => void;
  onOpenOrJoinCabin: (code?: string) => void;
  onLeaveCabin: () => void;
  onSendCabinNote: (text: string) => void;
  onTestVoiceDuck: () => void;
}

export default function CarCabinDrawer({
  isOpen,
  onClose,
  cabinCode,
  windowsUpFmMode,
  micEnabled,
  micError,
  isLocalSpeaking,
  passengers,
  cabinNotes,
  onToggleWindowsUpFm,
  onToggleMicrophone,
  onOpenOrJoinCabin,
  onLeaveCabin,
  onSendCabinNote,
  onTestVoiceDuck,
}: CarCabinDrawerProps) {
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (!cabinCode || typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(cabinCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Dashboard FM & 4-Seat Cabin Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-lg rounded-xl overflow-hidden p-5 flex flex-col gap-4"
            style={{
              background: "linear-gradient(155deg, #07081d 0%, #100726 100%)",
              border: "1px solid rgba(0,243,255,0.38)",
              boxShadow:
                "0 0 45px rgba(0,243,255,0.18), 0 0 80px rgba(255,0,127,0.12)",
            }}
          >
            {/* Top Neon Strip */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00f3ff] via-[#ff007f] to-[#ffdd00]" />

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📻</span>
                <div>
                  <h3
                    className="font-[family-name:var(--font-display)] font-black tracking-[0.18em] uppercase text-[#00f3ff]"
                    style={{ fontSize: "13px" }}
                  >
                    FM 88.6 CABIN TUNER & 4-SEAT CREW
                  </h3>
                  <p className="text-[10px] font-[family-name:var(--font-chat)] text-white/60">
                    Roll up the windows for warm FM dashboard audio & private 4-seat WebRTC voice
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white text-lg font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 1. "Roll Up the Windows" FM Radio Acoustic DSP Control */}
            <div
              className="rounded-lg p-3 flex items-center justify-between gap-3"
              style={{
                background: windowsUpFmMode
                  ? "rgba(255, 0, 127, 0.14)"
                  : "rgba(255, 255, 255, 0.04)",
                border: windowsUpFmMode
                  ? "1px solid rgba(255, 0, 127, 0.55)"
                  : "1px solid rgba(0, 243, 255, 0.2)",
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-[family-name:var(--font-display)] font-bold uppercase tracking-wider"
                    style={{
                      fontSize: "11px",
                      color: windowsUpFmMode ? "#ff007f" : "#00f3ff",
                    }}
                  >
                    {windowsUpFmMode
                      ? "🪟 WINDOWS UP • FM 88.6 CABIN DSP ACTIVE"
                      : "🌴 WINDOWS DOWN • OPEN-AIR LOT AUDIO"}
                  </span>
                </div>
                <p className="text-[10px] text-white/60 font-[family-name:var(--font-chat)] mt-0.5">
                  950 Hz Biquad Low-Pass + 1.1 kHz Warmth + Automatic -12 dB Voice Ducking
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onTestVoiceDuck}
                  className="px-2 py-1.5 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-white/10 hover:bg-white/20 text-[#ffdd00] border border-[#ffdd00]/30"
                  title="Preview -12 dB automatic voice ducking"
                >
                  Duck -12dB
                </button>
                <button
                  type="button"
                  onClick={onToggleWindowsUpFm}
                  className="px-3 py-1.5 rounded text-[10px] font-[family-name:var(--font-display)] font-black uppercase tracking-wider cursor-pointer transition-all"
                  style={{
                    background: windowsUpFmMode ? "#ff007f" : "#00f3ff",
                    color: "#040510",
                    boxShadow: windowsUpFmMode
                      ? "0 0 14px rgba(255,0,127,0.6)"
                      : "0 0 14px rgba(0,243,255,0.5)",
                  }}
                >
                  {windowsUpFmMode ? "Roll Down" : "Roll Up"}
                </button>
              </div>
            </div>

            {/* 2. 6-Character Invite Code & Unlock Doors */}
            {!cabinCode ? (
              <div className="rounded-lg p-3.5 bg-black/50 border border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-[family-name:var(--font-display)] font-bold text-white uppercase tracking-wider">
                      🔒 DOORS LOCKED (SOLO CABIN)
                    </p>
                    <p className="text-[11px] font-[family-name:var(--font-chat)] text-white/60">
                      Unlock your doors to generate a 6-character code for up to 3 friends.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenOrJoinCabin()}
                    className="px-3.5 py-2 rounded-lg font-[family-name:var(--font-display)] font-black text-[10px] uppercase tracking-wider cursor-pointer bg-gradient-to-r from-[#39ff14] to-[#00f3ff] text-black shadow-[0_0_16px_rgba(57,255,20,0.4)]"
                  >
                    🔓 Unlock Doors
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="ENTER 6-CHAR CREW CODE (e.g. VICE86)"
                    className="flex-1 bg-black/70 border border-[#00f3ff]/30 rounded px-2.5 py-1.5 text-xs font-mono text-white tracking-widest uppercase outline-none"
                  />
                  <button
                    type="button"
                    disabled={joinCodeInput.trim().length < 4}
                    onClick={() => {
                      onOpenOrJoinCabin(joinCodeInput.trim());
                      setJoinCodeInput("");
                    }}
                    className="px-3 py-1.5 rounded bg-[#00f3ff]/20 hover:bg-[#00f3ff]/35 disabled:opacity-40 text-[#00f3ff] border border-[#00f3ff]/40 font-[family-name:var(--font-display)] font-bold text-[10px] uppercase cursor-pointer"
                  >
                    Hop In ↗
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Active Cabin Header & Invite Code */}
                <div className="rounded-lg p-3 bg-black/60 border border-[#39ff14]/40 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-[family-name:var(--font-display)] uppercase tracking-widest text-[#39ff14] block">
                      🔓 CREW CABIN UNLOCKED ({passengers.length}/4 SEATS)
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="font-[family-name:var(--font-display)] font-black tracking-[0.25em] text-base text-[#ffdd00]"
                        style={{ textShadow: "0 0 10px rgba(255,221,0,0.5)" }}
                      >
                        {cabinCode}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                      >
                        {copied ? "✓ COPIED" : "📋 COPY CODE"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onToggleMicrophone}
                      className="px-3 py-1.5 rounded font-[family-name:var(--font-display)] font-bold text-[10px] uppercase cursor-pointer transition-all"
                      style={{
                        background: micEnabled
                          ? "rgba(57,255,20,0.22)"
                          : "rgba(255,255,255,0.08)",
                        color: micEnabled ? "#39ff14" : "#ffffffcc",
                        border: micEnabled
                          ? "1px solid #39ff14"
                          : "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      {micEnabled
                        ? isLocalSpeaking
                          ? "🎙️ SPEAKING (-12dB)"
                          : "🎙️ MIC LIVE"
                        : "🔇 UNMUTE MIC"}
                    </button>
                    <button
                      type="button"
                      onClick={onLeaveCabin}
                      className="px-2.5 py-1.5 rounded font-[family-name:var(--font-display)] font-bold text-[10px] uppercase cursor-pointer bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/40"
                    >
                      Lock
                    </button>
                  </div>
                </div>

                {micError && (
                  <p className="text-[10px] font-mono text-[#ffdd00] bg-[#ffdd00]/10 border border-[#ffdd00]/30 rounded px-2.5 py-1">
                    ℹ️ {micError}
                  </p>
                )}

                {/* 4-Seat Car Interior Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((seatIdx) => {
                    const occupant = passengers[seatIdx];
                    const speaking =
                      occupant &&
                      (occupant.isSpeaking ||
                        (seatIdx === 0 && isLocalSpeaking));
                    return (
                      <div
                        key={seatIdx}
                        className="rounded-lg p-2.5 flex items-center justify-between"
                        style={{
                          background: occupant
                            ? "rgba(12, 14, 38, 0.9)"
                            : "rgba(255, 255, 255, 0.02)",
                          border: speaking
                            ? "1px solid #39ff14"
                            : occupant
                            ? `1px solid ${occupant.badgeColor}55`
                            : "1px dashed rgba(255,255,255,0.15)",
                          boxShadow: speaking
                            ? "0 0 16px rgba(57,255,20,0.35)"
                            : "none",
                        }}
                      >
                        <div className="min-w-0">
                          <span className="text-[8px] font-[family-name:var(--font-display)] tracking-widest uppercase text-white/45 block">
                            {SEAT_LABELS[seatIdx]}
                          </span>
                          {occupant ? (
                            <span
                              className="font-[family-name:var(--font-display)] font-bold text-xs truncate block"
                              style={{ color: occupant.badgeColor }}
                            >
                              {occupant.username}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-white/30">
                              Empty Seat — Share {cabinCode}
                            </span>
                          )}
                        </div>
                        {occupant && (
                          <span className="text-xs">
                            {speaking ? "🔊" : occupant.micEnabled ? "🎙️" : "🎧"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* In-Cabin Whisper Bar */}
                <div className="flex flex-col gap-1.5">
                  {cabinNotes.length > 0 && (
                    <div className="max-h-20 overflow-y-auto bg-black/50 rounded p-2 border border-white/10 space-y-1">
                      {cabinNotes.slice(-4).map((n) => (
                        <div
                          key={n.id}
                          className="text-[10px] font-[family-name:var(--font-chat)]"
                        >
                          <strong style={{ color: n.badgeColor }}>
                            {n.username}:
                          </strong>{" "}
                          <span className="text-white/85">{n.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!noteInput.trim()) return;
                      onSendCabinNote(noteInput);
                      setNoteInput("");
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      maxLength={140}
                      placeholder="Whisper to your 4-seat cabin crew..."
                      className="flex-1 bg-black/60 border border-white/15 rounded px-2.5 py-1.5 text-xs text-white font-[family-name:var(--font-chat)] outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded bg-[#ff007f]/25 hover:bg-[#ff007f]/40 text-[#ff007f] border border-[#ff007f]/40 font-[family-name:var(--font-display)] font-bold text-[10px] uppercase cursor-pointer"
                    >
                      Whisper
                    </button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
