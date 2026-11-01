"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth/context";
import { loadDemoProfile, saveDemoProfile } from "@/lib/profile/guest";

// ─── Badge options ────────────────────────────────────────────────────────────
const BADGE_OPTIONS = [
  { value: "muscle_car",  label: "🚗 Muscle Car" },
  { value: "sports_car",  label: "🏎️  Sports Car" },
  { value: "truck",       label: "🚛 Truck"       },
  { value: "default",     label: "🚙 Default"     },
];

// ─── Colour presets ───────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  "#ff007f", "#00f3ff", "#39ff14", "#ffdd00",
  "#ff6b00", "#bf00ff", "#ff4444", "#ffffff",
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const isDemo = !user;

  const [username, setUsername]     = useState("");
  const [badge, setBadge]           = useState("muscle_car");
  const [color, setColor]           = useState("#ff007f");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Populate fields from profile or demo storage each time the modal opens.
  // Done during render (not in an effect) to avoid cascading renders.
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
        setColor(profile.badge_color ?? "#ff007f");
      }
      setSaved(false);
      setError(null);
    }
  }

  const handleSave = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed) { setError("Username cannot be blank."); return; }
    if (trimmed.length > 20) { setError("Max 20 characters."); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("Letters, numbers, and underscores only.");
      return;
    }

    setSaving(true);
    setError(null);

    if (isDemo) {
      // Demo mode — local only
      saveDemoProfile({ username: trimmed, vehicle_badge: badge, badge_color: color });
      setSaving(false);
      setSaved(true);
      setTimeout(onClose, 900);
      return;
    }

    // Live mode — update Supabase profiles table
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

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const inputBase: React.CSSProperties = {
    background: "#07081a",
    border: "1px solid rgba(0,243,255,0.25)",
    color: "#e0e0e0",
    fontFamily: "var(--font-chat)",
    fontSize: "clamp(11px,1vw,14px)",
    borderRadius: 4,
    padding: "6px 10px",
    width: "100%",
    outline: "none",
    caretColor: "#00f3ff",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="profile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/70"
          />

          {/* Modal panel */}
          <motion.div
            key="profile-panel"
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none"
          >
            <div
              className="pointer-events-auto relative flex flex-col gap-4"
              style={{
                width: "min(420px, 90vw)",
                background: "linear-gradient(145deg, #0a0b24 0%, #0e0f2e 100%)",
                border: "1px solid rgba(0,243,255,0.3)",
                boxShadow: "0 0 40px rgba(0,243,255,0.12), 0 0 80px rgba(255,0,127,0.06)",
                borderRadius: 8,
                padding: "24px 28px 28px",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span
                  className="font-[family-name:var(--font-display)] font-black tracking-[0.2em] uppercase"
                  style={{
                    fontSize: "clamp(11px,1.1vw,15px)",
                    color: "#ffdd00",
                    textShadow: "0 0 10px rgba(255,221,0,0.6)",
                  }}
                >
                  ⚙ PROFILE SETTINGS
                </span>
                <button
                  onClick={onClose}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#00f3ff88", fontSize: 18, lineHeight: 1,
                    padding: "0 2px",
                    fontFamily: "var(--font-display)",
                  }}
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Demo mode notice */}
              {isDemo && (
                <p
                  style={{
                    fontFamily: "var(--font-chat)",
                    fontSize: "clamp(9px,0.85vw,12px)",
                    color: "#ffdd0099",
                    margin: "-8px 0 -4px",
                    borderLeft: "2px solid #ffdd0055",
                    paddingLeft: 8,
                  }}
                >
                  Demo mode — changes saved locally only.
                </p>
              )}

              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(9px,0.85vw,12px)",
                    color: "#00f3ffaa",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                >
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  placeholder="e.g. NeonRider99"
                  style={inputBase}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(0,243,255,0.6)";
                    e.currentTarget.style.boxShadow = "0 0 10px rgba(0,243,255,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(0,243,255,0.25)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-chat)",
                    fontSize: "clamp(8px,0.75vw,10px)",
                    color: "#ffffff33",
                    textAlign: "right",
                  }}
                >
                  {username.trim().length}/20
                </span>
              </div>

              {/* Vehicle badge */}
              <div className="flex flex-col gap-1.5">
                <label
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(9px,0.85vw,12px)",
                    color: "#00f3ffaa",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                >
                  Vehicle Badge
                </label>
                <div className="flex gap-2 flex-wrap">
                  {BADGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBadge(opt.value)}
                      style={{
                        background: badge === opt.value ? "rgba(0,243,255,0.12)" : "#07081a",
                        border: badge === opt.value
                          ? "1px solid rgba(0,243,255,0.6)"
                          : "1px solid rgba(0,243,255,0.15)",
                        borderRadius: 4,
                        padding: "5px 12px",
                        cursor: "pointer",
                        color: badge === opt.value ? "#00f3ff" : "#ffffff66",
                        fontFamily: "var(--font-chat)",
                        fontSize: "clamp(10px,0.9vw,13px)",
                        transition: "all 0.15s ease",
                        outline: "none",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Badge color */}
              <div className="flex flex-col gap-1.5">
                <label
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(9px,0.85vw,12px)",
                    color: "#00f3ffaa",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                >
                  Username Color
                </label>
                <div className="flex gap-2 flex-wrap items-center">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      title={c}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: c,
                        border: color === c
                          ? "2px solid #ffffff"
                          : "2px solid transparent",
                        boxShadow: color === c
                          ? `0 0 8px ${c}` : "none",
                        cursor: "pointer",
                        outline: "none",
                        WebkitTapHighlightColor: "transparent",
                        transition: "box-shadow 0.15s ease",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                  {/* Custom colour picker */}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    title="Custom color"
                    style={{
                      width: 26, height: 26, borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.2)",
                      cursor: "pointer", background: "none",
                      padding: 0, outline: "none",
                      WebkitAppearance: "none",
                    }}
                  />
                </div>
                {/* Preview */}
                <p style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(9px,0.85vw,12px)",
                  color,
                  textShadow: `0 0 6px ${color}88`,
                  marginTop: 2,
                }}>
                  Preview: <strong>{username.trim() || "YourName"}</strong>: hey chat 👋
                </p>
              </div>

              {/* Error */}
              {error && (
                <p style={{
                  fontFamily: "var(--font-chat)",
                  fontSize: "clamp(9px,0.85vw,12px)",
                  color: "#ff6b00",
                  borderLeft: "2px solid #ff6b00",
                  paddingLeft: 8,
                }}>
                  ⚠ {error}
                </p>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving || saved}
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: 4,
                  border: "none",
                  cursor: saving || saved ? "default" : "pointer",
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  letterSpacing: "0.2em",
                  fontSize: "clamp(10px,0.95vw,13px)",
                  textTransform: "uppercase",
                  outline: "none",
                  WebkitTapHighlightColor: "transparent",
                  transition: "all 0.2s ease",
                  background: saved
                    ? "rgba(57,255,20,0.15)"
                    : "rgba(0,243,255,0.1)",
                  color: saved ? "#39ff14" : "#00f3ff",
                  textShadow: saved
                    ? "0 0 12px #39ff14"
                    : "0 0 10px rgba(0,243,255,0.8)",
                  boxShadow: saved
                    ? "0 0 20px rgba(57,255,20,0.2)"
                    : "0 0 15px rgba(0,243,255,0.15)",
                }}
              >
                {saved ? "✓ SAVED" : saving ? "SAVING..." : "SAVE PROFILE"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
