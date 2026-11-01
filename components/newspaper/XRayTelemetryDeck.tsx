"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { VideoItem } from "@/lib/video/types";
import {
  buildWebVttFromCues,
  dispatchVideoSeekCommand,
  formatPreciseTimecode,
  formatShortTimecode,
  generateXRayCuesForVideo,
  LEONIDA_REGION_PINS,
  type LeonidaRegionId,
  type ProvenanceBadge,
  type XRayMetadataCue,
} from "@/lib/video/xray-telemetry";
import type { PlayerTelemetryState } from "@/components/video-engine/HTML5Player";

export interface XRayTelemetryDeckProps {
  currentVideoItem: VideoItem | null;
  telemetry: PlayerTelemetryState | null;
  onOpenForensicLoupe?: () => void;
  onDetachPiP?: () => void;
  isPiPActive?: boolean;
}

function ProvenancePill({ badge }: { badge: ProvenanceBadge }) {
  if (badge === "CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-1 bg-black text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        CONFIRMED RAGE 9
      </span>
    );
  }
  if (badge === "LEAK_ARCHIVE") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui">
        ⚠ LEAK ARCHIVE TELEMETRY
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-amber-500 text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui">
      ◈ ANALYST SPECULATION
    </span>
  );
}

export default function XRayTelemetryDeck({
  currentVideoItem,
  telemetry,
  onOpenForensicLoupe,
  onDetachPiP,
  isPiPActive = false,
}: XRayTelemetryDeckProps) {
  const [activeTab, setActiveTab] = useState<"xray" | "radar" | "cues">("xray");

  const fallbackCues = useMemo(
    () => generateXRayCuesForVideo(currentVideoItem),
    [currentVideoItem]
  );

  const cues = telemetry?.cues && telemetry.cues.length > 0 ? telemetry.cues : fallbackCues;
  const activeCue: XRayMetadataCue =
    telemetry?.activeCue ?? cues[0];

  const currentTimeSec = telemetry?.currentTimeSec ?? 0;
  const frameNumber = telemetry?.frameNumber ?? 0;
  const fps = telemetry?.fps ?? 30;
  const isForensicHold = telemetry?.isForensicHold ?? false;

  const handleTriggerLoupe = () => {
    if (onOpenForensicLoupe) {
      onOpenForensicLoupe();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lv:toggle-forensic-loupe"));
    }
  };

  const handleSeekToCue = (cue: XRayMetadataCue, pauseForensic = false) => {
    dispatchVideoSeekCommand({
      timestampSec: cue.startTime + 0.15,
      regionId: cue.location.regionId,
      reason: `cue_${cue.id}`,
      autoPauseForensic: pauseForensic,
    });
    if (pauseForensic) {
      handleTriggerLoupe();
    }
  };

  const handleRegionPinClick = (regionId: LeonidaRegionId) => {
    const matchedCue = cues.find((c) => c.location.regionId === regionId);
    const pin = LEONIDA_REGION_PINS.find((p) => p.id === regionId);
    dispatchVideoSeekCommand({
      timestampSec: matchedCue ? matchedCue.startTime + 0.2 : pin?.defaultSeekSec ?? 0,
      regionId,
      reason: `radar_pin_${regionId}`,
      autoPauseForensic: false,
    });
  };

  const handleDownloadWebVtt = () => {
    const vtt = buildWebVttFromCues(cues);
    const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leonida-vice-xray-${currentVideoItem?.id || "broadcast"}.vtt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="mt-4 border border-black border-b-[4px] bg-white">
      {/* ── TOP TELEMETRY STATUS & TAB BAR ────────────────────────────────── */}
      <div className="bg-black text-white px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-black">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest np-ui">
            BI-DIRECTIONAL X-RAY BUS
          </span>
          <span className="font-mono text-[11px] font-bold text-white/90">
            TC {formatPreciseTimecode(currentTimeSec)} • FR #{frameNumber} ({fps}fps)
          </span>
          {isForensicHold && (
            <span className="bg-amber-400 text-black px-1.5 py-0.5 text-[9.5px] font-mono font-extrabold uppercase">
              HOLD / MANUAL SEEK
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleTriggerLoupe}
            className="bg-white hover:bg-[#e04040] text-black hover:text-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer np-ui"
          >
            🔬 8× LOUPE &amp; STORYBOARD
          </button>
          {onDetachPiP && (
            <button
              type="button"
              onClick={onDetachPiP}
              className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer np-ui border ${
                isPiPActive
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-black hover:bg-white text-white hover:text-black border-white/40"
              }`}
              title="Detach live broadcast + forensic controls + Citizen Wire into an always-on-top floating window"
            >
              {isPiPActive ? "⧉ DOCK PLAYER" : "⧉ DETACH PiP COMMAND"}
            </button>
          )}
        </div>
      </div>

      {/* ── NAVIGATION TABS ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-b border-black bg-[#f6f6f6] text-center">
        {[
          { id: "xray", label: "📡 LIVE X-RAY ASSETS" },
          { id: "radar", label: "🗺️ LEONIDA RADAR SYNC" },
          { id: "cues", label: "⏱️ CUE SHEET & GEO" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as "xray" | "radar" | "cues")}
            className={`py-2 px-2 text-[11px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer border-r last:border-r-0 border-black np-ui ${
              activeTab === tab.id
                ? "bg-white text-[#e04040] border-b-2 border-b-[#e04040]"
                : "text-black/75 hover:bg-white hover:text-black"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE CUE BANNER ─────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-[#fafafa] border-b border-black/15 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase text-[#e04040]">
              [{formatShortTimecode(activeCue.startTime)}–{formatShortTimecode(activeCue.endTime)}]
            </span>
            <span className="font-bold text-[13.5px] text-black np-ui truncate">
              {activeCue.cueTitle}
            </span>
          </div>
          <p className="text-[12px] text-black/75 np-slab mt-0.5 line-clamp-2">
            {activeCue.forensicNote}
          </p>
        </div>
        <ProvenancePill badge={activeCue.provenance} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: LIVE X-RAY ASSETS (Vehicle Trunk Locker, Weapons, Characters)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "xray" && (
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* VEHICLE & TRUNK LOCKER CARD */}
            <div className="border border-black p-3 bg-white">
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-black/15">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e04040] np-ui">
                  🚘 ON-SCREEN VEHICLE TELEMETRY
                </span>
                {activeCue.vehicle.hswUpgradeable && (
                  <span className="bg-black text-white px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase">
                    HSW SPEC
                  </span>
                )}
              </div>
              <div className="font-extrabold text-[17px] leading-tight text-black np-head">
                {activeCue.vehicle.name}
              </div>
              <div className="text-[11px] text-black/65 np-ui mt-0.5">
                {activeCue.vehicle.manufacturer} • {activeCue.vehicle.vehicleClass} • Est.{" "}
                <strong>{activeCue.vehicle.estTopSpeedMph} MPH</strong>
              </div>

              {/* RDR2-Style Trunk Gun Locker Slot Visualizer */}
              <div className="mt-2.5 pt-2 border-t border-black/10">
                <div className="flex items-center justify-between text-[10.5px] font-bold uppercase np-ui">
                  <span>TRUNK GUN LOCKER CAPACITY</span>
                  <span className="text-[#e04040]">{activeCue.vehicle.trunkLockerSlots} / 6 SLOTS</span>
                </div>
                <div className="grid grid-cols-6 gap-1 mt-1">
                  {Array.from({ length: 6 }, (_, idx) => {
                    const filled = idx < activeCue.vehicle.trunkLockerSlots;
                    return (
                      <div
                        key={idx}
                        className={`h-2.5 border border-black ${
                          filled ? "bg-[#e04040]" : "bg-black/10"
                        }`}
                        title={
                          filled
                            ? `Trunk Slot #${idx + 1}: Active Longarm / Contraband Storage`
                            : `Trunk Slot #${idx + 1}: Empty`
                        }
                      />
                    );
                  })}
                </div>
                <p className="text-[11px] text-black/75 np-ui mt-1.5">
                  <strong>Cockpit Trim:</strong> {activeCue.vehicle.interiorFeature}
                </p>
              </div>
            </div>

            {/* WEAPON & LUCIA TACTICAL HACKING GEAR CARD */}
            <div className="border border-black p-3 bg-white">
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-black/15">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e04040] np-ui">
                  🛠️ WEAPON &amp; TACTICAL LOADOUT
                </span>
                <span className="bg-[#f0f0f0] border border-black/30 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-black">
                  {activeCue.weaponOrGear.category.split(" (")[0]}
                </span>
              </div>
              <div className="font-extrabold text-[17px] leading-tight text-black np-head">
                {activeCue.weaponOrGear.name}
              </div>
              <div className="text-[11px] font-semibold text-black/70 np-ui mt-0.5">
                Carry Rule: {activeCue.weaponOrGear.carryLimitNote}
              </div>
              <p className="mt-2 pt-2 border-t border-black/10 text-[11.5px] leading-snug text-black/85 np-slab">
                {activeCue.weaponOrGear.tacticalEffect}
              </p>
            </div>
          </div>

          {/* CHARACTER RELATIONSHIP BAR + PARODY ECONOMY TICKER */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 border border-black p-3 bg-[#fcfcfc]">
            <div className="sm:col-span-7 sm:pr-3 sm:border-r sm:border-black/20">
              <div className="flex items-center justify-between text-[10.5px] font-extrabold uppercase np-ui">
                <span className="text-[#e04040]">👥 PROTAGONIST / NPC TELEMETRY</span>
                <span>TRUST SYNC: {activeCue.character.relationshipSyncPct}%</span>
              </div>
              <div className="font-bold text-[14px] text-black np-ui mt-0.5">
                {activeCue.character.name}{" "}
                <span className="text-black/60 font-normal">({activeCue.character.role})</span>
              </div>
              <div className="w-full h-2 bg-black/10 border border-black mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#e04040] transition-all duration-500"
                  style={{ width: `${activeCue.character.relationshipSyncPct}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] text-black/80 np-ui">
                <strong>Active Mechanic:</strong> {activeCue.character.activeMechanic}
              </div>
            </div>

            <div className="sm:col-span-5 flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-black/60 np-ui">
                  📱 IN-GAME APP TICKER ({activeCue.economyTicker.appName})
                </div>
                <div className="font-bold text-[12.5px] text-black np-ui mt-0.5">
                  {activeCue.economyTicker.liveMetricLabel}
                </div>
                <div className="font-mono font-extrabold text-[13px] text-[#e04040]">
                  {activeCue.economyTicker.liveMetricValue}
                </div>
              </div>
              {activeCue.radioTrack && (
                <div className="mt-2 pt-1.5 border-t border-black/15 text-[10.5px] np-ui text-black/75 truncate">
                  🎵 <strong>{activeCue.radioTrack.station}:</strong> &ldquo;{activeCue.radioTrack.trackTitle}&rdquo; — {activeCue.radioTrack.artist}
                </div>
              )}
            </div>
          </div>

          {/* QUICK CUE JUMP STRIP + RELATED INVESTIGATION LINK */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase text-black/60 mr-1 np-ui">
                JUMP TO SCENE:
              </span>
              {cues.map((c, idx) => {
                const isActive = c.id === activeCue.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSeekToCue(c, false)}
                    className={`px-2 py-0.5 text-[10.5px] font-mono font-bold border transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#e04040] text-white border-black"
                        : "bg-white text-black border-black/40 hover:border-black"
                    }`}
                    title={`Seek video to ${c.location.regionName}: ${c.cueTitle}`}
                  >
                    #{idx + 1} {formatShortTimecode(c.startTime)}
                  </button>
                );
              })}
            </div>

            <Link
              href={`/${activeCue.relatedArticleSlug}`}
              className="text-[11px] font-extrabold uppercase tracking-wider text-[#e04040] hover:text-black np-ui"
            >
              READ DOSSIER: {activeCue.location.regionName.toUpperCase()} ›
            </Link>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: BI-DIRECTIONAL LEONIDA RADAR MAP (Video <-> Map Sync)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "radar" && (
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* INTERACTIVE SVG LEONIDA TACTICAL RADAR */}
            <div className="md:col-span-7 relative aspect-[16/11] bg-[#0b131e] border-2 border-black overflow-hidden select-none">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                {/* Radar Tactical Grid Lines */}
                <defs>
                  <pattern id="lvRadarGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="rgba(0, 243, 255, 0.09)"
                      strokeWidth="0.3"
                    />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#lvRadarGrid)" />

                {/* Stylized Leonida Peninsula & Keys Coastline Polygon */}
                <path
                  d="M 18,10 L 68,8 L 78,28 L 84,56 L 76,74 L 66,85 L 54,92 L 50,87 L 60,78 L 44,74 L 32,62 L 20,52 L 22,32 Z"
                  fill="rgba(26, 46, 58, 0.85)"
                  stroke="rgba(0, 243, 255, 0.45)"
                  strokeWidth="0.8"
                />

                {/* Lake Leonida Central Waterbody */}
                <ellipse
                  cx="52"
                  cy="48"
                  rx="8"
                  ry="6"
                  fill="#0b131e"
                  stroke="rgba(0, 243, 255, 0.35)"
                  strokeWidth="0.5"
                />

                {/* Overseas Highway Bridge Line to Leonida Keys */}
                <path
                  d="M 74,64 Q 68,78 56,90"
                  fill="none"
                  stroke="#e04040"
                  strokeWidth="0.7"
                  strokeDasharray="1.5 1"
                />

                {/* Active Camera Frustum Cone at activeCue.location */}
                <g
                  transform={`translate(${activeCue.location.radarX}, ${activeCue.location.radarY}) rotate(${activeCue.location.bearingDeg - 90})`}
                >
                  <polygon
                    points="0,0 18,-9 18,9"
                    fill="rgba(224, 64, 64, 0.28)"
                    stroke="#e04040"
                    strokeWidth="0.4"
                  />
                </g>

                {/* All 6 Clickable Leonida Region Pins */}
                {LEONIDA_REGION_PINS.map((pin) => {
                  const isCurrent = activeCue.location.regionId === pin.id;
                  return (
                    <g
                      key={pin.id}
                      onClick={() => handleRegionPinClick(pin.id)}
                      className="cursor-pointer"
                    >
                      {isCurrent && (
                        <circle
                          cx={pin.radarX}
                          cy={pin.radarY}
                          r="6.5"
                          fill="rgba(224, 64, 64, 0.3)"
                        />
                      )}
                      <circle
                        cx={pin.radarX}
                        cy={pin.radarY}
                        r={isCurrent ? "3.2" : "2.3"}
                        fill={isCurrent ? "#e04040" : "#00f3ff"}
                        stroke="#000000"
                        strokeWidth="0.7"
                      />
                      <text
                        x={pin.radarX + 4}
                        y={pin.radarY + 1}
                        fill={isCurrent ? "#ffffff" : "rgba(255,255,255,0.78)"}
                        fontSize={isCurrent ? "3.6" : "3.0"}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {pin.code}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Top-left Radar Overlay Badge */}
              <div className="absolute top-2 left-2 bg-black/85 border border-white/25 px-2 py-1 text-[10px] font-mono text-white">
                <span className="text-[#e04040] font-bold">LIVE FRUSTUM:</span>{" "}
                {activeCue.location.latLngLabel} ({activeCue.location.bearingDeg}°)
              </div>

              <div className="absolute bottom-2 left-2 right-2 bg-black/80 px-2.5 py-1 text-[10px] font-mono text-[#00f3ff] flex items-center justify-between">
                <span>CLICK ANY COUNTY PIN TO SEEK VIDEO PLAYER</span>
                <span>{activeCue.location.weather}</span>
              </div>
            </div>

            {/* REGION SELECTOR BUTTONS (Bi-Directional Inbound Seek) */}
            <div className="md:col-span-5 space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-black np-ui mb-2">
                CLICK REGION TO SEEK IN-ENGINE FOOTAGE:
              </div>
              {LEONIDA_REGION_PINS.map((pin) => {
                const isCurrent = activeCue.location.regionId === pin.id;
                return (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => handleRegionPinClick(pin.id)}
                    className={`w-full text-left px-3 py-2 border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isCurrent
                        ? "bg-black text-white border-black border-l-4 border-l-[#e04040]"
                        : "bg-white hover:bg-[#f5f5f5] text-black border-black/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-extrabold uppercase np-ui truncate">
                        {pin.name}{" "}
                        <span className="font-mono text-[10px] opacity-70">[{pin.code}]</span>
                      </div>
                      <div className="text-[10.5px] opacity-75 truncate np-ui">
                        {pin.signatureVehicle}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 bg-[#e04040] text-white shrink-0">
                      {isCurrent ? "● ON SCREEN" : "▶ SEEK"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: CUE SHEET TIMELINE, WEBVTT EXPORT & 4-BLOCK GEO SPEC MATRIX
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "cues" && (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-black np-ui">
              HTML5 &lt;track kind=&quot;metadata&quot;&gt; CUE MATRIX (CLICK ROW TO SEEK OR LOUPE)
            </div>
            <button
              type="button"
              onClick={handleDownloadWebVtt}
              className="bg-black hover:bg-[#e04040] text-white px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors"
            >
              ⬇ EXPORT .VTT METADATA TRACK
            </button>
          </div>

          <div className="overflow-x-auto border border-black">
            <table className="w-full text-left border-collapse text-[11.5px] np-ui">
              <thead>
                <tr className="bg-black text-white uppercase text-[10px] tracking-wider">
                  <th className="py-2 px-2.5">TIMECODE</th>
                  <th className="py-2 px-2.5">LEONIDA REGION</th>
                  <th className="py-2 px-2.5">ON-SCREEN VEHICLE / GEAR</th>
                  <th className="py-2 px-2.5">PROVENANCE</th>
                  <th className="py-2 px-2.5 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {cues.map((cue) => {
                  const isCurrent = cue.id === activeCue.id;
                  return (
                    <tr
                      key={cue.id}
                      className={`border-t border-black/20 ${
                        isCurrent ? "bg-[#fff2f2] font-semibold" : "hover:bg-[#f7f7f7]"
                      }`}
                    >
                      <td className="py-2 px-2.5 font-mono text-[11px] whitespace-nowrap">
                        {formatShortTimecode(cue.startTime)}–{formatShortTimecode(cue.endTime)}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-black">{cue.location.regionName}</div>
                        <div className="text-[10px] text-black/60">{cue.location.landmark}</div>
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="text-black">{cue.vehicle.name}</div>
                        <div className="text-[10px] text-[#e04040]">{cue.weaponOrGear.name}</div>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 border border-black/30 bg-white">
                          {cue.provenance}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => handleSeekToCue(cue, false)}
                          className="px-2 py-0.5 bg-black hover:bg-[#e04040] text-white text-[10px] font-bold uppercase cursor-pointer"
                        >
                          ▶ SEEK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSeekToCue(cue, true)}
                          className="px-2 py-0.5 border border-black hover:bg-black hover:text-white text-[10px] font-bold uppercase cursor-pointer"
                          title="Seek & open 800% Forensic Loupe at this exact timestamp"
                        >
                          🔬 LOUPE
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
