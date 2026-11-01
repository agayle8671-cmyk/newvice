"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/context";
import { loadDemoProfile, saveDemoProfile } from "@/lib/profile/guest";

const BADGE_OPTIONS = [
  { value: "muscle_car", label: "🚗 Muscle Car" },
  { value: "sports_car", label: "🏎️ Sports Car" },
  { value: "truck", label: "🚛 Heavy Hauler" },
  { value: "default", label: "📰 Press Badge" },
];

const COLOR_PRESETS = [
  "#e04040",
  "#111111",
  "#0b5cab",
  "#0f7b3f",
  "#b45309",
  "#7c2d12",
  "#6d28d9",
  "#be185d",
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const isDemo = !user;

  const [username, setUsername] = useState("");
  const [badge, setBadge] = useState("muscle_car");
  const [color, setColor] = useState("#e04040");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      if (isDemo) {
        const demo = loadDemoProfile();
        setUsername(demo.username);
        setBadge(demo.vehicle_badge);
        setColor(demo.badge_color);
      } else if (profile) {
        setUsername(profile.username ?? "");
        setBadge(profile.vehicle_badge ?? "muscle_car");
        setColor(profile.badge_color ?? "#e04040");
      }
      setSaved(false);
      setError(null);
    }
  }

  const handleSave = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username cannot be blank.");
      return;
    }
    if (trimmed.length > 20) {
      setError("Max 20 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("Letters, numbers, and underscores only.");
      return;
    }

    setSaving(true);
    setError(null);

    if (isDemo) {
      saveDemoProfile({
        username: trimmed,
        vehicle_badge: badge,
        badge_color: color,
      });
      setSaving(false);
      setSaved(true);
      setTimeout(onClose, 900);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      const { error: sbErr } = await sb
        .from("profiles")
        .update({ username: trimmed, vehicle_badge: badge, badge_color: color })
        .eq("id", user!.id);
      if (sbErr) throw sbErr;
      await refreshProfile();
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }, [username, badge, color, isDemo, user, onClose, refreshProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white text-black border border-black border-b-[4px] shadow-2xl overflow-hidden"
      >
        <div className="h-1.5 bg-[#e04040]" />

        <div className="flex items-center justify-between px-6 pt-5 pb-3.5 border-b border-black">
          <div>
            <span
              className="inline-block bg-black text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              CITIZEN WIRE IDENTITY
            </span>
            <h3
              className="text-[26px] font-extrabold uppercase leading-none"
              style={{ fontFamily: "'Big Shoulders Text', sans-serif" }}
            >
              PROFILE &amp; GARAGE BADGE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-black/60 hover:text-[#e04040] transition-colors text-lg font-bold cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isDemo && (
            <p
              className="text-xs bg-[#f4f4f4] border-l-[3px] border-[#e04040] px-3 py-2 text-black/80"
              style={{ fontFamily: "'Roboto Slab', serif" }}
            >
              Guest session — profile preferences are saved locally in your browser.
            </p>
          )}

          {/* Username */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ fontFamily: "'Work Sans', sans-serif" }}
              >
                Citizen Handle
              </label>
              <span
                className="text-[11px] text-black/50"
                style={{ fontFamily: "'Work Sans', sans-serif" }}
              >
                {username.trim().length}/20
              </span>
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              placeholder="e.g. ViceCorrespondent"
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>

          {/* Vehicle / Press Badge */}
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Garage / Wire Flair
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BADGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBadge(opt.value)}
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                  className={`px-3 py-2 text-xs font-semibold border text-left transition-colors cursor-pointer ${
                    badge === opt.value
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-black/30 hover:border-black"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Callsign Color */}
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Byline Color
            </label>
            <div className="flex gap-2 flex-wrap items-center">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className={`w-7 h-7 border cursor-pointer transition-transform ${
                    color === c
                      ? "border-black ring-2 ring-black scale-110"
                      : "border-black/30"
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                title="Custom color"
                className="w-7 h-7 border border-black cursor-pointer p-0 bg-white"
              />
            </div>
            <div className="mt-2.5 px-3 py-2 bg-[#f7f7f7] border border-black/20 text-xs">
              <span className="text-black/55 mr-1.5">Wire Preview:</span>
              <strong style={{ color }}>
                {username.trim() || "Citizen"}:
              </strong>{" "}
              <span className="text-black/85">
                Checking in live from Vice Beach!
              </span>
            </div>
          </div>

          {error && (
            <div className="text-xs text-[#e04040] font-semibold bg-[#e04040]/10 border border-[#e04040] px-3 py-2">
              ⚠ {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            style={{ fontFamily: "'Work Sans', sans-serif" }}
            className={`w-full py-3 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
              saved
                ? "bg-emerald-700 text-white"
                : "bg-[#e04040] hover:bg-black text-white"
            }`}
          >
            {saved ? "✓ PROFILE SAVED" : saving ? "SAVING..." : "SAVE CITIZEN PROFILE"}
          </button>
        </div>
      </div>
    </div>
  );
}
