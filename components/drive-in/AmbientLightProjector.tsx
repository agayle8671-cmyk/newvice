"use client";

import { useEffect, useRef } from "react";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";

// ─── NewVice V3 32×18 Offscreen Ambient Light & Sub-Bass Engine (30 fps) ─────
// Samples the active <video> frame onto a 32×18 offscreen canvas at 30 fps to:
//   1. Cast real-time color-matched ambient light onto the night sky & car hoods
//   2. Sample 20-120 Hz sub-bass FFT bins from DriveInAudioGraph and write
//      CSS variables (--vice-sub-bass, --vice-ambient-top, --vice-ambient-bottom)
//      directly onto the theater stage at 30 fps with ZERO React re-renders.

interface AmbientLightProjectorProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  encoreActive: boolean;
  empGlitchActive: boolean;
}

export default function AmbientLightProjector({
  stageRef,
  isPlaying,
  encoreActive,
  empGlitchActive,
}: AmbientLightProjectorProps) {
  const skyGlowRef = useRef<HTMLDivElement>(null);
  const hoodGlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = 32;
    offscreen.height = 18;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });

    let smoothRTop = 0;
    let smoothGTop = 210;
    let smoothBTop = 255;
    let smoothRBot = 255;
    let smoothGBot = 0;
    let smoothBBot = 127;
    let smoothBass = 0.18;
    let phase = 0;

    const sampleTick = () => {
      phase += 0.08;
      const stage = stageRef.current;
      let sampledFrame = false;

      if (ctx && stage) {
        const videos = stage.querySelectorAll("video");
        let activeVideo: HTMLVideoElement | null = null;
        for (const v of videos) {
          if (v.readyState >= 2 && !v.paused && v.style.zIndex === "2") {
            activeVideo = v;
            break;
          }
        }
        if (!activeVideo && videos.length > 0 && videos[0].readyState >= 2 && !videos[0].paused) {
          activeVideo = videos[0];
        }

        if (activeVideo) {
          try {
            ctx.drawImage(activeVideo, 0, 0, 32, 18);
            const data = ctx.getImageData(0, 0, 32, 18).data;

            // Sample top 4 rows (skyline/cloud projection)
            let rT = 0, gT = 0, bT = 0, cT = 0;
            for (let y = 0; y < 4; y++) {
              for (let x = 2; x < 30; x += 2) {
                const idx = (y * 32 + x) * 4;
                rT += data[idx];
                gT += data[idx + 1];
                bT += data[idx + 2];
                cT++;
              }
            }

            // Sample bottom 5 rows (glossy car hood & windshield reflections)
            let rB = 0, gB = 0, bB = 0, cB = 0;
            for (let y = 13; y < 18; y++) {
              for (let x = 2; x < 30; x += 2) {
                const idx = (y * 32 + x) * 4;
                rB += data[idx];
                gB += data[idx + 1];
                bB += data[idx + 2];
                cB++;
              }
            }

            if (cT > 0 && cB > 0) {
              // Boost saturation slightly so dark night scenes still cast rich neon light
              const avgRT = Math.min(255, (rT / cT) * 1.25 + 12);
              const avgGT = Math.min(255, (gT / cT) * 1.25 + 8);
              const avgBT = Math.min(255, (bT / cT) * 1.25 + 18);

              const avgRB = Math.min(255, (rB / cB) * 1.3 + 18);
              const avgGB = Math.min(255, (gB / cB) * 1.2 + 6);
              const avgBB = Math.min(255, (bB / cB) * 1.3 + 18);

              smoothRTop = smoothRTop * 0.82 + avgRT * 0.18;
              smoothGTop = smoothGTop * 0.82 + avgGT * 0.18;
              smoothBTop = smoothBTop * 0.82 + avgBT * 0.18;

              smoothRBot = smoothRBot * 0.82 + avgRB * 0.18;
              smoothGBot = smoothGBot * 0.82 + avgGB * 0.18;
              smoothBBot = smoothBBot * 0.82 + avgBB * 0.18;
              sampledFrame = true;
            }
          } catch {
            // Cross-origin fallback handled below
          }
        }
      }

      if (!sampledFrame) {
        // Synthwave ambient drift when embed iframe or non-CORS video is active
        const waveA = (Math.sin(phase * 0.45) + 1) * 0.5;
        const waveB = (Math.cos(phase * 0.35) + 1) * 0.5;
        smoothRTop = smoothRTop * 0.9 + (30 + waveA * 180) * 0.1;
        smoothGTop = smoothGTop * 0.9 + (160 + waveB * 80) * 0.1;
        smoothBTop = smoothBTop * 0.9 + 245 * 0.1;

        smoothRBot = smoothRBot * 0.9 + (220 - waveB * 90) * 0.1;
        smoothGBot = smoothGBot * 0.9 + (35 + waveA * 140) * 0.1;
        smoothBBot = smoothBBot * 0.9 + (165 + waveB * 75) * 0.1;
      }

      // Sample 20-120 Hz Sub-Bass Energy from Web Audio AnalyserNode
      const rawBass = getDriveInAudioGraph().getSubBassEnergy();
      const targetBass =
        rawBass > 0.02
          ? rawBass
          : // Subtle synth idle pulse when muted so underglows stay alive
            0.22 + 0.14 * Math.pow((Math.sin(phase * 1.35) + 1) * 0.5, 2);
      smoothBass = smoothBass * 0.68 + targetBass * 0.32;

      const rT = Math.round(smoothRTop);
      const gT = Math.round(smoothGTop);
      const bT = Math.round(smoothBTop);
      const rB = Math.round(smoothRBot);
      const gB = Math.round(smoothGBot);
      const bB = Math.round(smoothBBot);

      if (skyGlowRef.current) {
        skyGlowRef.current.style.background = `radial-gradient(ellipse 68% 54% at 50% 34%, rgba(${rT},${gT},${bT},${(
          0.22 +
          smoothBass * 0.16
        ).toFixed(3)}) 0%, rgba(${rB},${gB},${bB},0.08) 58%, transparent 82%)`;
      }

      if (hoodGlowRef.current) {
        hoodGlowRef.current.style.background = `radial-gradient(ellipse 75% 48% at 50% 76%, rgba(${rB},${gB},${bB},${(
          0.20 +
          smoothBass * 0.22
        ).toFixed(3)}) 0%, rgba(${rT},${gT},${bT},0.07) 60%, transparent 88%)`;
      }

      if (stage) {
        stage.style.setProperty("--vice-sub-bass", smoothBass.toFixed(3));
        stage.style.setProperty("--vice-ambient-rgb", `${rB}, ${gB}, ${bB}`);
      }
    };

    const intervalId = setInterval(sampleTick, 33); // 30 fps
    return () => clearInterval(intervalId);
  }, [isPlaying, stageRef]);

  return (
    <>
      {/* ── Screen-to-Skyline Perimeter Ambient Light Wash (32×18 @ 30fps) ── */}
      <div
        ref={skyGlowRef}
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          mixBlendMode: "screen",
          transition: "background 90ms linear",
        }}
      />

      {/* ── Car Hood & Windshield Specular Color Wash ──────────────────────── */}
      <div
        ref={hoodGlowRef}
        className="absolute inset-0 pointer-events-none z-[6]"
        style={{
          mixBlendMode: "screen",
          transition: "background 90ms linear",
        }}
      />

      {/* ── Marquee Electrical Surge (>25% High-Beam Encore Triggered) ─────── */}
      {encoreActive && (
        <div
          className="absolute pointer-events-none z-[28] animate-pulse"
          style={{
            left: "30.5%",
            top: "1.8%",
            width: "39%",
            height: "15.8%",
            borderRadius: "12px",
            boxShadow:
              "0 0 35px rgba(255,221,0,0.85), 0 0 80px rgba(0,243,255,0.75), inset 0 0 30px rgba(255,0,127,0.65)",
            border: "1.5px solid rgba(255,221,0,0.9)",
            background:
              "radial-gradient(ellipse at center, rgba(255,221,0,0.22) 0%, rgba(0,243,255,0.12) 55%, transparent 80%)",
          }}
        >
          <div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full font-[family-name:var(--font-display)] font-black tracking-widest uppercase whitespace-nowrap"
            style={{
              fontSize: "clamp(7px,0.7vw,10px)",
              background: "#ffdd00",
              color: "#050014",
              boxShadow: "0 0 18px #ffdd00",
            }}
          >
            ⚡ CROWD ENCORE SURGE • +15s REPLAY BOOST ⚡
          </div>
        </div>
      )}

      {/* ── EMP CRT Glitch Sweep (>50% Hazard Vote Skip) ───────────────────── */}
      {empGlitchActive && (
        <div
          className="absolute pointer-events-none z-[29] overflow-hidden"
          style={{
            left: "26.07%",
            top: "18.23%",
            width: "48.01%",
            height: "35.16%",
            background:
              "repeating-linear-gradient(0deg, rgba(255,0,127,0.38) 0px, rgba(0,243,255,0.38) 3px, rgba(0,0,0,0.85) 6px)",
            boxShadow: "inset 0 0 50px #ff007f, 0 0 40px #00f3ff",
          }}
        >
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-black/45 backdrop-blur-[2px]">
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-[0.25em] uppercase text-[#ff007f]"
              style={{
                fontSize: "clamp(11px,1.3vw,18px)",
                textShadow: "2px 0 #00f3ff, -2px 0 #ffdd00, 0 0 16px #ff007f",
              }}
            >
              ⚡ EMP CROWD OVERRIDE ⚡
            </span>
            <span
              className="font-[family-name:var(--font-chat)] uppercase tracking-widest text-[#00f3ff]"
              style={{ fontSize: "clamp(7px,0.75vw,10px)" }}
            >
              HAZARD VOTE PASSED — CUTTING TO NEXT REEL
            </span>
          </div>
        </div>
      )}
    </>
  );
}
