"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage } from "@/lib/realtime/chat";
import type { VideoItem } from "@/lib/video/types";
import type { PlayerTelemetryState } from "@/components/video-engine/HTML5Player";
import {
  dispatchVideoSeekCommand,
  formatPreciseTimecode,
  formatShortTimecode,
  generateXRayCuesForVideo,
  LEONIDA_REGION_PINS,
} from "@/lib/video/xray-telemetry";

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

export interface DetachableCommandCenterProps {
  /** Ref to the persistent DOM wrapper holding {screenNode} */
  videoStageNodeRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to the Hero Stage slot in Section 0 where the video normally lives */
  heroSlotRef: React.RefObject<HTMLDivElement | null>;
  currentVideoItem: VideoItem | null;
  telemetry: PlayerTelemetryState | null;
  presenceCount: number;
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  handleSendMessage: (e?: React.FormEvent) => void;
  currentUsername: string;
  onPiPStateChange?: (active: boolean) => void;
}

export default function DetachableCommandCenter({
  videoStageNodeRef,
  heroSlotRef,
  currentVideoItem,
  telemetry,
  presenceCount,
  messages,
  inputValue,
  setInputValue,
  handleSendMessage,
  currentUsername,
  onPiPStateChange,
}: DetachableCommandCenterProps) {
  const [isHeroOutOfView, setIsHeroOutOfView] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipPortalRoot, setPipPortalRoot] = useState<HTMLElement | null>(null);

  const stickyVideoSlotRef = useRef<HTMLDivElement | null>(null);
  const pipVideoSlotRef = useRef<HTMLDivElement | null>(null);

  const fallbackCues = generateXRayCuesForVideo(currentVideoItem);
  const cues = telemetry?.cues && telemetry.cues.length > 0 ? telemetry.cues : fallbackCues;
  const activeCue = telemetry?.activeCue ?? cues[0];
  const currentTimeSec = telemetry?.currentTimeSec ?? 0;
  const frameNumber = telemetry?.frameNumber ?? 0;

  // Resume any playing <video> inside the transferred wrapper after DOM reparenting
  const ensureVideosKeepPlaying = useCallback((wrapper: HTMLElement) => {
    const videos = wrapper.querySelectorAll("video");
    videos.forEach((v) => {
      const zIndex = Number(v.style.zIndex || 0);
      if (zIndex === 2 && v.readyState >= 2 && !telemetry?.isForensicHold) {
        v.play().catch(() => {});
      }
    });
  }, [telemetry?.isForensicHold]);

  // Move the persistent videoStageNodeRef between Hero Slot, Sticky Mini-Player Slot, and Document PiP Slot
  useEffect(() => {
    const videoNode = videoStageNodeRef.current;
    if (!videoNode) return;

    if (pipWindow && pipVideoSlotRef.current) {
      if (videoNode.parentElement !== pipVideoSlotRef.current) {
        pipVideoSlotRef.current.appendChild(videoNode);
        ensureVideosKeepPlaying(videoNode);
      }
      return;
    }

    if (isHeroOutOfView && !stickyDismissed && stickyVideoSlotRef.current) {
      if (videoNode.parentElement !== stickyVideoSlotRef.current) {
        stickyVideoSlotRef.current.appendChild(videoNode);
        ensureVideosKeepPlaying(videoNode);
      }
      return;
    }

    if (heroSlotRef.current && videoNode.parentElement !== heroSlotRef.current) {
      heroSlotRef.current.appendChild(videoNode);
      ensureVideosKeepPlaying(videoNode);
    }
  }, [
    pipWindow,
    isHeroOutOfView,
    stickyDismissed,
    videoStageNodeRef,
    heroSlotRef,
    ensureVideosKeepPlaying,
  ]);

  // Observe when the Hero Broadcast Stage scrolls out of the viewport
  useEffect(() => {
    const heroEl = heroSlotRef.current;
    if (!heroEl || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const outOfView = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setIsHeroOutOfView(outOfView);
        if (!outOfView) {
          setStickyDismissed(false);
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(heroEl);
    return () => observer.disconnect();
  }, [heroSlotRef]);

  // Close Document PiP and restore DOM node to Hero/Sticky slot
  const closeDocumentPiP = useCallback(() => {
    if (pipWindow) {
      try {
        if (heroSlotRef.current && videoStageNodeRef.current) {
          heroSlotRef.current.appendChild(videoStageNodeRef.current);
          ensureVideosKeepPlaying(videoStageNodeRef.current);
        }
        pipWindow.close();
      } catch {
        // ignore
      }
    }
    setPipWindow(null);
    setPipPortalRoot(null);
    onPiPStateChange?.(false);
  }, [pipWindow, heroSlotRef, videoStageNodeRef, ensureVideosKeepPlaying, onPiPStateChange]);

  // Launch or toggle Chromium Document Picture-in-Picture Command Center
  const toggleDocumentPiP = useCallback(async () => {
    if (pipWindow) {
      closeDocumentPiP();
      return;
    }

    // Fallback if browser does not support Document PiP: activate sticky floating command center
    if (
      typeof window === "undefined" ||
      !window.documentPictureInPicture ||
      typeof window.documentPictureInPicture.requestWindow !== "function"
    ) {
      setStickyDismissed(false);
      setIsHeroOutOfView(true);
      return;
    }

    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 460,
        height: 640,
      });

      pipWin.document.title = "LEONIDA VICE // LIVE BROADCAST COMMAND CENTER";

      // Copy all stylesheets from main document so Tailwind & newspaper CSS work in PiP window
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          if (sheet.href) {
            const link = pipWin.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            pipWin.document.head.appendChild(link);
          } else if (sheet.cssRules) {
            const style = pipWin.document.createElement("style");
            style.textContent = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join("\n");
            pipWin.document.head.appendChild(style);
          }
        } catch {
          // Cross-origin stylesheet fallback
        }
      });

      pipWin.document.body.style.margin = "0";
      pipWin.document.body.style.background = "#ffffff";
      pipWin.document.body.style.color = "#000000";
      pipWin.document.body.style.overflowX = "hidden";

      const mount = pipWin.document.createElement("div");
      mount.id = "lv-pip-command-center-root";
      pipWin.document.body.appendChild(mount);

      const handlePageHide = () => {
        if (heroSlotRef.current && videoStageNodeRef.current) {
          heroSlotRef.current.appendChild(videoStageNodeRef.current);
          ensureVideosKeepPlaying(videoStageNodeRef.current);
        }
        setPipWindow(null);
        setPipPortalRoot(null);
        onPiPStateChange?.(false);
      };

      pipWin.addEventListener("pagehide", handlePageHide);

      setPipWindow(pipWin);
      setPipPortalRoot(mount);
      onPiPStateChange?.(true);
    } catch {
      // Fallback to sticky mini-command center if user gesture or browser blocks PiP
      setStickyDismissed(false);
      setIsHeroOutOfView(true);
    }
  }, [pipWindow, closeDocumentPiP, heroSlotRef, videoStageNodeRef, ensureVideosKeepPlaying, onPiPStateChange]);

  // Listen for global toggle event from XRayTelemetryDeck or Broadcast Header Ribbon
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onTogglePiPEvent = () => {
      void toggleDocumentPiP();
    };
    window.addEventListener("lv:toggle-document-pip", onTogglePiPEvent);
    return () => window.removeEventListener("lv:toggle-document-pip", onTogglePiPEvent);
  }, [toggleDocumentPiP]);

  const showStickyMiniPlayer = isHeroOutOfView && !stickyDismissed && !pipWindow;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          1. AUTOMATIC SCROLL-TRIGGERED STICKY BROADSHEET MINI-COMMAND CENTER
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className={`fixed bottom-4 right-4 z-50 w-[350px] sm:w-[400px] bg-white border-2 border-black shadow-[6px_6px_0_#000] transition-all duration-200 ${
          showStickyMiniPlayer
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-6 pointer-events-none"
        }`}
      >
        {/* Top Crimson & Black Broadsheet Bar */}
        <div className="bg-black text-white px-3 py-1.5 flex items-center justify-between gap-2 border-b border-black">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="bg-[#e04040] text-white px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider shrink-0">
              LIVE MINI-DECK
            </span>
            <span className="font-mono text-[10px] text-white/85 truncate">
              {formatPreciseTimecode(currentTimeSec)} • #{frameNumber}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void toggleDocumentPiP()}
              className="px-1.5 py-0.5 bg-[#e04040] hover:bg-white text-white hover:text-black text-[9.5px] font-bold uppercase cursor-pointer transition-colors"
              title="Pop out into an always-on-top OS Document PiP window"
            >
              ⧉ PiP WINDOW
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="px-1.5 py-0.5 bg-white/15 hover:bg-white text-white hover:text-black text-[9.5px] font-bold uppercase cursor-pointer transition-colors"
              title="Scroll back to top broadcast stage"
            >
              ↑ STAGE
            </button>
            <button
              type="button"
              onClick={() => setStickyDismissed(true)}
              className="px-1.5 py-0.5 bg-white/10 hover:bg-[#e04040] text-white text-[9.5px] font-bold cursor-pointer"
              title="Dock back to top stage"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 16:9 Slot where the live videoStageNodeRef moves when scrolled down */}
        <div
          ref={stickyVideoSlotRef}
          className="relative w-full aspect-video bg-black overflow-hidden border-b border-black"
        />

        {/* Live X-Ray Telemetry & Quick Seek Strip inside Sticky Mini-Player */}
        <div className="p-2.5 bg-white text-black space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase np-ui">
            <span className="text-[#e04040] truncate">
              📍 {activeCue.location.regionName} • {activeCue.vehicle.name.split(" (")[0]}
            </span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("lv:toggle-forensic-loupe"))}
              className="px-1.5 py-0.5 border border-black hover:bg-black hover:text-white text-[9.5px] font-extrabold uppercase shrink-0 cursor-pointer"
            >
              🔬 8× LOUPE
            </button>
          </div>

          <div className="text-[11.5px] font-extrabold leading-tight text-black truncate np-head">
            {currentVideoItem?.title || activeCue.cueTitle}
          </div>

          {/* Quick Region Seek Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pt-1">
            {LEONIDA_REGION_PINS.map((pin) => {
              const isCurrent = activeCue.location.regionId === pin.id;
              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() =>
                    dispatchVideoSeekCommand({
                      timestampSec: pin.defaultSeekSec,
                      regionId: pin.id,
                    })
                  }
                  className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border shrink-0 cursor-pointer ${
                    isCurrent
                      ? "bg-[#e04040] text-white border-black"
                      : "bg-[#f5f5f5] text-black border-black/30 hover:border-black"
                  }`}
                >
                  {pin.code}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          2. DOCUMENT PICTURE-IN-PICTURE FLOATING OS COMMAND CENTER PORTAL
      ══════════════════════════════════════════════════════════════════════ */}
      {pipWindow &&
        pipPortalRoot &&
        createPortal(
          <div className="min-h-screen bg-white text-black flex flex-col font-sans select-none">
            {/* PiP Header Masthead */}
            <div className="bg-black text-white px-3 py-2 flex items-center justify-between border-b-2 border-[#e04040]">
              <div>
                <span className="bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest mr-2">
                  LEONIDA VICE PiP
                </span>
                <span className="font-mono text-[11px] font-bold text-[#00f3ff]">
                  TC {formatPreciseTimecode(currentTimeSec)} (#{frameNumber})
                </span>
              </div>
              <button
                type="button"
                onClick={closeDocumentPiP}
                className="bg-white hover:bg-[#e04040] text-black hover:text-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase cursor-pointer"
              >
                ↩ DOCK TO NEWSPAPER
              </button>
            </div>

            {/* 16:9 Live Video Slot inside Document PiP Window */}
            <div
              ref={(el) => {
                pipVideoSlotRef.current = el;
                if (el && videoStageNodeRef.current && videoStageNodeRef.current.parentElement !== el) {
                  el.appendChild(videoStageNodeRef.current);
                  ensureVideosKeepPlaying(videoStageNodeRef.current);
                }
              }}
              className="relative w-full aspect-video bg-black border-b-2 border-black overflow-hidden"
            />

            {/* X-Ray Telemetry Summary inside PiP Window */}
            <div className="p-3 bg-[#f8f8f8] border-b border-black space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase text-[#e04040]">
                  [{formatShortTimecode(activeCue.startTime)}–{formatShortTimecode(activeCue.endTime)}]{" "}
                  {activeCue.location.regionName}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase bg-black text-white px-1.5 py-0.5">
                  {presenceCount} WATCHING
                </span>
              </div>
              <div className="font-bold text-[13px] leading-snug text-black">
                {activeCue.cueTitle}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-white border border-black p-2">
                <div>
                  <div className="text-[9.5px] font-bold uppercase text-[#e04040]">VEHICLE ASSET</div>
                  <div className="font-bold truncate">{activeCue.vehicle.name}</div>
                  <div className="text-[10px] text-black/65">
                    Trunk Locker: {activeCue.vehicle.trunkLockerSlots}/6 Slots
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-bold uppercase text-[#e04040]">TACTICAL GEAR</div>
                  <div className="font-bold truncate">{activeCue.weaponOrGear.name}</div>
                  <div className="text-[10px] text-black/65">{activeCue.character.name}</div>
                </div>
              </div>

              {/* Quick Region Jump Buttons inside PiP */}
              <div className="flex items-center gap-1 flex-wrap">
                {LEONIDA_REGION_PINS.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() =>
                      dispatchVideoSeekCommand({
                        timestampSec: pin.defaultSeekSec,
                        regionId: pin.id,
                      })
                    }
                    className={`px-2 py-0.5 text-[9.5px] font-mono font-bold uppercase border cursor-pointer ${
                      activeCue.location.regionId === pin.id
                        ? "bg-[#e04040] text-white border-black"
                        : "bg-white text-black border-black/40"
                    }`}
                  >
                    {pin.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Citizen Wire Chat inside Document PiP Window */}
            <div className="flex-1 min-h-0 flex flex-col p-3 bg-white">
              <div className="text-[11px] font-extrabold uppercase tracking-wider pb-1.5 mb-2 border-b border-black flex items-center justify-between">
                <span>LIVE CITIZEN WIRE</span>
                <span className="text-[#e04040] text-[10px]">● {presenceCount} LIVE</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[160px]">
                {messages.slice(-15).map((m) => (
                  <div key={m.id} className="text-[11.5px] border-b border-black/10 pb-1.5">
                    <span className="font-bold uppercase text-black mr-1.5">@{m.username}:</span>
                    <span className="text-black/85">{m.content}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="mt-2 flex border border-black border-b-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={`Dispatch as @${currentUsername}...`}
                  className="flex-1 px-2.5 py-1.5 text-[12px] outline-none"
                />
                <button
                  type="submit"
                  className="px-3 bg-[#e04040] text-white font-bold uppercase text-[11px] cursor-pointer"
                >
                  SEND
                </button>
              </form>
            </div>
          </div>,
          pipPortalRoot
        )}
    </>
  );
}
