"use client";

import { useState } from "react";

interface SubmitClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCreatorName?: string;
  onClipSubmitted?: (title: string, creator: string) => void;
}

export default function SubmitClipModal({
  isOpen,
  onClose,
  defaultCreatorName = "",
  onClipSubmitted,
}: SubmitClipModalProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState(defaultCreatorName);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setErrorMsg("Please give your clip a headline.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          title: cleanTitle,
          creatorName: creatorName.trim() || "Leonida Citizen",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit clip");
      }

      setSuccessMsg(data.message || "Clip queued for live broadcast!");
      if (onClipSubmitted) {
        onClipSubmitted(cleanTitle, creatorName.trim() || "Leonida Citizen");
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white text-black border border-black border-b-[4px] shadow-2xl overflow-hidden"
      >
        <div className="h-1.5 bg-[#e04040]" />

        <div className="flex items-center justify-between px-6 pt-5 pb-3.5 border-b border-black">
          <div>
            <span
              className="inline-block bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              LIVE BROADCAST DESK
            </span>
            <h3
              className="text-[28px] font-extrabold uppercase leading-none"
              style={{ fontFamily: "'Big Shoulders Text', sans-serif" }}
            >
              SUBMIT COMMUNITY CLIP
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-black/60 hover:text-[#e04040] transition-colors text-lg font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p
            className="text-[13px] text-black/80 leading-relaxed"
            style={{ fontFamily: "'Roboto Slab', serif" }}
          >
            Captured a GTA VI trailer breakdown, physics analysis, or verified gameplay clip? Submit your link to queue it on the synchronized Leonida Vice live broadcast feed.
          </p>

          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Video Clip URL
            </label>
            <input
              type="url"
              required
              placeholder="https://medal.tv/..., streamable.com/..., or .mp4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
            <span
              className="text-[11px] text-black/55 block mt-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Supported: Medal.tv, Streamable, Reddit, YouTube, Direct MP4/HLS
            </span>
          </div>

          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Broadcast Headline / Clip Title
            </label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="e.g. Vice Beach Ocean Drive Frame-by-Frame Breakdown"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>

          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              Citizen Attribution (Display Name)
            </label>
            <input
              type="text"
              maxLength={30}
              placeholder="e.g. ViceReporter305"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>

          {errorMsg && (
            <div
              className="bg-[#e04040]/10 border border-[#e04040] px-3 py-2.5 text-xs font-semibold text-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              ⚠ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              className="bg-emerald-50 border border-emerald-700 px-3 py-2.5 text-xs font-semibold text-emerald-800"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              ✓ {successMsg}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-black/15">
            <button
              type="button"
              onClick={onClose}
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-black hover:bg-[#f4f4f4] transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || Boolean(successMsg)}
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className="px-5 py-2.5 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? "VERIFYING & QUEUING..." : "SUBMIT TO LIVE BROADCAST"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
