"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useSeamlessPlayer,
  type UseSeamlessPlayerOptions,
} from "./hooks/useSeamlessPlayer";
import CreatorCredit from "./CreatorCredit";
import OfficialEmbedFallback from "./OfficialEmbedFallback";
import ForensicWorkbenchOverlay from "./ForensicWorkbenchOverlay";
import {
  formatPreciseTimecode,
  type XRayMetadataCue,
} from "@/lib/video/xray-telemetry";
import type { VideoItem } from "@/lib/video/types";
import type { RoomSyncMode } from "@/lib/realtime/useDriveInRoom";

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

export interface PlayerTelemetryState {
  activeCue: XRayMetadataCue | null;
  cues: XRayMetadataCue[];
  currentTimeSec: number;
  frameNumber: number;
  fps: number;
  isForensicHold: boolean;
}

export interface HTML5PlayerProps extends UseSeamlessPlayerOptions {
  onItemChange?: (item: VideoItem | null) => void;
  onTelemetryChange?: (telemetry: PlayerTelemetryState) => void;
  modalOpen?: boolean;
  syncMode?: RoomSyncMode;
}

// ─── Dual-DOM Synchronized Player ─────────────────────────────────────────────
export default function HTML5Player({
  onItemChange,
  onTelemetryChange,
  modalOpen = false,
  syncedCurrent,
  syncedNext,
  clipStartTimestamp,
  getSyncedOffsetSec,
  onReportDuration,
  onRefreshSync,
  onCueChange,
}: HTML5PlayerProps) {
  const {
    playerARef,
    playerBRef,
    opacity,
    playerState,
    isEmbedFallback,
    prime,
    unmute,
    handleTimeUpdate,
    slotAHandlers,
    slotBHandlers,
    toggleMute,
    setVolume,
    togglePlay,
    currentTimeSec,
    frameNumber,
    fps,
    isForensicHold,
    cues,
    activeCue,
    stepFrames,
    seekToSeconds,
    resumeRoomSync,
    getActiveVideoElement,
  } = useSeamlessPlayer({
    syncedCurrent,
    syncedNext,
    clipStartTimestamp,
    getSyncedOffsetSec,
    onReportDuration,
    onRefreshSync,
    onCueChange,
  });

  const [showControls, setShowControls] = useState(false);
  const [forensicOpen, setForensicOpen] = useState(false);
  // Credit is visible for 6s after each new clip (derived from id) or while hovering
  const [creditHiddenId, setCreditHiddenId] = useState<string | null>(null);
  const [hoverCredit, setHoverCredit] = useState(false);
  const creditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPrimed = useRef(false);

  const isRoomControlled = syncedCurrent !== undefined;

  // Prime standalone mode only when not controlled by room sync
  useEffect(() => {
    if (!isRoomControlled && !hasPrimed.current) {
      hasPrimed.current = true;
      prime();
    }
  }, [isRoomControlled, prime]);

  // Bubble current item up to parent (VideoEngine -> HomeClient)
  useEffect(() => {
    onItemChange?.(playerState.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.current?.id]);

  // Bubble live X-Ray cue & frame telemetry up to parent
  useEffect(() => {
    onTelemetryChange?.({
      activeCue,
      cues,
      currentTimeSec,
      frameNumber,
      fps,
      isForensicHold,
    });
  }, [
    onTelemetryChange,
    activeCue,
    cues,
    currentTimeSec,
    frameNumber,
    fps,
    isForensicHold,
  ]);

  // Allow external newspaper buttons to open/toggle the Forensic Loupe
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onToggleLoupe = () => setForensicOpen((prev) => !prev);
    window.addEventListener("lv:toggle-forensic-loupe", onToggleLoupe);
    return () => window.removeEventListener("lv:toggle-forensic-loupe", onToggleLoupe);
  }, []);

  // Hide the creator credit 6 s after each new clip starts
  const currentId = playerState.current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    const t = setTimeout(() => setCreditHiddenId(currentId), 6000);
    return () => clearTimeout(t);
  }, [currentId]);
  const creditVisible = hoverCredit || (currentId !== null && currentId !== creditHiddenId);

  // Auto-hide controls 2.5 s after last mouse movement
  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  }, []);

  const handleMouseMove = useCallback(() => {
    bumpControls();
    setHoverCredit(true);
    if (creditTimer.current) clearTimeout(creditTimer.current);
    creditTimer.current = setTimeout(() => setHoverCredit(false), 3500);
  }, [bumpControls]);

  // First click anywhere on the player surface -> unlock Web Audio DSP & unmute
  const handlePlayerClick = useCallback(() => {
    unmute();
  }, [unmute]);

  const isLoading =
    playerState.status === "idle" || playerState.status === "loading";
  const isError = playerState.status === "error";
  const progress = Math.min(100, Math.max(0, playerState.progress * 100)).toFixed(2);

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setShowControls(false);
        setHoverCredit(false);
      }}
      onClick={handlePlayerClick}
    >
      {/* ── Persistent DOM Slot A (<16ms single-frame z-index swap) ──────── */}
      <video
        ref={playerARef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: isEmbedFallback ? 0 : 1,
          zIndex: opacity.A === 1 ? 2 : 1,
        }}
        playsInline
        autoPlay
        muted
        disablePictureInPicture
        onTimeUpdate={() => {
          if (opacity.A === 1) handleTimeUpdate();
        }}
        onPlaying={slotAHandlers.onPlaying}
        onCanPlay={slotAHandlers.onCanPlay}
        onEnded={slotAHandlers.onEnded}
        onError={slotAHandlers.onError}
      />

      {/* ── Persistent DOM Slot B (<16ms single-frame z-index swap) ──────── */}
      <video
        ref={playerBRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: isEmbedFallback ? 0 : 1,
          zIndex: opacity.B === 1 ? 2 : 1,
        }}
        playsInline
        muted
        disablePictureInPicture
        onTimeUpdate={() => {
          if (opacity.B === 1) handleTimeUpdate();
        }}
        onPlaying={slotBHandlers.onPlaying}
        onCanPlay={slotBHandlers.onCanPlay}
        onEnded={slotBHandlers.onEnded}
        onError={slotBHandlers.onError}
      />

      {/* ── Tier-2 Official Embed Fallback (YouTube / Vimeo / Dailymotion) ── */}
      {isEmbedFallback && playerState.current && (
        <OfficialEmbedFallback
          item={playerState.current}
          initialOffsetSec={getSyncedOffsetSec ? getSyncedOffsetSec() : 0}
          isMuted={playerState.isMuted}
          modalOpen={modalOpen}
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && !playerState.current && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black gap-3">
          <div className="w-6 h-6 border-[1.5px] border-[#00f3ff] border-t-transparent rounded-full animate-spin" />
          <p
            className="font-[family-name:var(--font-chat)] tracking-widest"
            style={{
              fontSize: "clamp(7px,0.75vw,10px)",
              color: "rgba(0,243,255,0.4)",
            }}
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
            style={{
              fontSize: "clamp(8px,0.8vw,11px)",
              color: "rgba(255,0,127,0.6)",
            }}
          >
            SIGNAL LOST
          </p>
          <p
            style={{
              fontSize: "clamp(6px,0.65vw,9px)",
              color: "rgba(255,255,255,0.2)",
              fontFamily: "var(--font-chat)",
              letterSpacing: "0.1em",
            }}
          >
            reconnecting...
          </p>
        </div>
      )}

      {/* ── Muted notice — shown until first click unlocks Web Audio DSP ─── */}
      {playerState.isMuted &&
        playerState.status === "playing" &&
        !showControls && (
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
              style={{
                fontSize: "clamp(6px,0.6vw,8px)",
                color: "rgba(0,243,255,0.55)",
              }}
            >
              click to unmute
            </p>
          </div>
        )}

      {/* ── Top-Right Live X-Ray Region & Forensic Loupe Trigger Pill ────── */}
      {playerState.current && !forensicOpen && (
        <div
          className="absolute top-2.5 right-2.5 z-40 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {activeCue && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 bg-black/80 border border-white/25 text-white px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
              title={`X-Ray Telemetry: ${activeCue.cueTitle}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#e04040] animate-pulse" />
              {activeCue.location.regionName} • {activeCue.vehicle.name.split(" (")[0]}
            </span>
          )}
          {isForensicHold && (
            <button
              type="button"
              onClick={resumeRoomSync}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors"
            >
              ⚡ LIVE RESYNC
            </button>
          )}
          <button
            type="button"
            onClick={() => setForensicOpen(true)}
            className="bg-[#e04040] hover:bg-black text-white border border-black px-2.5 py-0.5 text-[10px] font-mono font-extrabold uppercase tracking-wider cursor-pointer transition-colors shadow"
            title="Open Frame-Accurate Forensic Loupe (800% Zoom, -1f/+1f Stepper & Storyboard Export)"
          >
            🔬 FORENSIC LOUPE
          </button>
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
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 50%)",
          }}
        />

        {/* progress bar */}
        <div className="relative w-full h-[3px] bg-white/15">
          <div
            className="h-full bg-[#e04040]"
            style={{ width: `${progress}%`, transition: "width 250ms linear" }}
          />
        </div>

        {/* control row */}
        <div className="relative flex items-center gap-2.5 px-3 py-2">
          {/* play / pause */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: "rgba(255,255,255,0.9)",
            }}
            className="hover:text-[#e04040] transition-colors"
            title="Play / Pause"
          >
            {playerState.status === "playing" ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Frame-accurate -1f / +1f quick stepper buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepFrames(-1);
              }}
              className="px-1.5 py-0.5 bg-white/15 hover:bg-[#e04040] text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
              title="Step Back 1 Frame"
            >
              -1f
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepFrames(1);
              }}
              className="px-1.5 py-0.5 bg-white/15 hover:bg-[#e04040] text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
              title="Step Forward 1 Frame"
            >
              +1f
            </button>
          </div>

          {/* mute */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: "rgba(255,255,255,0.9)",
            }}
            className="hover:text-[#e04040] transition-colors"
          >
            {playerState.isMuted ? <MuteIcon /> : <VolumeIcon />}
          </button>

          {/* volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={playerState.isMuted ? 0 : playerState.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="w-14 cursor-pointer accent-[#e04040]"
            style={{ height: 3 }}
          />

          {/* Live Timecode & Frame Counter */}
          <span className="hidden md:inline-block font-mono text-[10px] text-white/75 tracking-tight">
            {formatPreciseTimecode(currentTimeSec)} • FR #{frameNumber}
          </span>

          <div className="flex-1" />

          {/* Open 800% Forensic Workbench */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setForensicOpen(true);
            }}
            className="px-2 py-0.5 bg-white/15 hover:bg-[#e04040] text-white font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
          >
            🔬 8× LOUPE & STORYBOARD
          </button>

          {/* platform badge */}
          {playerState.current && (
            <span
              className="font-[family-name:var(--font-chat)]"
              style={{
                fontSize: "clamp(6px,0.55vw,8px)",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              {playerState.current.platformIcon} {playerState.current.platform}
            </span>
          )}
        </div>
      </div>

      {/* ── Stage 1: Frame-Accurate Forensic Workbench Overlay ───────────── */}
      <ForensicWorkbenchOverlay
        isOpen={forensicOpen}
        onClose={() => setForensicOpen(false)}
        getVideoElement={getActiveVideoElement}
        currentItem={playerState.current}
        currentTimeSec={currentTimeSec}
        frameNumber={frameNumber}
        fps={fps}
        isPlaying={playerState.status === "playing"}
        isForensicHold={isForensicHold}
        activeCue={activeCue}
        allCues={cues}
        onStepFrames={stepFrames}
        onTogglePlay={togglePlay}
        onSeekToSeconds={seekToSeconds}
        onResumeRoomSync={resumeRoomSync}
      />
    </div>
  );
}
