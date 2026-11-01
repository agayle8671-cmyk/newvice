"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { platformIcon } from "@/lib/video/catalog";
import type {
  AdminVideoCatalogRow,
  AggregatorRunRow,
} from "@/app/api/admin/videos/route";

export interface AdminBroadcastQueueTabProps {
  authHeaders: () => HeadersInit;
  onCatalogCountChange?: (activeCount: number) => void;
}

interface BroadcastStats {
  total: number;
  activePlayable: number;
  inactive: number;
  platforms: Record<string, number>;
}

interface ForcedOverrideState {
  videoId: string;
  startedAtMs: number;
  expiresAtMs: number;
}

export default function AdminBroadcastQueueTab({
  authHeaders,
  onCatalogCountChange,
}: AdminBroadcastQueueTabProps) {
  const [videos, setVideos] = useState<AdminVideoCatalogRow[]>([]);
  const [recentRuns, setRecentRuns] = useState<AggregatorRunRow[]>([]);
  const [stats, setStats] = useState<BroadcastStats>({
    total: 0,
    activePlayable: 0,
    inactive: 0,
    platforms: {},
  });
  const [forcedOverride, setForcedOverride] = useState<ForcedOverrideState | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  // Quick Add Clip URL state
  const [quickUrl, setQuickUrl] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCreator, setQuickCreator] = useState("LeonidaBroadcastDesk");
  const [submittingClip, setSubmittingClip] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/videos", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok) {
        setVideos(data.videos ?? []);
        setRecentRuns(data.recentRuns ?? []);
        setForcedOverride(data.forcedOverride ?? null);
        if (data.stats) {
          setStats(data.stats);
          onCatalogCountChange?.(data.stats.activePlayable ?? 0);
        }
      }
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to load broadcast catalog.",
      });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, onCatalogCountChange]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRunScraper = async (spawnPython = false) => {
    setScraping(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          action: "scrape_now",
          spawnPython,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Scraper run failed.");
      }

      const pyMsg = data.pythonDispatched
        ? " + Launched 20-platform Python background crawler!"
        : "";
      setFeedback({
        kind: "ok",
        text: `Scraped ${data.sourcesCrawled} live feeds • Found ${data.found} GTA VI videos • Added ${data.added} brand-new clips to rotation (${data.rejected} filtered)!${pyMsg}`,
      });
      await loadCatalog();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to run scraper.",
      });
    } finally {
      setScraping(false);
    }
  };

  const handleVideoAction = async (
    action: "play_now" | "clear_pin" | "toggle_active" | "reset_plays" | "delete",
    video?: AdminVideoCatalogRow,
    extra?: Record<string, unknown>
  ) => {
    const busyKey = video ? `${action}_${video.id}` : action;
    setActionBusyId(busyKey);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          action,
          videoId: video?.id,
          durationSec: video?.duration_sec ?? 75,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Action failed.");
      }

      if (action === "play_now" && video) {
        setFeedback({
          kind: "ok",
          text: `⚡ LIVE OVERRIDE ACTIVE: "${video.title}" is now playing on the Front Page Broadcast Stage!`,
        });
      } else if (action === "clear_pin") {
        setFeedback({
          kind: "ok",
          text: "Returned broadcast to automatic synchronized rotation.",
        });
      } else if (action === "reset_plays" && video) {
        setFeedback({
          kind: "ok",
          text: `Moved "${video.title}" to the front of the rotation (play_count = 0).`,
        });
      } else if (action === "delete" && video) {
        setFeedback({
          kind: "ok",
          text: `Removed "${video.title}" from video_catalog.`,
        });
      }
      await loadCatalog();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not complete action.",
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleQuickSubmitClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setSubmittingClip(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: quickUrl.trim(),
          title: quickTitle.trim() || undefined,
          creatorName: quickCreator.trim() || "LeonidaBroadcastDesk",
          category: "gameplay",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not resolve or submit clip URL.");
      }
      setQuickUrl("");
      setQuickTitle("");
      setFeedback({
        kind: "ok",
        text: `Added "${data.item?.title || "New Clip"}" directly to the live broadcast queue!`,
      });
      await loadCatalog();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to submit clip.",
      });
    } finally {
      setSubmittingClip(false);
    }
  };

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter((v) => {
      if (statusFilter === "active" && !v.eligibleForBroadcast) return false;
      if (statusFilter === "disabled" && v.eligibleForBroadcast) return false;
      if (
        platformFilter !== "all" &&
        (v.source_platform || "").toLowerCase() !== platformFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        (v.title || "").toLowerCase().includes(q) ||
        (v.creator_name || "").toLowerCase().includes(q) ||
        (v.source_platform || "").toLowerCase().includes(q) ||
        (v.id || "").toLowerCase().includes(q)
      );
    });
  }, [videos, searchQuery, statusFilter, platformFilter]);

  return (
    <div className="max-w-[1640px] mx-auto px-4 sm:px-6 py-7 space-y-7">
      {/* ── STATUS FEEDBACK BANNER ────────────────────────────────────────── */}
      {feedback && (
        <div
          className={`border-2 px-4 py-3 flex items-center justify-between gap-3 ${
            feedback.kind === "ok"
              ? "border-black bg-[#eefbf3] text-black"
              : "border-[#e04040] bg-[#fff2f2] text-[#e04040]"
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wider np-ui">
            {feedback.kind === "ok" ? "✓ " : "⚠ "}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold uppercase px-2 py-0.5 border border-black/30 hover:bg-black hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── TOP COMMAND DECK: STATS + 1-CLICK SCRAPER + QUICK URL INGEST ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7: Scraper Controls & Live Rotation Telemetry */}
        <div className="lg:col-span-7 bg-white border border-black border-b-[4px] p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-black">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e04040] np-ui block">
                AUTOMATED 20-PLATFORM VIDEO INGESTION &amp; MASTER TV CLOCK
              </span>
              <h1 className="np-head font-extrabold uppercase text-[32px] leading-none mt-0.5">
                LIVE BROADCAST QUEUE &amp; SCRAPER
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={scraping}
                onClick={() => void handleRunScraper(false)}
                className="px-4 py-2 bg-[#e04040] hover:bg-black text-white text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer np-ui shadow-[2px_2px_0_#000]"
              >
                {scraping ? "⟳ SCRAPING LIVE FEEDS..." : "🔄 SCRAPE FRESH CLIPS NOW"}
              </button>
              <button
                type="button"
                disabled={scraping}
                onClick={() => void handleRunScraper(true)}
                className="px-3 py-2 bg-black hover:bg-[#e04040] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                title="Also launches python -m crawler.run_all across Rumble, Dailymotion, Medal, Kick & Reddit in the background"
              >
                🐍 + 20-SOURCE PYTHON CRAWL
              </button>
            </div>
          </div>

          {/* 4 Metric Boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-black p-3 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-black/60 np-ui">
                ACTIVE IN ROTATION
              </div>
              <div className="text-2xl font-extrabold text-[#e04040] np-head mt-0.5">
                {stats.activePlayable} CLIPS
              </div>
              <div className="text-[10.5px] text-black/65 np-ui">
                English + Playable Stream
              </div>
            </div>

            <div className="border border-black p-3 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-black/60 np-ui">
                TOTAL CATALOG ROWS
              </div>
              <div className="text-2xl font-extrabold text-black np-head mt-0.5">
                {stats.total}
              </div>
              <div className="text-[10.5px] text-black/65 np-ui">
                {stats.inactive} retired / filtered
              </div>
            </div>

            <div className="border border-black p-3 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-black/60 np-ui">
                AUTO-CRON SCHEDULE
              </div>
              <div className="text-2xl font-extrabold text-emerald-800 np-head mt-0.5">
                EVERY 6 HRS
              </div>
              <div className="text-[10.5px] text-black/65 np-ui">
                4× Daily + Noon Refresh
              </div>
            </div>

            <div className="border border-black p-3 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-black/60 np-ui">
                QUEUE ORDERING
              </div>
              <div className="text-2xl font-extrabold text-black np-head mt-0.5">
                FRESH FIRST
              </div>
              <div className="text-[10.5px] text-black/65 np-ui">
                0-Play Clips Play First
              </div>
            </div>
          </div>

          {/* Active Live Pin Banner if an Admin Override is running */}
          {forcedOverride && (
            <div className="bg-black text-white p-3.5 border-l-4 border-l-[#e04040] flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider mr-2">
                  ⚡ LIVE BROADCAST PINNED
                </span>
                <span className="text-xs font-mono">
                  Currently forcing clip ID <strong>{forcedOverride.videoId}</strong> on the Front Page stage.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleVideoAction("clear_pin")}
                className="px-3 py-1 bg-white text-black hover:bg-[#e04040] hover:text-white text-[11px] font-extrabold uppercase tracking-wider cursor-pointer"
              >
                ↩ RESUME AUTO CLOCK
              </button>
            </div>
          )}

          {/* Platform Breakdown Pills */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10.5px] font-bold uppercase text-black/60 mr-1 np-ui">
              SOURCES IN DB:
            </span>
            <button
              type="button"
              onClick={() => setPlatformFilter("all")}
              className={`px-2.5 py-0.5 text-[11px] font-bold uppercase border cursor-pointer np-ui ${
                platformFilter === "all"
                  ? "bg-black text-white border-black"
                  : "bg-white text-black border-black/30 hover:border-black"
              }`}
            >
              ALL ({stats.total})
            </button>
            {Object.entries(stats.platforms).map(([plat, count]) => (
              <button
                key={plat}
                type="button"
                onClick={() => setPlatformFilter(plat)}
                className={`px-2.5 py-0.5 text-[11px] font-bold uppercase border cursor-pointer np-ui ${
                  platformFilter === plat
                    ? "bg-[#e04040] text-white border-[#e04040]"
                    : "bg-white text-black border-black/30 hover:border-black"
                }`}
              >
                {platformIcon(plat)} {plat} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Right 5: Direct Clip URL Ingest + Recent Scraper Run Logs */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-black border-b-[4px] p-5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e04040] np-ui block">
              INSTANT MANUAL INGEST
            </span>
            <h2 className="np-head font-extrabold uppercase text-[24px] leading-none mt-0.5 mb-3">
              ADD CLIP URL TO BROADCAST
            </h2>
            <form onSubmit={handleQuickSubmitClip} className="space-y-2.5">
              <input
                type="url"
                required
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                placeholder="Paste URL (Rumble, Reddit, Medal.tv, YouTube, Archive.org, .mp4)..."
                className="np-input text-xs py-2"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Optional custom title..."
                  className="np-input text-xs py-1.5"
                />
                <input
                  type="text"
                  value={quickCreator}
                  onChange={(e) => setQuickCreator(e.target.value)}
                  placeholder="Creator handle..."
                  className="np-input text-xs py-1.5"
                />
              </div>
              <button
                type="submit"
                disabled={submittingClip}
                className="w-full py-2 bg-black hover:bg-[#e04040] text-white text-xs font-extrabold uppercase tracking-widest transition-colors cursor-pointer np-ui"
              >
                {submittingClip ? "RESOLVING STREAM..." : "+ RESOLVE & ADD TO ROTATION"}
              </button>
            </form>
          </div>

          {/* Recent Aggregator Runs */}
          {recentRuns.length > 0 && (
            <div className="bg-white border border-black p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-black pb-2 mb-2 border-b border-black np-ui">
                RECENT AUTOMATED &amp; MANUAL SCRAPER RUNS
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono">
                {recentRuns.slice(0, 6).map((run, idx) => (
                  <div
                    key={run.id ?? idx}
                    className="flex items-center justify-between gap-2 py-1 border-b border-black/10 last:border-b-0"
                  >
                    <span className="text-black/70">
                      {new Date(run.run_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      Crawled: <strong>{run.sources_crawled}</strong> • Found:{" "}
                      <strong>{run.videos_found}</strong> •{" "}
                      <span className="text-emerald-700 font-bold">
                        +{run.videos_added} Added
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── VIDEO CATALOG TABLE & LIVE BROADCAST CONTROLS ─────────────────── */}
      <div className="bg-white border border-black border-b-[4px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-black">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                ["all", `All Catalog (${videos.length})`],
                ["active", `Active Rotation (${stats.activePlayable})`],
                ["disabled", `Disabled / Filtered (${stats.inactive})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-bold uppercase border border-black cursor-pointer np-ui ${
                  statusFilter === key
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-black/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clips by title, creator, or platform..."
              className="np-input text-xs py-1.5 sm:w-80"
            />
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="px-3 py-1.5 border border-black bg-white hover:bg-black hover:text-white text-xs font-bold uppercase cursor-pointer np-ui"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold uppercase tracking-widest text-black/60 np-ui">
            Loading Supabase video_catalog...
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="py-14 text-center text-sm text-black/60 np-slab">
            No video clips matched your current filter. Click{" "}
            <strong>🔄 SCRAPE FRESH CLIPS NOW</strong> above to pull fresh GTA VI clips!
          </div>
        ) : (
          <div className="divide-y divide-black/15">
            {filteredVideos.map((vid) => {
              const isPinnedNow = forcedOverride?.videoId === vid.id;
              const isActive = vid.is_active !== false && vid.is_approved !== false;

              return (
                <div
                  key={vid.id}
                  className={`py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    isPinnedNow ? "bg-[#fff4f4] px-3 -mx-3 border-l-4 border-l-[#e04040]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Thumbnail or Platform Icon */}
                    <div className="w-28 aspect-video bg-black border border-black shrink-0 overflow-hidden relative flex items-center justify-center text-white">
                      {vid.thumbnail_url ? (
                        <img
                          src={vid.thumbnail_url}
                          alt={vid.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg">
                          {platformIcon(vid.source_platform)}
                        </span>
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/85 text-white font-mono text-[9.5px] px-1">
                        {vid.duration_sec ? `${vid.duration_sec}s` : "75s"}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPinnedNow && (
                          <span className="bg-[#e04040] text-white px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider np-ui">
                            ⚡ PLAYING LIVE ON FRONT PAGE
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider np-ui ${
                            vid.eligibleForBroadcast
                              ? "bg-emerald-800 text-white"
                              : "bg-black/15 text-black/70"
                          }`}
                        >
                          {vid.eligibleForBroadcast ? "● IN ROTATION" : "○ FILTERED / OFF"}
                        </span>
                        <span className="text-[11px] font-bold uppercase text-[#e04040] np-ui">
                          {platformIcon(vid.source_platform)} {vid.source_platform}
                        </span>
                        <span className="text-[11px] font-mono text-black/60">
                          • Plays: <strong>{vid.play_count ?? 0}</strong>
                        </span>
                      </div>

                      <h3 className="np-head font-bold text-[19px] leading-snug text-black mt-1 truncate">
                        {vid.title}
                      </h3>

                      <div className="text-[11.5px] text-black/65 np-ui mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Creator: @{vid.creator_name || "Unknown"}</span>
                        <span>•</span>
                        <span>
                          Scraped:{" "}
                          {vid.fetched_at
                            ? new Date(vid.fetched_at).toLocaleDateString()
                            : "Recent"}
                        </span>
                        {vid.canonical_url && (
                          <>
                            <span>•</span>
                            <a
                              href={vid.canonical_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#e04040] hover:underline font-semibold"
                            >
                              Original Source ↗
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      disabled={actionBusyId === `play_now_${vid.id}`}
                      onClick={() => void handleVideoAction("play_now", vid)}
                      className="px-3 py-1.5 bg-[#e04040] hover:bg-black text-white text-[11px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                      title="Force this clip to play immediately on the Front Page live broadcast"
                    >
                      ▶ PLAY LIVE NOW
                    </button>

                    {(vid.play_count ?? 0) > 0 && (
                      <button
                        type="button"
                        disabled={actionBusyId === `reset_plays_${vid.id}`}
                        onClick={() => void handleVideoAction("reset_plays", vid)}
                        className="px-2.5 py-1.5 border border-black bg-white hover:bg-black hover:text-white text-[11px] font-bold uppercase transition-colors cursor-pointer np-ui"
                        title="Reset play_count to 0 so this clip jumps to the front of the rotation"
                      >
                        ↑ QUEUE FIRST
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={actionBusyId === `toggle_active_${vid.id}`}
                      onClick={() =>
                        void handleVideoAction("toggle_active", vid, {
                          isActive: !isActive,
                        })
                      }
                      className="px-2.5 py-1.5 border border-black/40 text-black/80 hover:border-black text-[11px] font-bold uppercase transition-colors cursor-pointer np-ui"
                    >
                      {isActive ? "Disable" : "Enable"}
                    </button>

                    <button
                      type="button"
                      disabled={actionBusyId === `delete_${vid.id}`}
                      onClick={() => void handleVideoAction("delete", vid)}
                      className="px-2.5 py-1.5 border border-[#e04040] text-[#e04040] hover:bg-[#e04040] hover:text-white text-[11px] font-bold uppercase transition-colors cursor-pointer np-ui"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
