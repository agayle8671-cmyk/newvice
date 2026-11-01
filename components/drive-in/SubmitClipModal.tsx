"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardViceCred, useViceEconomy } from "@/lib/economy/vice-cred";

interface SubmitClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCreatorName?: string;
  userId?: string;
  onClipSubmitted?: (title: string, creator: string, scout: string) => void;
}

export default function SubmitClipModal({
  isOpen,
  onClose,
  defaultCreatorName = "",
  userId,
  onClipSubmitted,
}: SubmitClipModalProps) {
  const economy = useViceEconomy();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState(defaultCreatorName);
  const [scoutName, setScoutName] = useState(defaultCreatorName);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      if (!creatorName && defaultCreatorName) setCreatorName(defaultCreatorName);
      if (!scoutName && defaultCreatorName) setScoutName(defaultCreatorName);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUrl = url.trim();
    const cleanTitle = title.trim();

    if (!cleanUrl) {
      setErrorMsg("Please paste a valid video clip URL.");
      return;
    }
    if (!cleanTitle) {
      setErrorMsg("Please give your clip a title.");
      return;
    }

    const finalCreator = creatorName.trim() || defaultCreatorName || "Vice Driver";
    const finalScout = scoutName.trim() || defaultCreatorName || finalCreator;

    setLoading(true);
    try {
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          title: cleanTitle,
          creatorName: finalCreator,
          scoutName: finalScout,
          scoutUserId: userId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit clip");
      }

      awardViceCred(50, "clip_scouted");
      setSuccessMsg(`${data.message || "Clip queued!"} (+50 VICE CRED EARNED)`);
      if (onClipSubmitted) {
        onClipSubmitted(cleanTitle, finalCreator, finalScout);
      }
      setTimeout(() => {
        setUrl("");
        setTitle("");
        setSuccessMsg(null);
        onClose();
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to queue clip";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-[#0c051a] border border-[#ff007f]/40 rounded-xl shadow-[0_0_50px_rgba(255,0,127,0.25)] p-6 overflow-hidden"
          >
            {/* Top glowing ambient border */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00f3ff] via-[#ff007f] to-[#ffdd00]" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎬</span>
                <h3 className="text-lg font-bold text-white tracking-wider font-[family-name:var(--font-display)]">
                  PROJECT YOUR CLIP ON SCREEN
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white transition-colors text-xl font-mono"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between mb-3 bg-[#ffdd00]/10 border border-[#ffdd00]/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-mono text-[#ffdd00]">
                <span>{economy.rank.badge}</span>
                <span>SCOUT RANK: <strong>{economy.rank.title}</strong> ({economy.viceCred} CRED)</span>
              </div>
              <span className="text-[10px] font-bold bg-[#ff007f] text-white px-2 py-0.5 rounded uppercase tracking-wider">
                +50 CRED REWARD
              </span>
            </div>

            <p className="text-xs text-white/70 mb-4 font-[family-name:var(--font-chat)]">
              Got an insane stunt, police pursuit, or hilarious fail in GTA VI? Scout or submit a clip URL to broadcast it live to the lot and earn <strong>Vice Cred</strong> toward Row A VIP parking!
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#00f3ff] uppercase tracking-wider mb-1 font-[family-name:var(--font-chat)]">
                  Clip URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://medal.tv/..., streamable.com/..., or .mp4"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-black/60 border border-[#00f3ff]/30 focus:border-[#ff007f] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-all font-mono"
                />
                <span className="text-[10px] text-white/40 block mt-1 font-mono">
                  Supported: Medal.tv, Streamable, Reddit, YouTube, Direct MP4/HLS
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#00f3ff] uppercase tracking-wider mb-1 font-[family-name:var(--font-chat)]">
                  Clip Title / Stunt Description
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="e.g. 5-Star Police Escape through Vice Beach"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-black/60 border border-[#00f3ff]/30 focus:border-[#ff007f] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#00f3ff] uppercase tracking-wider mb-1 font-[family-name:var(--font-chat)]">
                    Original Creator Handle
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="e.g. SpeedDemon99"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    className="w-full bg-black/60 border border-[#00f3ff]/30 focus:border-[#ff007f] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#ffdd00] uppercase tracking-wider mb-1 font-[family-name:var(--font-chat)]">
                    Scouted By (Your Handle)
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="e.g. ViceScout"
                    value={scoutName}
                    onChange={(e) => setScoutName(e.target.value)}
                    className="w-full bg-black/60 border border-[#ffdd00]/30 focus:border-[#ffdd00] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2.5 text-xs text-red-200 font-mono">
                  ⚠️ {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="bg-[#39ff14]/20 border border-[#39ff14]/50 rounded-lg p-3 text-xs text-[#39ff14] font-mono flex items-center gap-2">
                  <span>✨</span>
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-white/60 hover:text-white transition-colors font-mono"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={loading || Boolean(successMsg)}
                  className="relative px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#ff007f] to-[#9900ff] hover:from-[#ff1a8c] hover:to-[#aa1aff] text-white text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,127,0.4)] disabled:opacity-50 transition-all font-[family-name:var(--font-chat)]"
                >
                  {loading ? "VERIFYING & QUEUING..." : "🚀 PROJECT ON SCREEN"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
