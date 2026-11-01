"use client";

import { useEffect, useRef } from "react";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";

// ─── NewVice V3 Living Skyline & 30fps Canvas Aura Projection ────────────────
// Replaces the static drive-in-background.jpg with a multi-layered, reactive
// Vice City nocturnal amphitheater environment:
//   • 30fps 32×18 offscreen canvas samples the active <video> perimeter pixels
//     and projects real-time color-matched aura wash onto the clouds & horizon
//   • 20–120 Hz sub-bass AnalyserNode drives "--vice-sub-bass" across the lot
//   • Diegetic rooftop neon sponsor billboards (AdSlot 2.0) integrated into
//     the Vice City skyline silhouettes
//   • 1-to-5 Star Wanted Level World-State helicopter searchlights & sky tint

interface SkylineBackgroundProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  wantedLevel?: 1 | 2 | 3 | 4 | 5;
  encoreActive?: boolean;
}

export default function SkylineBackground({
  stageRef,
  isPlaying,
  wantedLevel = 2,
  encoreActive = false,
}: SkylineBackgroundProps) {
  const auraSkyRef = useRef<HTMLDivElement>(null);
  const auraHorizonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = 32;
    offscreen.height = 18;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });

    let rTop = 0,
      gTop = 215,
      bTop = 255;
    let rBot = 255,
      gBot = 0,
      bBot = 128;
    let smoothBass = 0.22;
    let phase = 0;

    const tick = () => {
      phase += 0.075;
      const stage = stageRef.current;
      let sampled = false;

      if (ctx && stage) {
        const videos = stage.querySelectorAll("video");
        let activeVideo: HTMLVideoElement | null = null;
        for (const v of videos) {
          if (v.readyState >= 2 && !v.paused && v.style.zIndex === "2") {
            activeVideo = v;
            break;
          }
        }
        if (
          !activeVideo &&
          videos.length > 0 &&
          videos[0].readyState >= 2 &&
          !videos[0].paused
        ) {
          activeVideo = videos[0];
        }

        if (activeVideo) {
          try {
            ctx.drawImage(activeVideo, 0, 0, 32, 18);
            const data = ctx.getImageData(0, 0, 32, 18).data;

            let sumRT = 0,
              sumGT = 0,
              sumBT = 0,
              cntT = 0;
            for (let y = 0; y < 5; y++) {
              for (let x = 2; x < 30; x += 2) {
                const i = (y * 32 + x) * 4;
                sumRT += data[i];
                sumGT += data[i + 1];
                sumBT += data[i + 2];
                cntT++;
              }
            }

            let sumRB = 0,
              sumGB = 0,
              sumBB = 0,
              cntB = 0;
            for (let y = 12; y < 18; y++) {
              for (let x = 2; x < 30; x += 2) {
                const i = (y * 32 + x) * 4;
                sumRB += data[i];
                sumGB += data[i + 1];
                sumBB += data[i + 2];
                cntB++;
              }
            }

            if (cntT > 0 && cntB > 0) {
              rTop = rTop * 0.82 + Math.min(255, (sumRT / cntT) * 1.3 + 15) * 0.18;
              gTop = gTop * 0.82 + Math.min(255, (sumGT / cntT) * 1.25 + 10) * 0.18;
              bTop = bTop * 0.82 + Math.min(255, (sumBT / cntT) * 1.3 + 20) * 0.18;

              rBot = rBot * 0.82 + Math.min(255, (sumRB / cntB) * 1.35 + 20) * 0.18;
              gBot = gBot * 0.82 + Math.min(255, (sumGB / cntB) * 1.2 + 8) * 0.18;
              bBot = bBot * 0.82 + Math.min(255, (sumBB / cntB) * 1.35 + 20) * 0.18;
              sampled = true;
            }
          } catch {
            // Cross-origin embed fallback handled below
          }
        }
      }

      if (!sampled) {
        const w1 = (Math.sin(phase * 0.45) + 1) * 0.5;
        const w2 = (Math.cos(phase * 0.32) + 1) * 0.5;
        rTop = rTop * 0.9 + (25 + w1 * 190) * 0.1;
        gTop = gTop * 0.9 + (150 + w2 * 95) * 0.1;
        bTop = bTop * 0.9 + 250 * 0.1;

        rBot = rBot * 0.9 + (235 - w2 * 90) * 0.1;
        gBot = gBot * 0.9 + (30 + w1 * 135) * 0.1;
        bBot = bBot * 0.9 + (170 + w2 * 80) * 0.1;
      }

      const rawBass = getDriveInAudioGraph().getSubBassEnergy();
      const synthIdle = 0.24 + 0.16 * Math.pow((Math.sin(phase * 1.4) + 1) * 0.5, 2);
      const targetBass = rawBass > 0.02 ? rawBass : synthIdle;
      smoothBass = smoothBass * 0.68 + targetBass * 0.32;

      const rt = Math.round(rTop),
        gt = Math.round(gTop),
        bt = Math.round(bTop);
      const rb = Math.round(rBot),
        gb = Math.round(gBot),
        bb = Math.round(bBot);

      if (auraSkyRef.current) {
        auraSkyRef.current.style.background = `radial-gradient(ellipse 68% 48% at 38% 28%, rgba(${rt},${gt},${bt},${(
          0.28 +
          smoothBass * 0.18
        ).toFixed(3)}) 0%, rgba(${rb},${gb},${bb},0.12) 55%, transparent 82%)`;
      }
      if (auraHorizonRef.current) {
        auraHorizonRef.current.style.background = `radial-gradient(ellipse 74% 44% at 38% 68%, rgba(${rb},${gb},${bb},${(
          0.22 +
          smoothBass * 0.24
        ).toFixed(3)}) 0%, rgba(${rt},${gt},${bt},0.08) 60%, transparent 88%)`;
      }
      if (stage) {
        stage.style.setProperty("--vice-sub-bass", smoothBass.toFixed(3));
        stage.style.setProperty("--vice-aura-top", `${rt}, ${gt}, ${bt}`);
        stage.style.setProperty("--vice-aura-bot", `${rb}, ${gb}, ${bb}`);
      }
    };

    const id = setInterval(tick, 33); // 30 fps
    return () => clearInterval(id);
  }, [isPlaying, stageRef]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
      {/* 1. Deep Nocturnal Vice City Sky Gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #02000a 0%, #07001c 18%, #120032 38%, #24004c 54%, #380966 64%, #180230 78%, #070112 100%)",
        }}
      />

      {/* 2. Starfield + Synthwave Retro Horizon Grid */}
      <div className="absolute inset-0 stars opacity-85" />

      {/* 3. Real-Time 32×18 Video Aura Projection (Sky & Clouds) */}
      <div
        ref={auraSkyRef}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ mixBlendMode: "screen" }}
      />
      <div
        ref={auraHorizonRef}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ mixBlendMode: "screen" }}
      />

      {/* 4. Wanted Level 3–5★ Helicopter Searchlight Cones */}
      {(wantedLevel >= 3 || encoreActive) && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-10 left-[14%] w-36 h-[75vh] origin-top animate-pulse"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,221,0,0.28) 0%, rgba(0,243,255,0.06) 70%, transparent 100%)",
              clipPath: "polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)",
              transform: "rotate(-18deg)",
              mixBlendMode: "screen",
            }}
          />
          <div
            className="absolute -top-10 left-[58%] w-40 h-[75vh] origin-top animate-pulse"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,243,255,0.26) 0%, rgba(255,0,127,0.06) 70%, transparent 100%)",
              clipPath: "polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)",
              transform: "rotate(16deg)",
              mixBlendMode: "screen",
            }}
          />
        </div>
      )}

      {/* 5. Vice City Architectural Skyline Silhouette + Diegetic Rooftop Billboards */}
      <svg
        className="absolute left-0 w-full"
        style={{ bottom: "36%", height: "28%" }}
        viewBox="0 0 1600 260"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="viceHorizonGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff007f" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#00f3ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#090117" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="buildingBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#140328" />
            <stop offset="100%" stopColor="#060010" />
          </linearGradient>
        </defs>

        {/* Distant Sunset/Neon Horizon Haze */}
        <rect x="0" y="150" width="1600" height="110" fill="url(#viceHorizonGlow)" />

        {/* Back-Layer Downtown Leonida Towers */}
        <g fill="#0b0118" opacity="0.9">
          <rect x="20" y="110" width="55" height="150" />
          <rect x="85" y="75" width="48" height="185" />
          <rect x="142" y="95" width="64" height="165" />
          <rect x="218" y="52" width="42" height="208" />
          <rect x="270" y="88" width="58" height="172" />
          <rect x="860" y="78" width="52" height="182" />
          <rect x="922" y="48" width="46" height="212" />
          <rect x="980" y="84" width="66" height="176" />
          <rect x="1060" y="64" width="50" height="196" />
          <rect x="1125" y="92" width="60" height="168" />
          <rect x="1205" y="70" width="45" height="190" />
          <rect x="1265" y="98" width="70" height="162" />
          <rect x="1350" y="60" width="54" height="200" />
          <rect x="1420" y="85" width="62" height="175" />
          <rect x="1495" y="105" width="80" height="155" />
        </g>

        {/* Foreground Art Deco Hotels & Neon Trim */}
        <g fill="url(#buildingBody)" stroke="#ff007f" strokeOpacity="0.28" strokeWidth="1">
          <rect x="55" y="125" width="52" height="135" />
          <rect x="165" y="108" width="56" height="152" />
          <rect x="240" y="118" width="48" height="142" />
          <rect x="895" y="112" width="58" height="148" />
          <rect x="1015" y="102" width="54" height="158" />
          <rect x="1160" y="116" width="62" height="144" />
          <rect x="1310" y="110" width="55" height="150" />
        </g>

        {/* Illuminated Skyscraper Window Grids */}
        <g fill="#00f3ff" opacity="0.45">
          <rect x="95" y="90" width="4" height="4" />
          <rect x="105" y="90" width="4" height="4" />
          <rect x="95" y="104" width="4" height="4" />
          <rect x="228" y="66" width="4" height="4" />
          <rect x="238" y="66" width="4" height="4" />
          <rect x="228" y="80" width="4" height="4" />
          <rect x="932" y="62" width="4" height="4" />
          <rect x="944" y="62" width="4" height="4" />
          <rect x="932" y="78" width="4" height="4" />
          <rect x="1072" y="78" width="4" height="4" />
          <rect x="1084" y="92" width="4" height="4" />
          <rect x="1362" y="74" width="4" height="4" />
          <rect x="1374" y="88" width="4" height="4" />
        </g>
        <g fill="#ff007f" opacity="0.5">
          <rect x="68" y="138" width="5" height="3" />
          <rect x="82" y="152" width="5" height="3" />
          <rect x="178" y="122" width="5" height="3" />
          <rect x="192" y="136" width="5" height="3" />
          <rect x="908" y="126" width="5" height="3" />
          <rect x="1028" y="118" width="5" height="3" />
          <rect x="1175" y="130" width="5" height="3" />
        </g>

        {/* Diegetic Rooftop Neon Billboards (AdSlot.tsx 2.0 Skyline Integration) */}
        {/* Left Rooftop Billboard: VICE PASS */}
        <g transform="translate(132, 58)">
          <line x1="18" y1="26" x2="18" y2="38" stroke="#00f3ff" strokeWidth="2" />
          <line x1="62" y1="26" x2="62" y2="38" stroke="#00f3ff" strokeWidth="2" />
          <rect
            x="0"
            y="0"
            width="80"
            height="26"
            rx="3"
            fill="#090118"
            stroke="#ff007f"
            strokeWidth="1.5"
          />
          <text
            x="40"
            y="12"
            textAnchor="middle"
            fill="#ff007f"
            fontSize="7.5"
            fontWeight="900"
            fontFamily="Orbitron, sans-serif"
          >
            VICE PASS S1
          </text>
          <text
            x="40"
            y="21"
            textAnchor="middle"
            fill="#00f3ff"
            fontSize="6"
            fontFamily="monospace"
          >
            ROW A VIP GARAGE
          </text>
        </g>

        {/* Right Rooftop Billboard: LEONIDA CUSTOMS */}
        <g transform="translate(972, 46)">
          <line x1="20" y1="26" x2="20" y2="38" stroke="#ffdd00" strokeWidth="2" />
          <line x1="72" y1="26" x2="72" y2="38" stroke="#ffdd00" strokeWidth="2" />
          <rect
            x="0"
            y="0"
            width="92"
            height="26"
            rx="3"
            fill="#090118"
            stroke="#00f3ff"
            strokeWidth="1.5"
          />
          <text
            x="46"
            y="12"
            textAnchor="middle"
            fill="#00f3ff"
            fontSize="7.5"
            fontWeight="900"
            fontFamily="Orbitron, sans-serif"
          >
            VICE NIGHTLY
          </text>
          <text
            x="46"
            y="21"
            textAnchor="middle"
            fill="#ffdd00"
            fontSize="6"
            fontFamily="monospace"
          >
            TOP 25 @ 9PM EST
          </text>
        </g>
      </svg>

      {/* 6. Tropical Vice City Palm Silhouettes Flanking the Theater Lot */}
      <svg
        className="absolute left-[1%] bottom-[34%] w-28 h-56 opacity-90"
        viewBox="0 0 120 220"
        fill="none"
      >
        <path
          d="M58 220 C56 165 62 115 68 68"
          stroke="#16002c"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M68 68 C45 42 15 44 2 58 C24 34 48 36 68 56 C88 36 110 40 118 58 C100 46 82 50 68 68 Z"
          fill="#0c001c"
          stroke="#ff007f"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
        <path
          d="M68 68 C38 62 12 74 0 92 C22 68 46 66 68 74 C90 66 108 72 118 90 C100 74 84 70 68 68 Z"
          fill="#090014"
          stroke="#00f3ff"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      </svg>

      <svg
        className="absolute right-[26%] bottom-[35%] w-24 h-48 opacity-85 hidden lg:block"
        viewBox="0 0 120 220"
        fill="none"
      >
        <path
          d="M62 220 C64 165 58 115 52 68"
          stroke="#16002c"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M52 68 C32 44 10 46 2 60 C20 36 40 38 52 56 C72 36 98 38 116 56 C96 44 72 48 52 68 Z"
          fill="#0c001c"
          stroke="#00f3ff"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
      </svg>

      {/* 7. Amphitheater Lot Ground Plane & Synthwave Perspective Grid */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "39%",
          background:
            "radial-gradient(ellipse 85% 70% at 38% 0%, rgba(45, 4, 82, 0.72) 0%, rgba(12, 2, 28, 0.96) 55%, #04000c 100%)",
          borderTop: "1px solid rgba(255, 0, 127, 0.35)",
          boxShadow: "0 -10px 40px rgba(255, 0, 127, 0.18)",
        }}
      />
    </div>
  );
}
