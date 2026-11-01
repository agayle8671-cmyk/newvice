"use client";

import { useMemo, useSyncExternalStore } from "react";

// ─── Guest identity + demo profile (localStorage) ────────────────────────────
// Guests get a stable identity across refreshes and can customize their handle,
// vehicle and badge colour in Profile Settings — those choices are now actually
// used by the drive-in (chat name, parking-lot vehicle) instead of being ignored.

const ID_KEY = "lv_guest_id";
const PROFILE_KEY = "lv_profile_demo";
const CHANGE_EVENT = "lv-guest-profile-change";

export interface DemoProfile {
  username: string;
  vehicle_badge: string;
  badge_color: string;
}

export interface GuestProfile extends DemoProfile {
  id: string;
}

const DEFAULT_DEMO: DemoProfile = {
  username: "",
  vehicle_badge: "muscle_car",
  badge_color: "#ff007f",
};

export function loadDemoProfile(): DemoProfile {
  if (typeof window === "undefined") return DEFAULT_DEMO;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { ...DEFAULT_DEMO, ...(JSON.parse(raw) as Partial<DemoProfile>) };
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_DEMO;
}

export function saveDemoProfile(p: DemoProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function getOrCreateGuestId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      const rand =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
          : Math.random().toString(36).slice(2, 12);
      id = `guest_${rand}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `guest_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The snapshot is a stable string so useSyncExternalStore only re-renders on real changes.
function getSnapshot(): string {
  const id = getOrCreateGuestId();
  const demo = loadDemoProfile();
  return JSON.stringify({ id, ...demo });
}

function getServerSnapshot(): string {
  return "";
}

/** Returns null during SSR/hydration, then the persistent guest identity merged with demo profile. */
export function useGuestProfile(): GuestProfile | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    if (!snap) return null;
    const parsed = JSON.parse(snap) as GuestProfile;
    const fallbackName = `User${parsed.id.replace(/\D/g, "").slice(0, 3).padEnd(3, "0")}`;
    return { ...parsed, username: parsed.username || fallbackName };
  }, [snap]);
}
