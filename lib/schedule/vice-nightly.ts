// ─── NewVice V3 "Vice Nightly" Appointment-Viewing Scheduler ─────────────────
// Transforms 24/7 unscheduled shuffle into daily EST appointment television:
//   • 18:00–20:00 EST — Mod Showcase Matinee (shaders, custom rides, graphics)
//   • 21:00–22:00 EST — Vice Prime Time: Top 25 Countdown (live High-Beam voting)
//   • 23:00–01:00 EST — NoPixel & RP Drama Late Show (RP heists, pursuits, syndicates)
//   • 01:00–04:00 EST — Fever Dream & Synthwave Afterhours (glitches, synthwave, retro)
//   • All other hours — Leonida Open Lot Rotation + countdown to next premiere block

import type { VideoItem } from "@/lib/video/types";

export type ViceProgramBlockId =
  | "mod_matinee"
  | "prime_countdown"
  | "rp_late_show"
  | "synthwave_afterhours"
  | "open_lot";

export interface ViceProgramBlock {
  id: ViceProgramBlockId;
  title: string;
  shortTitle: string;
  tagline: string;
  badgeIcon: string;
  accentColor: string;
  startHourEst: number; // 0..23 in America/New_York
  endHourEst: number;   // 0..24 (can wrap past midnight e.g. 23 -> 1)
  preferredCategories: string[];
  preferredKeywords: RegExp;
  isPremiereBlock: boolean;
}

export const VICE_NIGHTLY_BLOCKS: ViceProgramBlock[] = [
  {
    id: "mod_matinee",
    title: "MOD SHOWCASE MATINEE",
    shortTitle: "MOD MATINEE",
    tagline: "Photorealistic Shaders, Custom Rides & Vice Graphics Showcases",
    badgeIcon: "🔧",
    accentColor: "#00f3ff",
    startHourEst: 18,
    endHourEst: 20,
    preferredCategories: ["gameplay", "trailer", "user_clip"],
    preferredKeywords: /\b(mod|shader|graphics|4k|ray\s*tracing|car|vehicle|drift|custom|realistic)\b/i,
    isPremiereBlock: true,
  },
  {
    id: "prime_countdown",
    title: "VICE PRIME TIME: TOP 25 COUNTDOWN",
    shortTitle: "PRIME TOP 25",
    tagline: "Flash High-Beams (SPACE) to Vote the #1 Stunt into the Hall of Vice",
    badgeIcon: "🏆",
    accentColor: "#ffdd00",
    startHourEst: 21,
    endHourEst: 22,
    preferredCategories: ["user_clip", "gameplay", "trailer"],
    preferredKeywords: /\b(stunt|insane|top|official|trailer|rockstar|record|epic|best)\b/i,
    isPremiereBlock: true,
  },
  {
    id: "rp_late_show",
    title: "NOPIXEL & RP DRAMA LATE SHOW",
    shortTitle: "RP LATE SHOW",
    tagline: "High-Stakes Heists, 5-Star Police Pursuits & Vice Syndicate Wars",
    badgeIcon: "🚓",
    accentColor: "#ff007f",
    startHourEst: 23,
    endHourEst: 1,
    preferredCategories: ["user_clip", "gameplay", "news"],
    preferredKeywords: /\b(rp|roleplay|police|chase|pursuit|heist|wanted|cops|vice\s*pd|crime)\b/i,
    isPremiereBlock: true,
  },
  {
    id: "synthwave_afterhours",
    title: "FEVER DREAM & SYNTHWAVE AFTERHOURS",
    shortTitle: "AFTERHOURS",
    tagline: "Physics Glitches, Midnight Outrun Cruises & 80s Vice Aesthetics",
    badgeIcon: "🌴",
    accentColor: "#bf00ff",
    startHourEst: 1,
    endHourEst: 4,
    preferredCategories: ["user_clip", "gameplay", "analysis"],
    preferredKeywords: /\b(night|neon|synth|glitch|funny|fail| physics|beach|vice\s*city|cruise|sunset)\b/i,
    isPremiereBlock: true,
  },
];

export const OPEN_LOT_BLOCK: ViceProgramBlock = {
  id: "open_lot",
  title: "LEONIDA OPEN LOT ROTATION",
  shortTitle: "OPEN LOT",
  tagline: "24/7 Synchronized Community Stunts, Trailers & Viral Heat Feed",
  badgeIcon: "📡",
  accentColor: "#39ff14",
  startHourEst: 4,
  endHourEst: 18,
  preferredCategories: ["user_clip", "gameplay", "trailer", "analysis", "news"],
  preferredKeywords: /./,
  isPremiereBlock: false,
};

export interface ActiveScheduleState {
  currentBlock: ViceProgramBlock;
  nextBlock: ViceProgramBlock;
  /** Seconds until current block ends (if premiere) or next premiere block begins */
  countdownSec: number;
  /** Formatted HH:MM:SS or MM:SS countdown string */
  countdownLabel: string;
  /** Current EST clock string e.g. "9:42 PM EST" */
  estClockLabel: string;
}

function getEstParts(nowMs: number): {
  hour: number;
  minute: number;
  second: number;
  tzShort: string;
} {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
    const parts = dtf.formatToParts(new Date(nowMs));
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const rawHour = parseInt(map.hour || "0", 10);
    return {
      hour: rawHour === 24 ? 0 : rawHour,
      minute: parseInt(map.minute || "0", 10),
      second: parseInt(map.second || "0", 10),
      tzShort: map.timeZoneName || "EST",
    };
  } catch {
    // Fallback UTC-5
    const d = new Date(nowMs - 5 * 3600 * 1000);
    return {
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      tzShort: "EST",
    };
  }
}

function isHourInWindow(hour: number, start: number, end: number): boolean {
  if (start < end) {
    return hour >= start && hour < end;
  }
  // Wraps midnight (e.g. 23 -> 1)
  return hour >= start || hour < end;
}

function secondsUntilEstHour(
  currentHour: number,
  currentMin: number,
  currentSec: number,
  targetHour: number
): number {
  const nowSecOfDay = currentHour * 3600 + currentMin * 60 + currentSec;
  const targetSecOfDay = targetHour * 3600;
  let diff = targetSecOfDay - nowSecOfDay;
  if (diff <= 0) {
    diff += 24 * 3600;
  }
  return diff;
}

export function formatScheduleCountdown(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getViceNightlyState(nowMs = Date.now()): ActiveScheduleState {
  const { hour, minute, second, tzShort } = getEstParts(nowMs);

  let currentBlock: ViceProgramBlock = OPEN_LOT_BLOCK;
  for (const block of VICE_NIGHTLY_BLOCKS) {
    if (isHourInWindow(hour, block.startHourEst, block.endHourEst)) {
      currentBlock = block;
      break;
    }
  }

  // Find the next premiere block in chronological order
  let nextBlock = VICE_NIGHTLY_BLOCKS[0];
  let bestSec = Number.POSITIVE_INFINITY;
  for (const block of VICE_NIGHTLY_BLOCKS) {
    if (block.id === currentBlock.id) continue;
    const sec = secondsUntilEstHour(hour, minute, second, block.startHourEst);
    if (sec < bestSec) {
      bestSec = sec;
      nextBlock = block;
    }
  }

  const countdownSec = currentBlock.isPremiereBlock
    ? secondsUntilEstHour(hour, minute, second, currentBlock.endHourEst)
    : bestSec;

  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  const estClockLabel = `${h12}:${String(minute).padStart(2, "0")} ${ampm} ${tzShort}`;

  return {
    currentBlock,
    nextBlock,
    countdownSec,
    countdownLabel: formatScheduleCountdown(countdownSec),
    estClockLabel,
  };
}

/**
 * Computes an appointment-programming priority score for a clip during the active block
 * so themed blocks surface matching clips first while keeping the full catalog playable.
 */
export function scoreClipForBlock(
  item: Pick<VideoItem, "title" | "category" | "viralHeatScore" | "highBeamCount">,
  block: ViceProgramBlock
): number {
  let score = (item.viralHeatScore ?? 0) + (item.highBeamCount ?? 0) * 5;
  if (!block.isPremiereBlock) return score;

  if (block.preferredCategories.includes(item.category)) {
    score += 35;
  }
  if (block.preferredKeywords.test(item.title)) {
    score += 60;
  }
  if (block.id === "prime_countdown") {
    // Prime Time Top 25 heavily weights High-Beam flashes + Viral Heat
    score += (item.highBeamCount ?? 0) * 25 + (item.viralHeatScore ?? 0) * 2;
  }
  return score;
}
