"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSeamlessPlayer } from "./hooks/useSeamlessPlayer";
import CreatorCredit from "./CreatorCredit";
import type { VideoItem } from "@/lib/video/types";

// ─── SVG icons ────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5L13 8L4 13.5V2.5Z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="4" height="12" rx="1" />
    <rect x="9" y="2" width="4" height="12" rx="1" />
  </svg>
);
const MuteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);
const VolumeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
const SkipIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3L10 8L2 13V3Z" />
    <rect x="11" y="3" width="3" height="10" rx="1" />
  </svg>
);

// ─── Player ───────────────────────────────────────────────────────────────────
export default function HTML5Player({
  onItemChange,
}: {
  onItemChange?: (item: VideoItem | null) => void;
}) {
  const {
    playerARef,
    playerBRef,
    opacity,
    playerState,
    prime,
    unmute,
    handleTimeUpdate,
    slotAHandlers,
    slotBHandlers,
    toggleMute,
    setVolume,
    skipToNext,
    togglePlay,
  } = useSeamlessPlayer();

  const [showControls, setShowControls] = useState(false);
  const [creditVisible, setCreditVisible] = useState(false);
  const creditTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPrimed     = useRef(false);

  // Prime once on mount
  useEffect(() => {
    if (!hasPrimed.current) {
      hasPrimed.current = true;
      prime();
    }
  }, [prime]);

  // Bubble current item up to parent (VideoEngine → HomeClient)
  useEffect(() => {
    onItemChange?.(playerState.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.current?.id]);

  // Show creator credit for 6 s on each new clip, then fade
  useEffect(() => {
    if (!playerState.current) return;
    setCreditVisible(true);
    if (creditTimer.current) clearTimeout(creditTimer.current);
    creditTimer.current = setTimeout(() => setCreditVisible(false), 6000);
    return () => { if (creditTimer.current) clearTimeout(creditTimer.current); };
  }, [playerState.current?.id]);

  // Auto-hide controls 2.5 s after last mouse movement
  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  }, []);

  const handleMouseMove = useCallback(() => {
    bumpControls();
    // Re-show credit briefly on hover
    setCreditVisible(true);
    if (creditTimer.current) clearTimeout(creditTimer.current);
    creditTimer.current = setTimeout(() => setCreditVisible(false), 3500);
  }, [bumpControls]);

  // First click anywhere on the player surface → unmute
  const handlePlayerClick = useCallback(() => {
    unmute();
  }, [unmute]);

  const isLoading = playerState.status === "idle" || playerState.status === "loading";
  const isError   = playerState.status === "error";
  const progress  = (playerState.progress * 100).toFixed(2);

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setShowControls(false); setCreditVisible(false); }}
      onClick={handlePlayerClick}
    >
      {/* ── Slot A ────────────────────────────────────────────────────────── */}
      <video
        ref={playerARef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          // No opacity transition — instant z-index swap only.
          // Prebuffering makes cuts seamless without cross-fade.
          // Cross-fading at partial opacity causes the background to show through.
          opacity: 1,
          zIndex: opacity.A === 1 ? 2 : 1,
        }}
        playsInline
        autoPlay
        muted
        disablePictureInPicture
        onTimeUpdate={handleTimeUpdate}
        onEnded={slotAHandlers.onEnded}
        onError={slotAHandlers.onError}
      />

      {/* ── Slot B ────────────────────────────────────────────────────────── */}
      <video
        ref={playerBRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: 1,
          zIndex: opacity.B === 1 ? 2 : 1,
        }}
        playsInline
        muted
        disablePictureInPicture
        onTimeUpdate={() => {}}
        onEnded={slotBHandlers.onEnded}
        onError={slotBHandlers.onError}
      />

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black gap-3">
          <div className="w-6 h-6 border-[1.5px] border-[#00f3ff] border-t-transparent rounded-full animate-spin" />
          <p
            className="font-[family-name:var(--font-chat)] tracking-widest"
            style={{ fontSize: "clamp(7px,0.75vw,10px)", color: "rgba(0,243,255,0.4)" }}
          >
            TUNING IN...
          </p>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {isError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black gap-2">
          <p
            className="font-[family-name:var(--font-chat)] tracking-widest"
            style={{ fontSize: "clamp(8px,0.8vw,11px)", color: "rgba(255,0,127,0.6)" }}
          >
            SIGNAL LOST
          </p>
          <p style={{ fontSize: "clamp(6px,0.65vw,9px)", color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-chat)", letterSpacing: "0.1em" }}>
            reconnecting...
          </p>
        </div>
      )}

      {/* ── Muted notice — shown until first click ───────────────────────── */}
      {playerState.isMuted && playerState.status === "playing" && !showControls && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(0,243,255,0.2)",
            borderRadius: 4,
            padding: "3px 8px",
          }}
        >
          <p
            className="font-[family-name:var(--font-chat)] tracking-wider whitespace-nowrap"
            style={{ fontSize: "clamp(6px,0.6vw,8px)", color: "rgba(0,243,255,0.55)" }}
          >
            click to unmute
          </p>
        </div>
      )}

      {/* ── Creator credit (bottom-left, auto-fades) ─────────────────────── */}
      <CreatorCredit item={playerState.current} visible={creditVisible} />

      {/* ── Controls overlay — hover only, single layer, z:40 ───────────── */}
      <div
        className="absolute inset-0 z-40 flex flex-col justify-end"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
          transition: "opacity 180ms ease",
        }}
        // Prevent click-on-controls from triggering the unmute-click handler
        onClick={(e) => e.stopPropagation()}
      >
        {/* gradient scrim — no pointer events */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)" }}
        />

        {/* progress bar */}
        <div className="relative w-full h-[2px] bg-white/10">
          <div
            className="h-full bg-[#00f3ff]"
            style={{ width: `${progress}%`, transition: "width 500ms linear" }}
          />
        </div>

        {/* control row */}
        <div className="relative flex items-center gap-3 px-3 py-2">
          {/* play / pause */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "rgba(255,255,255,0.85)" }}
            className="hover:text-[#00f3ff] transition-colors"
          >
            {playerState.status === "playing" ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* mute */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "rgba(255,255,255,0.85)" }}
            className="hover:text-[#00f3ff] transition-colors"
          >
            {playerState.isMuted ? <MuteIcon /> : <VolumeIcon />}
          </button>

          {/* volume slider */}
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={playerState.isMuted ? 0 : playerState.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="w-14 cursor-pointer accent-[#00f3ff]"
            style={{ height: 3 }}
          />

          <div className="flex-1" />

          {/* platform badge */}
          {playerState.current && (
            <span
              className="font-[family-name:var(--font-chat)]"
              style={{ fontSize: "clamp(5px,0.5vw,7px)", color: "rgba(255,255,255,0.25)" }}
            >
              {playerState.current.platformIcon} {playerState.current.platform}
            </span>
          )}

          {/* next */}
          <button
            onClick={(e) => { e.stopPropagation(); skipToNext(); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "rgba(255,255,255,0.55)" }}
            className="hover:text-[#ff007f] transition-colors flex items-center gap-1"
            title="Next clip"
          >
            <SkipIcon />
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-wider uppercase"
              style={{ fontSize: "clamp(5px,0.48vw,7px)" }}
            >
              NEXT
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
