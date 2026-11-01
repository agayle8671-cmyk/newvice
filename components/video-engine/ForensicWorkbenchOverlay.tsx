"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { VideoItem } from "@/lib/video/types";
import {
  formatPreciseTimecode,
  saveForensicFrameToDrafts,
  getSavedForensicFrames,
  type CapturedForensicFrame,
  type XRayMetadataCue,
} from "@/lib/video/xray-telemetry";

export interface ForensicAnnotationBox {
  id: string;
  /** Normalized 0..1 coordinates on the canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface ForensicWorkbenchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  getVideoElement: () => HTMLVideoElement | null;
  currentItem: VideoItem | null;
  currentTimeSec: number;
  frameNumber: number;
  fps: number;
  isPlaying: boolean;
  isForensicHold: boolean;
  activeCue: XRayMetadataCue | null;
  allCues: XRayMetadataCue[];
  onStepFrames: (deltaFrames: number) => void;
  onTogglePlay: () => void;
  onSeekToSeconds: (sec: number, pauseOnArrival?: boolean) => void;
  onResumeRoomSync: () => void;
}

export default function ForensicWorkbenchOverlay({
  isOpen,
  onClose,
  getVideoElement,
  currentItem,
  currentTimeSec,
  frameNumber,
  fps,
  isPlaying,
  isForensicHold,
  activeCue,
  allCues,
  onStepFrames,
  onTogglePlay,
  onSeekToSeconds,
  onResumeRoomSync,
}: ForensicWorkbenchOverlayProps) {
  const viewportCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Zoom (1x to 8x) and Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<"pan" | "annotate">("pan");
  const [annotationLabel, setAnnotationLabel] = useState("RAGE 9 DETAIL / EASTER EGG");
  const [annotations, setAnnotations] = useState<ForensicAnnotationBox[]>([]);

  // Dragging state for pan or bounding-box drawing
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    curX: number;
    curY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    curX: 0,
    curY: 0,
  });

  // Captured frames tray + Contact Sheet preview modal
  const [trayFrames, setTrayFrames] = useState<CapturedForensicFrame[]>([]);
  const [storyboardDataUrl, setStoryboardDataUrl] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);

  useEffect(() => {
    setTrayFrames(getSavedForensicFrames());
  }, [isOpen]);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Reset zoom/pan cleanly if requested
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Render the active <video> frame + zoom/pan transform + forensic reticle + annotations onto the canvas
  const renderForensicCanvas = useCallback(() => {
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, W, H);

    const videoEl = getVideoElement();

    ctx.save();
    // Apply zoom centered around canvas midpoint + pan offset
    const centerX = W / 2;
    const centerY = H / 2;
    ctx.translate(centerX + pan.x, centerY + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-centerX, -centerY);

    let drewVideo = false;
    if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
      try {
        ctx.drawImage(videoEl, 0, 0, W, H);
        drewVideo = true;
      } catch {
        drewVideo = false;
      }
    }

    if (!drewVideo) {
      // High-contrast forensic telemetry fallback grid if video buffer is still warming up
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#12131a");
      grad.addColorStop(1, "#1e0b10");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(224,64,64,0.18)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 48) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 48) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }
    }

    // Draw saved bounding-box annotations in world space so they scale with zoom!
    for (const box of annotations) {
      const bx = box.x * W;
      const by = box.y * H;
      const bw = box.w * W;
      const bh = box.h * H;

      ctx.strokeStyle = "#e04040";
      ctx.lineWidth = Math.max(1.5, 2.5 / zoom);
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = "rgba(224, 64, 64, 0.14)";
      ctx.fillRect(bx, by, bw, bh);

      // Label tag
      ctx.fillStyle = "#e04040";
      const tagH = Math.max(14, 22 / zoom);
      const fontPx = Math.max(9, Math.round(12 / Math.sqrt(zoom)));
      ctx.font = `bold ${fontPx}px monospace`;
      const textWidth = ctx.measureText(box.label).width + 12;
      ctx.fillRect(bx, Math.max(0, by - tagH), textWidth, tagH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(box.label, bx + 6, Math.max(10, by - tagH / 3));
    }

    ctx.restore();

    // If user is actively dragging a new annotation box in screen space
    if (toolMode === "annotate" && dragRef.current.active) {
      const { startX, startY, curX, curY } = dragRef.current;
      const rx = Math.min(startX, curX);
      const ry = Math.min(startY, curY);
      const rw = Math.abs(curX - startX);
      const rh = Math.abs(curY - startY);
      ctx.save();
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    // Subtle forensic crosshair reticle + HUD telemetry burn-in
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 18, H / 2);
    ctx.lineTo(W / 2 + 18, H / 2);
    ctx.moveTo(W / 2, H / 2 - 18);
    ctx.lineTo(W / 2, H / 2 + 18);
    ctx.stroke();

    // Top-left burned-in forensic watermark bar
    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    ctx.fillRect(14, 14, 470, 30);
    ctx.fillStyle = "#e04040";
    ctx.fillRect(14, 14, 6, 30);
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#ffffff";
    const locLabel = activeCue?.location.regionName || "LEONIDA METRO";
    ctx.fillText(
      `LEONIDA VICE FORENSIC // TC ${formatPreciseTimecode(currentTimeSec)} // FR #${frameNumber} // ${zoom.toFixed(1)}x ZOOM // ${locLabel.toUpperCase()}`,
      28,
      33
    );
    ctx.restore();
  }, [
    getVideoElement,
    pan.x,
    pan.y,
    zoom,
    annotations,
    toolMode,
    currentTimeSec,
    frameNumber,
    activeCue,
  ]);

  // Animation loop while Forensic Loupe is open
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const tick = () => {
      renderForensicCanvas();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, renderForensicCanvas]);

  // Keyboard shortcuts for frame-by-frame stepping
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === ",") {
        e.preventDefault();
        onStepFrames(e.shiftKey ? -10 : -1);
      } else if (e.key === "ArrowRight" || e.key === ".") {
        e.preventDefault();
        onStepFrames(e.shiftKey ? 10 : 1);
      } else if (e.key === " ") {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onStepFrames, onTogglePlay, onClose]);

  if (!isOpen) return null;

  // Canvas mouse handlers for 800% pan & bounding-box drawing
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = viewportCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    dragRef.current = {
      active: true,
      startX: pt.x,
      startY: pt.y,
      origPanX: pan.x,
      origPanY: pan.y,
      curX: pt.x,
      curY: pt.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const pt = getCanvasCoords(e);
    dragRef.current.curX = pt.x;
    dragRef.current.curY = pt.y;

    if (toolMode === "pan") {
      const dx = pt.x - dragRef.current.startX;
      const dy = pt.y - dragRef.current.startY;
      setPan({
        x: dragRef.current.origPanX + dx,
        y: dragRef.current.origPanY + dy,
      });
    }
  };

  const handleMouseUp = () => {
    if (!dragRef.current.active) return;
    const { startX, startY, curX, curY } = dragRef.current;
    dragRef.current.active = false;

    if (toolMode === "annotate") {
      const canvas = viewportCanvasRef.current;
      if (!canvas) return;
      const rw = Math.abs(curX - startX);
      const rh = Math.abs(curY - startY);
      if (rw > 18 && rh > 18) {
        // Convert screen coordinates back to world (unzoomed) 0..1 coordinates
        const W = canvas.width;
        const H = canvas.height;
        const centerX = W / 2;
        const centerY = H / 2;
        const toWorldX = (sx: number) => ((sx - centerX - pan.x) / zoom + centerX) / W;
        const toWorldY = (sy: number) => ((sy - centerY - pan.y) / zoom + centerY) / H;

        const wx1 = toWorldX(Math.min(startX, curX));
        const wy1 = toWorldY(Math.min(startY, curY));
        const wx2 = toWorldX(Math.max(startX, curX));
        const wy2 = toWorldY(Math.max(startY, curY));

        setAnnotations((prev) => [
          ...prev,
          {
            id: `ann_${Date.now()}`,
            x: Math.max(0, Math.min(0.95, wx1)),
            y: Math.max(0, Math.min(0.95, wy1)),
            w: Math.max(0.03, Math.min(1, wx2 - wx1)),
            h: Math.max(0.03, Math.min(1, wy2 - wy1)),
            label: annotationLabel.trim() || "FORENSIC EVIDENCE",
          },
        ]);
        showToast("Callout marker added to frame.");
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    setZoom((prev) => {
      const next = Math.max(1, Math.min(8, Number((prev * factor).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Safe export of current canvas frame (falls back to clean telemetry render if CDN tainted canvas)
  const exportCurrentFrameDataUrl = (): string => {
    renderForensicCanvas();
    const canvas = viewportCanvasRef.current;
    if (canvas) {
      try {
        return canvas.toDataURL("image/png");
      } catch {
        // If unproxied external stream tainted the canvas, generate a clean untainted forensic telemetry card
      }
    }

    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = 960;
    fallbackCanvas.height = 540;
    const fctx = fallbackCanvas.getContext("2d")!;
    fctx.fillStyle = "#0b0c12";
    fctx.fillRect(0, 0, 960, 540);
    fctx.strokeStyle = "#e04040";
    fctx.lineWidth = 4;
    fctx.strokeRect(12, 12, 936, 516);

    fctx.fillStyle = "#e04040";
    fctx.fillRect(12, 12, 936, 48);
    fctx.fillStyle = "#ffffff";
    fctx.font = "bold 20px monospace";
    fctx.fillText(
      `LEONIDA VICE // FORENSIC TELEMETRY CAPTURE // ${formatPreciseTimecode(currentTimeSec)} (FRAME #${frameNumber})`,
      28,
      43
    );

    fctx.fillStyle = "#f5f5f5";
    fctx.font = "bold 26px sans-serif";
    fctx.fillText(
      (currentItem?.title || "GTA VI Live Broadcast Capture").slice(0, 58),
      36,
      120
    );

    fctx.fillStyle = "#00f3ff";
    fctx.font = "bold 18px monospace";
    fctx.fillText(
      `REGION: ${activeCue?.location.regionName || "Vice City"} — ${activeCue?.location.landmark || "Ocean Beach"} (${activeCue?.location.latLngLabel || "25.78° N, 80.13° W"})`,
      36,
      175
    );

    fctx.fillStyle = "#ffffff";
    fctx.font = "16px monospace";
    fctx.fillText(
      `VEHICLE ASSET: ${activeCue?.vehicle.name || "Grotti Cheetah Classic"} (${activeCue?.vehicle.trunkLockerSlots ?? 2} Trunk Slots)`,
      36,
      225
    );
    fctx.fillText(
      `TACTICAL GEAR: ${activeCue?.weaponOrGear.name || "RF Vehicle Tracker Jammer"}`,
      36,
      260
    );
    fctx.fillText(
      `CHARACTER SYNC: ${activeCue?.character.name || "Lucia Caminos"} (${activeCue?.character.relationshipSyncPct ?? 86}% Trust)`,
      36,
      295
    );
    fctx.fillStyle = "#aaaaaa";
    fctx.fillText(
      `NOTE: ${(activeCue?.forensicNote || "Verified RAGE 9 frame telemetry.").slice(0, 92)}`,
      36,
      350
    );

    return fallbackCanvas.toDataURL("image/png");
  };

  // Capture single frame -> save to tray + localStorage (for /admin) + optional immediate PNG download
  const handleSnapFrame = (downloadImmediately = false) => {
    const dataUrl = exportCurrentFrameDataUrl();
    const newFrame: CapturedForensicFrame = {
      id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      videoId: currentItem?.id || "broadcast",
      videoTitle: currentItem?.title || "Leonida Vice Broadcast",
      timestampSec: currentTimeSec,
      timestampFormatted: formatPreciseTimecode(currentTimeSec),
      frameNumber,
      fps,
      dataUrl,
      width: 960,
      height: 540,
      regionName: activeCue?.location.regionName || "Vice City",
      cueTitle: activeCue?.cueTitle || "Frame Analysis",
      annotationNote: annotations[annotations.length - 1]?.label,
      createdAt: new Date().toISOString(),
    };

    const updated = saveForensicFrameToDrafts(newFrame);
    setTrayFrames(updated);

    if (downloadImmediately) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `leonida-vice-frame-${frameNumber}-${Math.round(currentTimeSec)}s.png`;
      a.click();
      showToast(`Downloaded PNG Frame #${frameNumber} & saved to /admin Studio!`);
    } else {
      showToast(`Captured Frame #${frameNumber} (${formatPreciseTimecode(currentTimeSec)}) to Storyboard Tray & /admin!`);
    }
  };

  // Generate 6-Tile Branded LEONIDA VICE Contact Sheet Storyboard PNG
  const handleGenerateContactSheet = async () => {
    setIsGeneratingSheet(true);
    try {
      // Use up to 6 frames from tray, or synthesize 6 cue frames if fewer than 2 snapped
      let sourceFrames = trayFrames.slice(0, 6);
      if (sourceFrames.length === 0) {
        const currentSnapUrl = exportCurrentFrameDataUrl();
        sourceFrames = (allCues.length > 0 ? allCues.slice(0, 6) : [activeCue]).map(
          (cue, idx) => ({
            id: `auto_${idx}`,
            videoId: currentItem?.id || "broadcast",
            videoTitle: currentItem?.title || "GTA VI Broadcast",
            timestampSec: cue?.startTime ?? idx * 10,
            timestampFormatted: formatPreciseTimecode(cue?.startTime ?? idx * 10),
            frameNumber: Math.round((cue?.startTime ?? idx * 10) * fps),
            fps,
            dataUrl: currentSnapUrl,
            width: 960,
            height: 540,
            regionName: cue?.location.regionName || "Vice City Metro",
            cueTitle: cue?.cueTitle || `Forensic Segment #${idx + 1}`,
            createdAt: new Date().toISOString(),
          })
        );
      }

      const cols = 3;
      const rows = Math.max(1, Math.ceil(sourceFrames.length / cols));
      const tileW = 560;
      const tileH = 315;
      const pad = 24;
      const headerH = 120;
      const footerH = 52;

      const sheetW = cols * tileW + (cols + 1) * pad;
      const sheetH = headerH + rows * (tileH + 58) + pad + footerH;

      const sheet = document.createElement("canvas");
      sheet.width = sheetW;
      sheet.height = sheetH;
      const sctx = sheet.getContext("2d")!;

      // Crisp newspaper white/black broadsheet styling
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, sheetW, sheetH);

      // Outer broadsheet frame
      sctx.strokeStyle = "#000000";
      sctx.lineWidth = 6;
      sctx.strokeRect(6, 6, sheetW - 12, sheetH - 12);

      // Header Banner
      sctx.fillStyle = "#000000";
      sctx.fillRect(12, 12, sheetW - 24, headerH - 20);
      sctx.fillStyle = "#e04040";
      sctx.fillRect(12, headerH - 12, sheetW - 24, 6);

      sctx.fillStyle = "#e04040";
      sctx.font = "italic 900 38px serif";
      sctx.fillText("LEONIDA VICE", 34, 60);

      sctx.fillStyle = "#ffffff";
      sctx.font = "bold 20px monospace";
      sctx.fillText(
        "// FORENSIC VIDEO TELEMETRY CONTACT SHEET & FRAME-BY-FRAME STORYBOARD",
        335,
        56
      );

      sctx.fillStyle = "#cccccc";
      sctx.font = "15px monospace";
      sctx.fillText(
        `SOURCE: ${(currentItem?.title || "GTA VI Synchronized Broadcast").slice(0, 75)}  |  CREATOR: @${currentItem?.creatorName || "RockstarGames"}  |  RATE: ${fps} FPS`,
        34,
        90
      );

      // Load each frame image and draw into the 3-column grid
      const loadImage = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });

      for (let i = 0; i < sourceFrames.length; i++) {
        const f = sourceFrames[i];
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = pad + c * (tileW + pad);
        const y = headerH + 12 + r * (tileH + 58);

        // Tile border
        sctx.fillStyle = "#0a0a0e";
        sctx.fillRect(x, y, tileW, tileH);

        const img = await loadImage(f.dataUrl);
        if (img) {
          sctx.drawImage(img, x, y, tileW, tileH);
        }

        sctx.strokeStyle = "#000000";
        sctx.lineWidth = 3;
        sctx.strokeRect(x, y, tileW, tileH);

        // Timestamp pill in top-right of tile
        sctx.fillStyle = "#e04040";
        sctx.fillRect(x + tileW - 195, y + 10, 185, 26);
        sctx.fillStyle = "#ffffff";
        sctx.font = "bold 13px monospace";
        sctx.fillText(`${f.timestampFormatted} • #${f.frameNumber}`, x + tileW - 186, y + 28);

        // Caption strip below tile
        sctx.fillStyle = "#f4f4f4";
        sctx.fillRect(x, y + tileH + 4, tileW, 42);
        sctx.strokeStyle = "#000000";
        sctx.lineWidth = 1;
        sctx.strokeRect(x, y + tileH + 4, tileW, 42);

        sctx.fillStyle = "#e04040";
        sctx.font = "bold 12px monospace";
        sctx.fillText(`[${f.regionName.toUpperCase()}]`, x + 10, y + tileH + 22);

        sctx.fillStyle = "#111111";
        sctx.font = "bold 13px sans-serif";
        sctx.fillText(f.cueTitle.slice(0, 56), x + 10, y + tileH + 39);
      }

      // Footer
      sctx.fillStyle = "#000000";
      sctx.font = "bold 13px monospace";
      sctx.fillText(
        `GENERATED BY LEONIDA VICE FORENSIC WORKBENCH • ${new Date().toUTCString()} • VERIFIED RAGE 9 TELEMETRY`,
        pad,
        sheetH - 20
      );

      const finalUrl = sheet.toDataURL("image/png");
      setStoryboardDataUrl(finalUrl);

      // Also save the composite storyboard into the /admin drafts!
      const storyboardDraft: CapturedForensicFrame = {
        id: `storyboard_${Date.now()}`,
        videoId: currentItem?.id || "broadcast",
        videoTitle: `${currentItem?.title || "GTA VI"} (6-Frame Contact Sheet)`,
        timestampSec: currentTimeSec,
        timestampFormatted: formatPreciseTimecode(currentTimeSec),
        frameNumber,
        fps,
        dataUrl: finalUrl,
        width: sheetW,
        height: sheetH,
        regionName: activeCue?.location.regionName || "Leonida State",
        cueTitle: "6-Frame Forensic Contact Sheet Storyboard",
        createdAt: new Date().toISOString(),
      };
      setTrayFrames(saveForensicFrameToDrafts(storyboardDraft));
      showToast("Generated 6-Frame Contact Sheet & synced to /admin Newsroom Studio!");
    } finally {
      setIsGeneratingSheet(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 bg-black/95 text-white flex flex-col justify-between select-none overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── TOP FORENSIC COMMAND RIBBON ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black border-b-2 border-[#e04040]">
        <div className="flex items-center gap-2">
          <span className="bg-[#e04040] text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5">
            🔬 FORENSIC LOUPE
          </span>
          <span className="font-mono text-[11px] font-bold text-[#00f3ff]">
            TC {formatPreciseTimecode(currentTimeSec)}
          </span>
          <span className="font-mono text-[11px] text-white/75">
            | FRAME #{frameNumber} ({fps} FPS)
          </span>
          {isForensicHold && (
            <button
              type="button"
              onClick={onResumeRoomSync}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 cursor-pointer transition-colors"
              title="Re-lock player to live communal room clock"
            >
              ⚡ LIVE RESYNC
            </button>
          )}
        </div>

        {/* Zoom & Tool Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[1, 2, 4, 8].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                setZoom(z);
                if (z === 1) setPan({ x: 0, y: 0 });
              }}
              className={`px-2 py-0.5 text-[10px] font-mono font-bold border cursor-pointer transition-colors ${
                Math.round(zoom) === z
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-black text-white/80 border-white/25 hover:border-white"
              }`}
            >
              {z}×
            </button>
          ))}

          <button
            type="button"
            onClick={() => setToolMode((m) => (m === "pan" ? "annotate" : "pan"))}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
              toolMode === "annotate"
                ? "bg-[#00f3ff] text-black border-[#00f3ff]"
                : "bg-black text-white/80 border-white/25 hover:border-white"
            }`}
            title="Drag on frame to draw a forensic callout box"
          >
            {toolMode === "annotate" ? "🎯 BOX TOOL: ON" : "✋ PAN LOUPE"}
          </button>

          {annotations.length > 0 && (
            <button
              type="button"
              onClick={() => setAnnotations([])}
              className="px-2 py-0.5 text-[10px] font-bold uppercase bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
            >
              CLEAR BOXES ({annotations.length})
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-1 px-2.5 py-0.5 bg-white text-black hover:bg-[#e04040] hover:text-white text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
          >
            ✕ EXIT LOUPE
          </button>
        </div>
      </div>

      {/* ── OPTIONAL ANNOTATION LABEL INPUT BAR ───────────────────────────── */}
      {toolMode === "annotate" && (
        <div className="flex items-center gap-2 px-3 py-1 bg-[#141622] border-b border-white/15 text-[11px]">
          <span className="text-[#00f3ff] font-mono font-bold uppercase">
            Drag on video to mark detail • Callout Label:
          </span>
          <input
            type="text"
            value={annotationLabel}
            onChange={(e) => setAnnotationLabel(e.target.value)}
            maxLength={42}
            className="bg-black border border-white/30 px-2 py-0.5 text-white font-mono text-[11px] w-64 outline-none focus:border-[#00f3ff]"
            placeholder="e.g. VICE PD PLATE / LUCIA HACKING RIG"
          />
        </div>
      )}

      {/* ── INTERACTIVE 800% ZOOM & ANNOTATION CANVAS VIEWPORT ─────────────── */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-[#050508] overflow-hidden">
        <canvas
          ref={viewportCanvasRef}
          width={960}
          height={540}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full h-full object-contain ${
            toolMode === "annotate" ? "cursor-crosshair" : zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          }`}
        />

        {statusToast && (
          <div className="absolute top-3 right-3 z-30 bg-black/90 border-2 border-[#e04040] px-3 py-1.5 text-[11px] font-mono font-bold text-white shadow-lg">
            ✓ {statusToast}
          </div>
        )}
      </div>

      {/* ── BOTTOM FRAME-STEPPING & CONTACT SHEET EXPORT DECK ─────────────── */}
      <div className="bg-black border-t border-white/20 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Left: -10f / -1f / Play-Pause / +1f / +10f Stepper */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStepFrames(-10)}
            className="px-2 py-1 bg-white/10 hover:bg-[#e04040] text-white font-mono text-[11px] font-bold cursor-pointer transition-colors"
            title="Step Back 10 Frames (Shift + Left Arrow)"
          >
            « -10f
          </button>
          <button
            type="button"
            onClick={() => onStepFrames(-1)}
            className="px-2.5 py-1 bg-white hover:bg-[#e04040] text-black hover:text-white font-mono text-[11px] font-extrabold cursor-pointer transition-colors"
            title="Step Back 1 Frame (Left Arrow)"
          >
            ‹ -1 FRAME
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="px-2.5 py-1 border border-white/40 hover:border-white text-white font-mono text-[11px] font-bold cursor-pointer"
          >
            {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
          </button>
          <button
            type="button"
            onClick={() => onStepFrames(1)}
            className="px-2.5 py-1 bg-white hover:bg-[#e04040] text-black hover:text-white font-mono text-[11px] font-extrabold cursor-pointer transition-colors"
            title="Step Forward 1 Frame (Right Arrow)"
          >
            +1 FRAME ›
          </button>
          <button
            type="button"
            onClick={() => onStepFrames(10)}
            className="px-2 py-1 bg-white/10 hover:bg-[#e04040] text-white font-mono text-[11px] font-bold cursor-pointer transition-colors"
            title="Step Forward 10 Frames (Shift + Right Arrow)"
          >
            +10f »
          </button>
          {zoom > 1 && (
            <button
              type="button"
              onClick={handleResetView}
              className="ml-1 px-2 py-1 text-[10px] font-mono text-[#00f3ff] border border-[#00f3ff]/40 hover:bg-[#00f3ff]/10 cursor-pointer"
            >
              RESET 1×
            </button>
          )}
        </div>

        {/* Right: Snap PNG / Send to /admin / Export Contact Sheet Storyboard */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleSnapFrame(false)}
            className="px-2.5 py-1 bg-[#1b1f2e] hover:bg-[#00f3ff] text-white hover:text-black border border-[#00f3ff]/50 text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
            title="Add frame to Storyboard Tray & make it available inside /admin Newsroom Studio"
          >
            + SNAP TO /ADMIN ({trayFrames.length})
          </button>
          <button
            type="button"
            onClick={() => handleSnapFrame(true)}
            className="px-2.5 py-1 bg-white hover:bg-black text-black hover:text-white border border-white text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
          >
            📸 PNG FRAME
          </button>
          <button
            type="button"
            disabled={isGeneratingSheet}
            onClick={() => void handleGenerateContactSheet()}
            className="px-3 py-1 bg-[#e04040] hover:bg-white text-white hover:text-black text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
          >
            {isGeneratingSheet ? "RENDERING..." : "🎞️ CONTACT SHEET STORYBOARD"}
          </button>
        </div>
      </div>

      {/* ── CONTACT SHEET STORYBOARD PREVIEW MODAL ─────────────────────────── */}
      {storyboardDataUrl && (
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/25">
            <div>
              <span className="bg-[#e04040] text-white text-[10px] font-extrabold uppercase px-2 py-0.5 mr-2">
                STORYBOARD READY
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                LEONIDA VICE 6-FRAME FORENSIC CONTACT SHEET (SYNCED TO /ADMIN STUDIO)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={storyboardDataUrl}
                download={`leonida-vice-storyboard-${Date.now()}.png`}
                className="bg-[#e04040] hover:bg-white text-white hover:text-black px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider"
              >
                ⬇ DOWNLOAD HIGH-RES PNG
              </a>
              <a
                href="/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#00f3ff] hover:bg-white text-black px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider"
              >
                📰 OPEN IN /ADMIN STUDIO ↗
              </a>
              <button
                type="button"
                onClick={() => setStoryboardDataUrl(null)}
                className="bg-white/15 hover:bg-white/30 text-white px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer"
              >
                ✕ BACK TO LOUPE
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black/60 p-2 border border-white/15">
            <img
              src={storyboardDataUrl}
              alt="Leonida Vice Forensic Contact Sheet"
              className="max-h-full max-w-full object-contain border border-white/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}
