"use client";

import { useMemo, useSyncExternalStore } from "react";

// ─── NewVice V3 Talent Scout Economy, Row A Streak & 48h Tow-Truck Engine ────
// Tracks:
//   • Vice Cred XP (+50 per clip scouted, +5 per High-Beam flash, +15 daily check-in)
//   • Daily Attendance Streak (7+ days or 100+ Vice Cred unlocks Row A Front Center)
//   • 48-Hour Inactivity Tow-Truck Impound (4h warning at 44h, impound haul-away at 48h)
//   • Custom License Plate (up to 9 chars) & Preferred 3D Spatial Horn

const STORAGE_KEY = "lv_economy_state_v3";
const ECONOMY_EVENT = "lv-economy-state-change";

const ONE_HOUR_MS = 3600 * 1000;
const TOW_WARNING_HOURS = 44;
const TOW_IMPOUND_HOURS = 48;

export type HornMelodyId = "synth_horn" | "vice_siren" | "lowrider_chime";

export type TowTruckStatus = "safe" | "warning_4h" | "impounded";

export interface EconomyState {
  viceCred: number;
  streakDays: number;
  lastCheckInDay: string;     // YYYY-MM-DD in EST
  lastParkedAtMs: number;     // Epoch ms of last visit
  wasRowAHolder: boolean;
  towStatus: TowTruckStatus;
  hoursUntilTow: number;
  clipsScouted: number;
  highBeamsFlashed: number;
  licensePlate: string;
  preferredHorn: HornMelodyId;
}

export interface ScoutRankInfo {
  title: string;
  badge: string;
  color: string;
  qualifiesRowA: boolean;
  nextRankAt: number | null;
}

function getEstDateKey(nowMs = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

function defaultPlate(): string {
  if (typeof window === "undefined") return "VICE-2026";
  try {
    const gid = localStorage.getItem("lv_guest_id") || "VICE86";
    const suffix = gid.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase().padEnd(4, "6");
    return `VICE-${suffix}`;
  } catch {
    return "VICE-2026";
  }
}

function createInitialEconomyState(nowMs = Date.now()): EconomyState {
  return {
    viceCred: 25,
    streakDays: 1,
    lastCheckInDay: getEstDateKey(nowMs),
    lastParkedAtMs: nowMs,
    wasRowAHolder: false,
    towStatus: "safe",
    hoursUntilTow: TOW_IMPOUND_HOURS,
    clipsScouted: 0,
    highBeamsFlashed: 0,
    licensePlate: defaultPlate(),
    preferredHorn: "synth_horn",
  };
}

export function loadEconomyState(): EconomyState {
  if (typeof window === "undefined") return createInitialEconomyState(0);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialEconomyState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<EconomyState>;
    const base = createInitialEconomyState();
    const merged: EconomyState = {
      ...base,
      ...parsed,
      licensePlate: (parsed.licensePlate || base.licensePlate).slice(0, 9).toUpperCase(),
      preferredHorn:
        parsed.preferredHorn === "vice_siren" || parsed.preferredHorn === "lowrider_chime"
          ? parsed.preferredHorn
          : "synth_horn",
    };

    const elapsedHours = Math.max(0, (Date.now() - merged.lastParkedAtMs) / ONE_HOUR_MS);
    const hoursUntilTow = Math.max(0, Number((TOW_IMPOUND_HOURS - elapsedHours).toFixed(1)));
    let towStatus: TowTruckStatus = merged.towStatus || "safe";
    if (elapsedHours >= TOW_IMPOUND_HOURS && merged.wasRowAHolder) {
      towStatus = "impounded";
    } else if (elapsedHours >= TOW_WARNING_HOURS && merged.wasRowAHolder) {
      towStatus = "warning_4h";
    }

    return {
      ...merged,
      towStatus,
      hoursUntilTow,
    };
  } catch {
    return createInitialEconomyState();
  }
}

export function saveEconomyState(next: EconomyState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore private mode quota */
  }
  window.dispatchEvent(new Event(ECONOMY_EVENT));
}

/**
 * Performs daily attendance check-in on theater entry:
 *   • Evaluates 48-hour Tow-Truck impound before resetting lastParkedAtMs
 *   • Increments consecutive daily streak (+15 Vice Cred per new day)
 */
export function recordDailyLotCheckIn(): EconomyState {
  const current = loadEconomyState();
  const nowMs = Date.now();
  const todayKey = getEstDateKey(nowMs);
  const elapsedHours = (nowMs - current.lastParkedAtMs) / ONE_HOUR_MS;

  let streakDays = current.streakDays;
  let viceCred = current.viceCred;
  let towStatus: TowTruckStatus = current.towStatus;

  if (elapsedHours >= TOW_IMPOUND_HOURS && current.wasRowAHolder) {
    // 48h inactivity: Vice City Tow-Truck impounds Row A spot & resets streak
    towStatus = "impounded";
    streakDays = 1;
  } else if (current.lastCheckInDay !== todayKey) {
    // New EST day within the 48h window -> streak advances!
    streakDays = current.streakDays + 1;
    viceCred += 15;
    towStatus = "safe";
  }

  const qualifiesRowA = streakDays >= 7 || viceCred >= 100;
  const updated: EconomyState = {
    ...current,
    viceCred,
    streakDays,
    lastCheckInDay: todayKey,
    lastParkedAtMs: nowMs,
    wasRowAHolder: qualifiesRowA,
    towStatus,
    hoursUntilTow: TOW_IMPOUND_HOURS,
  };
  saveEconomyState(updated);
  return updated;
}

export function awardViceCred(
  deltaCred: number,
  reason: "high_beam" | "clip_scouted" | "encore_bonus"
): EconomyState {
  const current = loadEconomyState();
  const nextCred = Math.max(0, current.viceCred + deltaCred);
  const nextScouted =
    reason === "clip_scouted" ? current.clipsScouted + 1 : current.clipsScouted;
  const nextBeams =
    reason === "high_beam" ? current.highBeamsFlashed + 1 : current.highBeamsFlashed;
  const qualifiesRowA = current.streakDays >= 7 || nextCred >= 100;

  const updated: EconomyState = {
    ...current,
    viceCred: nextCred,
    clipsScouted: nextScouted,
    highBeamsFlashed: nextBeams,
    wasRowAHolder: qualifiesRowA || current.wasRowAHolder,
    lastParkedAtMs: Date.now(),
  };
  saveEconomyState(updated);
  return updated;
}

export function updateGarageCosmetics(patch: {
  licensePlate?: string;
  preferredHorn?: HornMelodyId;
}): EconomyState {
  const current = loadEconomyState();
  const cleanPlate =
    patch.licensePlate !== undefined
      ? patch.licensePlate
          .replace(/[^A-Za-z0-9 -]/g, "")
          .trim()
          .slice(0, 9)
          .toUpperCase() || current.licensePlate
      : current.licensePlate;

  const updated: EconomyState = {
    ...current,
    licensePlate: cleanPlate,
    preferredHorn: patch.preferredHorn ?? current.preferredHorn,
  };
  saveEconomyState(updated);
  return updated;
}

export function dismissTowImpoundNotice(): EconomyState {
  const current = loadEconomyState();
  const updated: EconomyState = {
    ...current,
    towStatus: "safe",
    lastParkedAtMs: Date.now(),
  };
  saveEconomyState(updated);
  return updated;
}

/** Allows testing/previewing the 48h Vice City Tow-Truck haul-away animation */
export function triggerTowImpoundDemo(): EconomyState {
  const current = loadEconomyState();
  const updated: EconomyState = {
    ...current,
    wasRowAHolder: true,
    towStatus: "impounded",
  };
  saveEconomyState(updated);
  return updated;
}

export function getScoutRank(viceCred: number, streakDays: number): ScoutRankInfo {
  const qualifiesRowA = streakDays >= 7 || viceCred >= 100;
  if (viceCred >= 500 || streakDays >= 14) {
    return {
      title: "HALL OF VICE LEGEND",
      badge: "👑",
      color: "#ffdd00",
      qualifiesRowA: true,
      nextRankAt: null,
    };
  }
  if (viceCred >= 200 || streakDays >= 7) {
    return {
      title: "ROW A SYNDICATE VIP",
      badge: "🌴",
      color: "#ff007f",
      qualifiesRowA: true,
      nextRankAt: 500,
    };
  }
  if (viceCred >= 100) {
    return {
      title: "TALENT SCOUT PRO",
      badge: "🎖️",
      color: "#00f3ff",
      qualifiesRowA: true,
      nextRankAt: 200,
    };
  }
  if (viceCred >= 50) {
    return {
      title: "LOT REGULAR",
      badge: "⚡",
      color: "#39ff14",
      qualifiesRowA,
      nextRankAt: 100,
    };
  }
  return {
    title: "ROOKIE DRIVER",
    badge: "🔑",
    color: "#00f3ff",
    qualifiesRowA,
    nextRankAt: 50,
  };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(ECONOMY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ECONOMY_EVENT, onChange);
  };
}

function getSnapshot(): string {
  return JSON.stringify(loadEconomyState());
}

function getServerSnapshot(): string {
  return "";
}

export function useViceEconomy(): EconomyState & { rank: ScoutRankInfo } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const state = snap ? (JSON.parse(snap) as EconomyState) : createInitialEconomyState(0);
    return {
      ...state,
      rank: getScoutRank(state.viceCred, state.streakDays),
    };
  }, [snap]);
}
