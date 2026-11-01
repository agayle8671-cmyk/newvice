"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { VideoItem, PlayerState } from "@/lib/video/types";
import {
  generateXRayCuesForVideo,
  LEONIDA_REGION_PINS,
  type XRayMetadataCue,
  type VideoSeekCommandDetail,
} from "@/lib/video/xray-telemetry";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";

const HANDOFF_THRESHOLD_SEC = 2.5;
const API_ENDPOINT = "/api/video/next";

// Hosts supported by /api/video/stream and PartyServer /proxy-media CORS byte-range proxy
const PROXYABLE_MEDIA_HOSTS = [
  "archive.org",
  "streamable.com",
  "mux.dev",
  "medal.tv",
  "redd.it",
  "redditmedia.com",
  "peertube",
  "odysee.com",
  "lbryplayer.xyz",
  "rumble.com",
  "kick.com",
  "dailymotion.com",
  "vimeo.com",
  "imgur.com",
  "coub.com",
  "supabase.co",
  "bitchute.com",
  "twimg.com",
  "hdslb.com",
  "vkuser",
];

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("lv_vid_session");
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("lv_vid_session", id);
  }
  return id;
}

function isHlsUrl(url: string): boolean {
  return url.includes(".m3u8") || url.includes("m3u8");
}

function canProxyUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return PROXYABLE_MEDIA_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`) || host.includes(h)
    );
  } catch {
    return false;
  }
}

/**
 * Playback strategies for a progressive MP4, tried in order until one loads:
 *   party  — Cloudflare edge CORS proxy (zero egress cost; enables Web Audio DSP)
 *   vercel — /api/video/stream byte-range proxy (CORS-enabled, but bills Vercel bandwidth)
 *   direct — raw CDN URL without CORS (always plays; no loudness-normalizer/analyser)
 *
 * With no edge proxy configured we play DIRECT first so ordinary viewing never streams
 * 100MB MP4s through Vercel functions; the Vercel proxy is only a last-resort fallback.
 */
export type MediaStrategy = "party" | "vercel" | "direct";

function getPartyHost(): string {
  return (process.env.NEXT_PUBLIC_PARTYSERVER_HOST || "")
    .trim()
    .replace(/^(http|https|ws|wss):\/\//, "")
    .replace(/\/$/, "");
}

export function getStrategyOrder(allowDirect = true): MediaStrategy[] {
  const order: MediaStrategy[] = getPartyHost()
    ? ["party", "vercel", "direct"]
    : process.env.NEXT_PUBLIC_ENABLE_VERCEL_MEDIA_PROXY === "true"
    ? ["vercel", "direct"]
    : ["direct", "vercel"];
  // A <video> already wired into Web Audio goes silent on non-CORS sources, so never use direct for it
  return allowDirect ? order : order.filter((x) => x !== "direct");
}

export function resolveMediaUrl(
  rawUrl: string,
  strategy: MediaStrategy
): { url: string; useAnonymousCors: boolean } {
  if (!rawUrl) return { url: "", useAnonymousCors: false };

  // Same-origin and HLS (hls.js XHR) never need a proxy
  if (rawUrl.startsWith("/") || isHlsUrl(rawUrl)) {
    return { url: rawUrl, useAnonymousCors: false };
  }
  if (!canProxyUrl(rawUrl)) return { url: rawUrl, useAnonymousCors: false };

  if (strategy === "party") {
    const partyHost = getPartyHost();
    if (partyHost) {
      const proto =
        partyHost.startsWith("localhost:") || partyHost.startsWith("127.0.0.1:") ? "http" : "https";
      return {
        url: `${proto}://${partyHost}/proxy-media?url=${encodeURIComponent(rawUrl)}`,
        useAnonymousCors: true,
      };
    }
  }
  if (strategy === "vercel" || strategy === "party") {
    return { url: `/api/video/stream?url=${encodeURIComponent(rawUrl)}`, useAnonymousCors: true };
  }
  const isNativeCorsCdn =
    rawUrl.includes("archive.org") ||
    rawUrl.includes("supabase.co") ||
    rawUrl.includes("mux.dev") ||
    rawUrl.includes("peertube");
  return { url: rawUrl, useAnonymousCors: isNativeCorsCdn };
}

function hasDirectStream(item: VideoItem | null | undefined): boolean {
  return Boolean(item && (item.manifestUrl || item.directMp4Url));
}

function isOfficialEmbedOnly(item: VideoItem | null | undefined): boolean {
  if (!item) return false;
  return !hasDirectStream(item) && Boolean(item.youtubeId || item.embedUrl);
}

// ─── HLS helper types ─────────────────────────────────────────────────────────
type HlsInstance = import("hls.js").default;
type VideoWithMeta = HTMLVideoElement & {
  _hls?: HlsInstance;
  _rawUrl?: string;
  _itemId?: string;
  _strategyIdx?: number;
};

async function attachSource(
  video: HTMLVideoElement,
  rawUrl: string,
  itemId: string,
  muted: boolean,
  strategyIdx = 0
): Promise<HlsInstance | null> {
  const v = video as VideoWithMeta;
  video.muted = muted;
  video.playbackRate = 1.0;

  if (v._hls) {
    v._hls.destroy();
    v._hls = undefined;
  }

  const audioGraph = getDriveInAudioGraph();
  const alreadyRoutedToWebAudio = audioGraph.isElementRouted(video);

  const order = getStrategyOrder(!alreadyRoutedToWebAudio);
  const idx = Math.min(strategyIdx, order.length - 1);
  v._rawUrl = rawUrl;
  v._itemId = itemId;
  v._strategyIdx = idx;

  const resolved = resolveMediaUrl(rawUrl, order[idx]);

  if (resolved.useAnonymousCors) {
    video.crossOrigin = "anonymous";
  } else if (!alreadyRoutedToWebAudio) {
    video.removeAttribute("crossorigin");
  }

  if (isHlsUrl(rawUrl)) {
    const { default: Hls } = await import("hls.js");

    if (Hls.isSupported()) {
      const hls = new Hls({
        autoStartLoad: true,
        startFragPrefetch: true,
        lowLatencyMode: false,
        enableWorker: true,
        maxBufferLength: 30,
      });
      hls.loadSource(resolved.url);
      hls.attachMedia(video);
      v._hls = hls;
      return hls;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = resolved.url;
      return null;
    }

    return null;
  }

  video.src = resolved.url;
  return null;
}

function destroyHls(video: HTMLVideoElement | null) {
  if (!video) return;
  const v = video as VideoWithMeta;
  if (v._hls) {
    v._hls.destroy();
    v._hls = undefined;
  }
}

export interface UseSeamlessPlayerOptions {
  /** Authoritative room-synced current video (PartyServer DO or deterministic server-clock) */
  syncedCurrent?: VideoItem | null;
  /** Authoritative room-synced next video for background Slot B pre-buffering */
  syncedNext?: VideoItem | null;
  /** Epoch ms when current clip began on the server (updated on Encore +15s surges too) */
  clipStartTimestamp?: number;
  /** Lock-free RTT-compensated CurrentClipOffset in seconds */
  getSyncedOffsetSec?: () => number;
  /** Reports true decoded MP4/HLS duration back to PartyServer to self-calibrate catalog */
  onReportDuration?: (videoId: string, durationSec: number) => void;
  /** Requests immediate room sync refresh if needed */
  onRefreshSync?: () => Promise<void>;
  /** Fired whenever the HTMLTrackElement (kind="metadata") cue changes */
  onCueChange?: (cue: XRayMetadataCue | null, allCues: XRayMetadataCue[]) => void;
}

// ─── Dual-DOM Seamless Player Hook 2.0 ────────────────────────────────────────
export function useSeamlessPlayer(options: UseSeamlessPlayerOptions = {}) {
  const {
    syncedCurrent,
    syncedNext,
    clipStartTimestamp,
    getSyncedOffsetSec,
    onReportDuration,
    onRefreshSync,
    onCueChange,
  } = options;

  const isRoomControlled = syncedCurrent !== undefined;
  // YouTube/Vimeo-style items with no direct stream play via the official iframe embed
  const isEmbedFallback = isRoomControlled && isOfficialEmbedOnly(syncedCurrent);

  const playerARef = useRef<HTMLVideoElement>(null);
  const playerBRef = useRef<HTMLVideoElement>(null);

  const activeSlot = useRef<"A" | "B">("A");
  const swapping = useRef(false);
  const swapQueued = useRef(false);
  const swapRef = useRef<() => Promise<void>>(async () => {});

  const volumeRef = useRef(0.85);
  const mutedRef = useRef(true);
  const reportedDurationIds = useRef<Set<string>>(new Set());

  // Forensic / manual seek hold: when true, room-clock drift correction yields to user inspection
  const forensicHoldRef = useRef(false);
  const [isForensicHold, setIsForensicHold] = useState(false);
  const [resyncNonce, setResyncNonce] = useState(0);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const syncFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [fps, setFps] = useState(30);
  const [frameNumber, setFrameNumber] = useState(0);
  const [cues, setCues] = useState<XRayMetadataCue[]>([]);
  const [activeCue, setActiveCue] = useState<XRayMetadataCue | null>(null);
  const cuesRef = useRef<XRayMetadataCue[]>([]);
  const activeCueIdRef = useRef<string | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({
    status: "idle",
    current: null,
    next: null,
    isMuted: true,
    volume: 0.85,
    progress: 0,
    duration: 0,
  });

  const [opacity, setOpacity] = useState({ A: 1, B: 0 });

  const slotEl = useCallback(
    (slot: "A" | "B"): HTMLVideoElement | null =>
      slot === "A" ? playerARef.current : playerBRef.current,
    []
  );

  const activeEl = useCallback(() => slotEl(activeSlot.current), [slotEl]);
  const prebufferEl = useCallback(
    () => slotEl(activeSlot.current === "A" ? "B" : "A"),
    [slotEl]
  );

  const applyVolumeToActiveElement = useCallback(
    (el: HTMLVideoElement | null) => {
      const audioGraph = getDriveInAudioGraph();
      audioGraph.setMasterVolume(volumeRef.current, mutedRef.current);
      if (!el) return;
      el.muted = mutedRef.current;
      // When routed through Web Audio, masterGain controls volume post-compressor
      el.volume = audioGraph.isElementRouted(el) ? 1.0 : volumeRef.current;
    },
    []
  );

  // ── Standalone queue fetch (used only when not controlled by useDriveInRoom) ──
  const fetchNext = useCallback(async (): Promise<VideoItem | null> => {
    try {
      const res = await fetch(`${API_ENDPOINT}?session=${getSessionId()}`);
      if (!res.ok) throw new Error("queue error");
      const data = await res.json();
      return data.item ?? null;
    } catch {
      return null;
    }
  }, []);

  const errorCount = useRef(0);

  // ── Synchronize active X-Ray metadata cue at a given timestamp ──────────────
  const syncCueAtTime = useCallback(
    (timeSec: number, cueList: XRayMetadataCue[] = cuesRef.current) => {
      if (!cueList || cueList.length === 0) return;
      const matched =
        cueList.find((c) => timeSec >= c.startTime && timeSec < c.endTime) ??
        cueList[cueList.length - 1] ??
        null;
      if (matched && matched.id !== activeCueIdRef.current) {
        activeCueIdRef.current = matched.id;
        setActiveCue(matched);
        onCueChange?.(matched, cueList);
      }
    },
    [onCueChange]
  );

  // ── Align playback position to authoritative room clock (<50ms drift target) ──
  const alignElementToRoomClock = useCallback(
    (el: HTMLVideoElement, forceHardSeek = false) => {
      if (!forceHardSeek && forensicHoldRef.current) return;
      if (!getSyncedOffsetSec) return;
      const dur = el.duration;
      if (!dur || Number.isNaN(dur) || !Number.isFinite(dur) || dur <= 0.5) return;

      const rawTarget = getSyncedOffsetSec();
      // Wrap cleanly modulo duration if room default slot (75s) exceeds a shorter clip
      const effectiveTarget =
        rawTarget < dur - 0.2 ? rawTarget : rawTarget % Math.max(0.5, dur - 0.2);

      const safeTarget = Math.max(0, Math.min(effectiveTarget, Math.max(0, dur - 0.15)));
      const drift = el.currentTime - safeTarget;
      const absDrift = Math.abs(drift);

      if (forceHardSeek || absDrift > 1.15) {
        if (absDrift > (forceHardSeek ? 0.06 : 0.85)) {
          try {
            el.currentTime = safeTarget;
          } catch {
            // Ignore seek before buffer ready
          }
        }
        if (el.playbackRate !== 1.0) el.playbackRate = 1.0;

        if (forceHardSeek) {
          const effectiveFps = fps || 30;
          setCurrentTimeSec(safeTarget);
          setFrameNumber(Math.max(0, Math.round(safeTarget * effectiveFps)));
          syncCueAtTime(safeTarget);
          setPlayerState((s) => ({
            ...s,
            progress: dur > 0 ? safeTarget / dur : s.progress,
            duration: dur,
          }));
        }
      } else if (absDrift > 0.05) {
        // Gentle ±3% pitch-safe rate nudge converges drift below <50ms smoothly
        const desiredRate = drift > 0 ? 0.97 : 1.03;
        if (Math.abs(el.playbackRate - desiredRate) > 0.005) {
          el.playbackRate = desiredRate;
        }
      } else if (el.playbackRate !== 1.0) {
        el.playbackRate = 1.0;
      }
    },
    [getSyncedOffsetSec, fps, syncCueAtTime]
  );

  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogTimerRef.current = setTimeout(() => {
      const el = activeEl();
      if (el && (el.readyState < 2 || el.currentTime === 0) && !el.paused) {
        console.warn("[useSeamlessPlayer] Watchdog timeout (>7s with no progress), auto-recovering...");
        if (isRoomControlled) {
          onRefreshSync?.();
        } else {
          void swapRef.current();
        }
      }
    }, 7000);
  }, [clearWatchdog, activeEl, isRoomControlled, onRefreshSync]);

  // ── Room-Controlled Sync Effect: Instant <16ms Pre-Buffer Swap or Direct Load ──
  useEffect(() => {
    if (!isRoomControlled) return;
    if (!syncedCurrent) return;

    let cancelled = false;
    errorCount.current = 0;

    // Tier-2 Official Embed Fallback (YouTube / Vimeo / Dailymotion iframe)
    if (isOfficialEmbedOnly(syncedCurrent)) {
      // Player state for the embed is derived (see exposedState) — just silence the <video> slots
      playerARef.current?.pause();
      playerBRef.current?.pause();
      return;
    }

    const streamUrl = syncedCurrent.manifestUrl ?? syncedCurrent.directMp4Url;
    if (!streamUrl) return;

    const currentActiveSlot = activeSlot.current;
    const inactiveSlot: "A" | "B" = currentActiveSlot === "A" ? "B" : "A";
    const curEl = slotEl(currentActiveSlot) as VideoWithMeta | null;
    const preEl = slotEl(inactiveSlot) as VideoWithMeta | null;
    const audioGraph = getDriveInAudioGraph();

    // If user intentionally paused or scrubbed (forensic hold) on an active clip,
    // do NOT yank their paused video away mid-inspection — silently pre-buffer the live clip
    // into the inactive slot so clicking "LIVE SYNC" swaps to it in <16ms!
    if (forensicHoldRef.current && curEl && curEl._itemId) {
      if (curEl._itemId !== syncedCurrent.id && preEl && preEl._itemId !== syncedCurrent.id) {
        void attachSource(preEl, streamUrl, syncedCurrent.id, true).then(() => {
          if (!cancelled && !preEl._hls) {
            preEl.preload = "auto";
            preEl.load();
          }
        });
      }
      return;
    }

    // Case 1: Already playing this exact clip in the active slot (e.g. metadata refresh or releasing forensic hold)
    if (curEl && curEl._itemId === syncedCurrent.id) {
      alignElementToRoomClock(curEl, false);
      if (curEl.paused && !forensicHoldRef.current) {
        curEl.play().catch(() => {});
      }
      setPlayerState((s) => ({
        ...s,
        status: "playing",
        current: syncedCurrent,
        next: syncedNext ?? s.next,
      }));
      return;
    }

    // Case 2: Pre-buffered in the inactive slot -> Execute <16ms Single-Frame Cut!
    if (preEl && preEl._itemId === syncedCurrent.id) {
      activeSlot.current = inactiveSlot;
      setOpacity(inactiveSlot === "A" ? { A: 1, B: 0 } : { A: 0, B: 1 });
      audioGraph.setActiveSlot(inactiveSlot);

      if (curEl) {
        curEl.pause();
        curEl.muted = true;
      }

      applyVolumeToActiveElement(preEl);
      alignElementToRoomClock(preEl, true);
      preEl.play().catch(() => {});

      setPlayerState((s) => ({
        ...s,
        status: "playing",
        current: syncedCurrent,
        next: syncedNext ?? null,
        progress: 0,
        duration: Number.isFinite(preEl.duration) ? preEl.duration : 0,
      }));
      return;
    }

    // Case 3: Initial join or un-prebuffered jump -> Load directly into active slot
    (async () => {
      const targetEl = slotEl(activeSlot.current);
      if (!targetEl || cancelled) return;

      setPlayerState((s) => ({
        ...s,
        status: s.current ? "playing" : "loading",
        current: syncedCurrent,
        next: syncedNext ?? null,
      }));

      armWatchdog();

      await attachSource(
        targetEl,
        streamUrl,
        syncedCurrent.id,
        mutedRef.current
      );
      if (cancelled) return;

      if (!mutedRef.current) {
        audioGraph.attachVideoSlots(playerARef.current, playerBRef.current);
      }
      audioGraph.setActiveSlot(activeSlot.current);
      applyVolumeToActiveElement(targetEl);

      const syncOnMetadata = () => {
        targetEl.removeEventListener("loadedmetadata", syncOnMetadata);
        if (cancelled) return;
        alignElementToRoomClock(targetEl, true);
        if (
          Number.isFinite(targetEl.duration) &&
          targetEl.duration >= 10 &&
          !reportedDurationIds.current.has(syncedCurrent.id)
        ) {
          reportedDurationIds.current.add(syncedCurrent.id);
          onReportDuration?.(syncedCurrent.id, targetEl.duration);
        }
      };

      if (targetEl.readyState >= 1) {
        syncOnMetadata();
      } else {
        targetEl.addEventListener("loadedmetadata", syncOnMetadata);
      }

      targetEl
        .play()
        .then(() => {
          if (!cancelled) {
            clearWatchdog();
            errorCount.current = 0;
            setPlayerState((s) => ({ ...s, status: "playing" }));
          }
        })
        .catch(() => {
          // Autoplay fallback: ensure muted and retry play
          targetEl.muted = true;
          mutedRef.current = true;
          setPlayerState((s) => ({ ...s, isMuted: true, status: "playing" }));
          targetEl.play().catch(() => {});
        });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoomControlled, syncedCurrent?.id, isForensicHold]);

  // Re-align immediately if clipStartTimestamp shifts (e.g. Crowd High-Beam +15s Encore Surge!)
  useEffect(() => {
    if (!isRoomControlled || !clipStartTimestamp || isEmbedFallback) return;
    const el = activeEl();
    if (el && el.readyState >= 1) {
      alignElementToRoomClock(el, false);
    }
  }, [isRoomControlled, clipStartTimestamp, isEmbedFallback, activeEl, alignElementToRoomClock]);

  // ── Pre-Buffer Next Synced Clip Silently in Inactive DOM Slot ──────────────
  useEffect(() => {
    if (!isRoomControlled || !syncedNext) return;
    if (isOfficialEmbedOnly(syncedNext)) return;

    const nextUrl = syncedNext.manifestUrl ?? syncedNext.directMp4Url;
    if (!nextUrl) return;

    const preEl = prebufferEl() as VideoWithMeta | null;
    if (!preEl) return;
    if (preEl._itemId === syncedNext.id) return; // Already pre-buffered!

    let cancelled = false;
    (async () => {
      await attachSource(preEl, nextUrl, syncedNext.id, true);
      if (cancelled) return;
      if (!preEl._hls) {
        preEl.preload = "auto";
        preEl.load();
      }
      setPlayerState((s) => ({ ...s, next: syncedNext }));
    })();

    return () => {
      cancelled = true;
    };
  }, [isRoomControlled, syncedNext, prebufferEl, playerState.current?.id]);

  // ── Standalone Autonomous Swap (used when not connected to room coordinator) ──
  const swap = useCallback(async () => {
    if (isRoomControlled) {
      if (onRefreshSync) await onRefreshSync();
      return;
    }

    if (swapping.current) {
      swapQueued.current = true;
      return;
    }
    swapping.current = true;
    swapQueued.current = false;
    errorCount.current = 0;

    const newSlot = activeSlot.current === "A" ? "B" : "A";
    const newEl = slotEl(newSlot) as VideoWithMeta | null;
    const oldEl = slotEl(activeSlot.current) as VideoWithMeta | null;
    const audioGraph = getDriveInAudioGraph();

    let incomingItem = playerState.next;

    // Ensure incoming candidate is actually valid and loaded into newEl
    if (!incomingItem || !newEl?._rawUrl) {
      incomingItem = await fetchNext();
      if (incomingItem && newEl) {
        const streamUrl = incomingItem.manifestUrl ?? incomingItem.directMp4Url;
        if (streamUrl) {
          await attachSource(newEl, streamUrl, incomingItem.id, mutedRef.current);
        }
      }
    }

    if (!incomingItem) {
      swapping.current = false;
      setTimeout(() => {
        void swapRef.current();
      }, 2000);
      return;
    }

    activeSlot.current = newSlot;
    setOpacity(newSlot === "A" ? { A: 1, B: 0 } : { A: 0, B: 1 });
    audioGraph.setActiveSlot(newSlot);

    if (newEl) {
      applyVolumeToActiveElement(newEl);
      newEl.play().catch(() => {
        newEl.muted = true;
        mutedRef.current = true;
        newEl.play().catch(() => {});
      });
      armWatchdog();
    }

    if (oldEl) {
      oldEl.pause();
      oldEl.muted = true;
    }

    setPlayerState((s) => ({
      ...s,
      status: "playing",
      current: incomingItem,
      next: null,
      progress: 0,
      duration: Number.isFinite(newEl?.duration) ? (newEl?.duration ?? 0) : 0,
    }));

    const nextItem = await fetchNext();
    if (nextItem) {
      const prebuf = prebufferEl();
      if (prebuf && (nextItem.manifestUrl || nextItem.directMp4Url)) {
        const url = nextItem.manifestUrl ?? nextItem.directMp4Url!;
        await attachSource(prebuf, url, nextItem.id, true);
        if (!(prebuf as VideoWithMeta)._hls) {
          prebuf.load();
        }
      }
      setPlayerState((s) => ({ ...s, next: nextItem }));
    }

    swapping.current = false;
    if (swapQueued.current) {
      swapQueued.current = false;
      void swapRef.current();
    }
  }, [
    isRoomControlled,
    onRefreshSync,
    playerState.next,
    fetchNext,
    prebufferEl,
    slotEl,
    applyVolumeToActiveElement,
    armWatchdog,
  ]);

  useEffect(() => {
    swapRef.current = swap;
  }, [swap]);

  const lastCueClipIdRef = useRef<string | null>(null);

  // ── Attach HTMLTrackElement (kind="metadata") & VTTCues when clip loads ─────
  useEffect(() => {
    const item = isEmbedFallback ? syncedCurrent : playerState.current;
    if (!item) {
      cuesRef.current = [];
      activeCueIdRef.current = null;
      lastCueClipIdRef.current = null;
      setCues([]);
      setActiveCue(null);
      return;
    }

    // Reset forensic hold only when the active displayed clip actually changes
    if (lastCueClipIdRef.current !== item.id) {
      lastCueClipIdRef.current = item.id;
      forensicHoldRef.current = false;
      setIsForensicHold(false);
    }

    const generated = generateXRayCuesForVideo(
      item,
      playerState.duration > 5 ? playerState.duration : item.durationSec
    );
    cuesRef.current = generated;
    setCues(generated);

    const el = activeEl();
    const initialTime = el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const firstMatch =
      generated.find((c) => initialTime >= c.startTime && initialTime < c.endTime) ??
      generated[0] ??
      null;
    activeCueIdRef.current = firstMatch?.id ?? null;
    setActiveCue(firstMatch);
    onCueChange?.(firstMatch, generated);

    // Populate native HTML5 TextTrack (kind="metadata") with VTTCue payloads
    if (!el || typeof window === "undefined" || !("VTTCue" in window)) return;

    let metaTrack: TextTrack | null = null;
    for (let i = 0; i < el.textTracks.length; i++) {
      if (el.textTracks[i].label === "leonida-xray") {
        metaTrack = el.textTracks[i];
        break;
      }
    }
    if (!metaTrack) {
      metaTrack = el.addTextTrack("metadata", "leonida-xray", "en");
    }
    metaTrack.mode = "hidden";

    // Clear previous cues on this track
    if (metaTrack.cues) {
      const existing = Array.from(metaTrack.cues);
      for (const oldCue of existing) {
        try {
          metaTrack.removeCue(oldCue);
        } catch {
          // ignore
        }
      }
    }

    for (const cueData of generated) {
      try {
        const vttCue = new VTTCue(
          cueData.startTime,
          cueData.endTime,
          JSON.stringify(cueData)
        );
        vttCue.id = cueData.id;
        metaTrack.addCue(vttCue);
      } catch {
        // ignore if VTTCue constructor rejects bounds
      }
    }

    const handleNativeCueChange = () => {
      if (!metaTrack?.activeCues || metaTrack.activeCues.length === 0) return;
      const activeVtt = metaTrack.activeCues[0] as VTTCue;
      if (!activeVtt?.text) return;
      try {
        const parsed = JSON.parse(activeVtt.text) as XRayMetadataCue;
        if (parsed.id !== activeCueIdRef.current) {
          activeCueIdRef.current = parsed.id;
          setActiveCue(parsed);
          onCueChange?.(parsed, cuesRef.current);
        }
      } catch {
        // fallback to time lookup
      }
    };

    metaTrack.addEventListener("cuechange", handleNativeCueChange);
    return () => {
      metaTrack?.removeEventListener("cuechange", handleNativeCueChange);
    };
  }, [
    isEmbedFallback,
    syncedCurrent?.id,
    playerState.current?.id,
    Math.round(playerState.duration || 0),
    activeEl,
    onCueChange,
  ]);

  // ── Frame-Accurate Telemetry via requestVideoFrameCallback ─────────────────
  useEffect(() => {
    const el = activeEl() as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (
            cb: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void
          ) => number;
          cancelVideoFrameCallback?: (handle: number) => void;
        })
      | null;
    if (!el || typeof el.requestVideoFrameCallback !== "function") return;

    let handle = 0;
    let lastMediaTime = -1;
    let lastPresentedFrames = -1;

    const onFrame = (_now: number, metadata: { mediaTime: number; presentedFrames: number }) => {
      if (lastMediaTime >= 0 && metadata.mediaTime > lastMediaTime) {
        const dt = metadata.mediaTime - lastMediaTime;
        const df = metadata.presentedFrames - lastPresentedFrames;
        if (dt > 0.005 && dt < 0.5 && df > 0 && df <= 15) {
          const rawFps = df / dt;
          const snappedFps = rawFps > 45 ? 60 : rawFps > 26 ? 30 : 24;
          setFps(snappedFps);
        }
      }
      lastMediaTime = metadata.mediaTime;
      lastPresentedFrames = metadata.presentedFrames;

      setCurrentTimeSec(metadata.mediaTime);
      setFrameNumber(Math.max(0, Math.round(metadata.mediaTime * fps)));
      syncCueAtTime(metadata.mediaTime);

      handle = el.requestVideoFrameCallback!(onFrame);
    };

    handle = el.requestVideoFrameCallback(onFrame);
    return () => {
      if (handle && typeof el.cancelVideoFrameCallback === "function") {
        el.cancelVideoFrameCallback(handle);
      }
    };
  }, [activeEl, playerState.current?.id, fps, syncCueAtTime]);

  // ── Time update -> progress bar + <50ms drift alignment + standalone handoff ──
  const handleTimeUpdate = useCallback(() => {
    const el = activeEl() as VideoWithMeta | null;
    if (!el || !el.duration || Number.isNaN(el.duration) || el.duration === Infinity) {
      return;
    }

    clearWatchdog();
    if (errorCount.current > 0) {
      errorCount.current = 0;
    }

    const progress = el.currentTime / el.duration;
    const remaining = el.duration - el.currentTime;

    setCurrentTimeSec(el.currentTime);
    setFrameNumber(Math.max(0, Math.round(el.currentTime * fps)));
    syncCueAtTime(el.currentTime);
    setPlayerState((s) => ({ ...s, progress, duration: el.duration }));

    if (
      el._itemId &&
      el.duration >= 10 &&
      !reportedDurationIds.current.has(el._itemId)
    ) {
      reportedDurationIds.current.add(el._itemId);
      onReportDuration?.(el._itemId, el.duration);
    }

    if (isRoomControlled) {
      alignElementToRoomClock(el, false);
    } else if (remaining <= HANDOFF_THRESHOLD_SEC && !swapping.current && !forensicHoldRef.current) {
      swap();
    }
  }, [activeEl, clearWatchdog, isRoomControlled, alignElementToRoomClock, onReportDuration, swap, fps, syncCueAtTime]);

  // ── Resilient Slot Handlers (Proxy -> Next Proxy -> Direct Raw Fallback) ──
  const makeSlotHandlers = useCallback(
    (slot: "A" | "B") => ({
      onPlaying: () => {
        if (activeSlot.current === slot) {
          clearWatchdog();
          errorCount.current = 0;
          setPlayerState((s) => (s.status !== "playing" ? { ...s, status: "playing" } : s));
        }
      },
      onCanPlay: () => {
        // Canplay fired; watchdog remains armed until playback actually progresses
      },
      onEnded: () => {
        clearWatchdog();
        if (activeSlot.current !== slot) return;
        if (forensicHoldRef.current) {
          setPlayerState((s) => ({ ...s, status: "paused", progress: 1 }));
          return;
        }
        const el = slotEl(slot);
        if (isRoomControlled && el) {
          // If clip finishes slightly before room alarm/clock boundary, loop seamlessly at synced offset
          alignElementToRoomClock(el, true);
          el.play().catch(() => {});
          onRefreshSync?.();
          return;
        }
        if (!swapping.current) swap();
      },
      onError: () => {
        clearWatchdog();
        const el = slotEl(slot) as VideoWithMeta | null;
        if (!el) return;

        // Tiered self-healing: try the next playback strategy before declaring an error
        const rawUrl = el._rawUrl;
        const itemId = el._itemId || "unknown";
        if (rawUrl) {
          const routed = getDriveInAudioGraph().isElementRouted(el);
          const order = getStrategyOrder(!routed);
          const nextIdx = (el._strategyIdx ?? 0) + 1;
          if (nextIdx < order.length) {
            const isActive = activeSlot.current === slot;
            attachSource(el, rawUrl, itemId, isActive ? mutedRef.current : true, nextIdx).then(() => {
              if (isActive) {
                alignElementToRoomClock(el, true);
                el.play().catch(() => {});
                armWatchdog();
              } else {
                el.load();
              }
            });
            return;
          }
        }

        if (activeSlot.current !== slot) return; // Ignore unrecoverable prebuffer error

        errorCount.current++;
        console.warn(`[useSeamlessPlayer] Stream error on active slot (attempt ${errorCount.current})`);

        if (errorCount.current > 3) {
          setPlayerState((s) => ({ ...s, status: "error" }));
          // Resilient auto-recovery: never remain permanently locked in "SIGNAL LOST"
          setTimeout(() => {
            errorCount.current = 0;
            if (isRoomControlled) {
              onRefreshSync?.();
            } else {
              void swap();
            }
          }, 2500);
          return;
        }

        setTimeout(() => {
          if (isRoomControlled) {
            onRefreshSync?.();
          } else if (!swapping.current) {
            void swap();
          }
        }, 800);
      },
    }),
    [isRoomControlled, slotEl, alignElementToRoomClock, onRefreshSync, swap, clearWatchdog, armWatchdog]
  );

  const slotAHandlers = makeSlotHandlers("A");
  const slotBHandlers = makeSlotHandlers("B");

  // ── Standalone Prime (skipped automatically when room-controlled) ──────────
  const prime = useCallback(async () => {
    if (isRoomControlled) return;

    setPlayerState((s) => ({ ...s, status: "loading" }));

    const first = await fetchNext();
    if (!first) {
      console.warn("[useSeamlessPlayer] Prime fetch failed, retrying in 2s...");
      setTimeout(() => {
        void prime();
      }, 2000);
      return;
    }

    const slotA = playerARef.current;
    if (slotA && (first.manifestUrl || first.directMp4Url)) {
      const url = first.manifestUrl ?? first.directMp4Url!;
      await attachSource(slotA, url, first.id, true);
      slotA.play().catch(() => {
        slotA.muted = true;
        slotA.play().catch(() => {});
      });
      armWatchdog();
    }

    setPlayerState((s) => ({ ...s, status: "playing", current: first }));
    errorCount.current = 0;

    const second = await fetchNext();
    if (second && (second.manifestUrl || second.directMp4Url)) {
      const slotB = playerBRef.current;
      if (slotB) {
        const url = second.manifestUrl ?? second.directMp4Url!;
        await attachSource(slotB, url, second.id, true);
        if (!(slotB as VideoWithMeta)._hls) slotB.load();
      }
    }
    if (second) setPlayerState((s) => ({ ...s, next: second }));
  }, [isRoomControlled, fetchNext, armWatchdog]);

  useEffect(() => {
    const slotA = playerARef.current;
    const slotB = playerBRef.current;
    return () => {
      clearWatchdog();
      if (syncFlashTimerRef.current) clearTimeout(syncFlashTimerRef.current);
      destroyHls(slotA);
      destroyHls(slotB);
    };
  }, [clearWatchdog]);

  // ── Audio & Playback Controls ──────────────────────────────────────────────
  const unmute = useCallback(() => {
    const audioGraph = getDriveInAudioGraph();
    audioGraph.unlock(playerARef.current, playerBRef.current);
    audioGraph.setActiveSlot(activeSlot.current);

    if (!mutedRef.current) return;
    mutedRef.current = false;

    const el = activeEl();
    applyVolumeToActiveElement(el);
    if (el && el.paused && !forensicHoldRef.current) {
      el.play().catch(() => {});
    }

    setPlayerState((s) => ({ ...s, isMuted: false }));
  }, [activeEl, applyVolumeToActiveElement]);

  const toggleMute = useCallback(() => {
    const newMuted = !mutedRef.current;
    mutedRef.current = newMuted;

    const audioGraph = getDriveInAudioGraph();
    if (!newMuted) {
      audioGraph.unlock(playerARef.current, playerBRef.current);
      audioGraph.setActiveSlot(activeSlot.current);
    }

    const el = activeEl();
    applyVolumeToActiveElement(el);
    setPlayerState((s) => ({ ...s, isMuted: newMuted }));
  }, [activeEl, applyVolumeToActiveElement]);

  const setVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      volumeRef.current = clamped;
      mutedRef.current = clamped === 0;

      const audioGraph = getDriveInAudioGraph();
      if (clamped > 0) {
        audioGraph.unlock(playerARef.current, playerBRef.current);
        audioGraph.setActiveSlot(activeSlot.current);
      }

      const el = activeEl();
      applyVolumeToActiveElement(el);
      setPlayerState((s) => ({ ...s, volume: clamped, isMuted: clamped === 0 }));
    },
    [activeEl, applyVolumeToActiveElement]
  );

  const skipToNext = useCallback(() => {
    forensicHoldRef.current = false;
    setIsForensicHold(false);
    if (!swapping.current) swap();
  }, [swap]);

  const togglePlay = useCallback(() => {
    const el = activeEl();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlayerState((s) => ({ ...s, status: "playing" }));
    } else {
      forensicHoldRef.current = true;
      setIsForensicHold(true);
      el.pause();
      setPlayerState((s) => ({ ...s, status: "paused" }));
    }
  }, [activeEl]);

  // ── Stage 1: Frame-Accurate Forensic Stepping (-1f / +1f) ─────────────────
  const stepFrames = useCallback(
    (deltaFrames: number) => {
      const el = activeEl();
      const effectiveFps = fps || 30;
      const dt = deltaFrames / effectiveFps;

      forensicHoldRef.current = true;
      setIsForensicHold(true);

      if (el && !isEmbedFallback) {
        if (!el.paused) {
          el.pause();
        }
        const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 75;
        const nextTime = Math.max(0, Math.min(dur - 0.01, el.currentTime + dt));
        try {
          el.currentTime = nextTime;
        } catch {
          // ignore if media not seekable
        }
        setCurrentTimeSec(nextTime);
        setFrameNumber(Math.max(0, Math.round(nextTime * effectiveFps)));
        syncCueAtTime(nextTime);
        setPlayerState((s) => ({
          ...s,
          status: "paused",
          progress: dur > 0 ? nextTime / dur : s.progress,
        }));
        return;
      }

      // Fallback when inspecting an official embed or before metadata
      setCurrentTimeSec((prev) => {
        const dur = playerState.duration > 0 ? playerState.duration : 75;
        const nextTime = Math.max(0, Math.min(dur, prev + dt));
        setFrameNumber(Math.max(0, Math.round(nextTime * effectiveFps)));
        syncCueAtTime(nextTime);
        return nextTime;
      });
    },
    [activeEl, fps, isEmbedFallback, playerState.duration, syncCueAtTime]
  );

  // ── Stage 2: Bi-Directional Inbound Seek (Map Pin / Cue / Article -> Video) ──
  const seekToSeconds = useCallback(
    (targetSec: number, pauseOnArrival = false) => {
      const el = activeEl();
      const effectiveFps = fps || 30;
      forensicHoldRef.current = true;
      setIsForensicHold(true);

      if (el && !isEmbedFallback) {
        const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 75;
        const clamped = Math.max(0, Math.min(dur - 0.1, targetSec));
        try {
          el.currentTime = clamped;
        } catch {
          // ignore
        }
        if (pauseOnArrival) {
          el.pause();
          setPlayerState((s) => ({
            ...s,
            status: "paused",
            progress: dur > 0 ? clamped / dur : s.progress,
          }));
        } else {
          el.play().catch(() => {});
          setPlayerState((s) => ({
            ...s,
            status: "playing",
            progress: dur > 0 ? clamped / dur : s.progress,
          }));
        }
        setCurrentTimeSec(clamped);
        setFrameNumber(Math.max(0, Math.round(clamped * effectiveFps)));
        syncCueAtTime(clamped);
        return;
      }

      // Embed / simulated clock fallback
      const dur = playerState.duration > 0 ? playerState.duration : 75;
      const clamped = Math.max(0, Math.min(dur, targetSec));
      setCurrentTimeSec(clamped);
      setFrameNumber(Math.max(0, Math.round(clamped * effectiveFps)));
      syncCueAtTime(clamped);
    },
    [activeEl, fps, isEmbedFallback, playerState.duration, syncCueAtTime]
  );

  // ── Re-lock to authoritative communal room clock after pause / forensic inspection ──
  const resumeRoomSync = useCallback(() => {
    forensicHoldRef.current = false;
    setIsForensicHold(false);
    setResyncNonce((n) => n + 1);

    setIsSyncingLive(true);
    if (syncFlashTimerRef.current) clearTimeout(syncFlashTimerRef.current);
    syncFlashTimerRef.current = setTimeout(() => setIsSyncingLive(false), 750);

    const el = activeEl() as VideoWithMeta | null;

    if (el && !isEmbedFallback) {
      const sameLiveClip =
        !isRoomControlled || !syncedCurrent || el._itemId === syncedCurrent.id;

      if (sameLiveClip) {
        if (isRoomControlled) {
          alignElementToRoomClock(el, true);
        }
        el.play().catch(() => {});
        setPlayerState((s) => ({ ...s, status: "playing" }));
      }
      // Note: if syncedCurrent.id already advanced while paused, flipping isForensicHold=false
      // triggers the Room-Controlled Sync Effect on this render for an instant <16ms prebuffer swap!
    }

    // Re-verify authoritative server clock & active clip in parallel (handles boundary rollovers seamlessly)
    if (isRoomControlled && onRefreshSync) {
      void onRefreshSync().then(() => {
        if (forensicHoldRef.current) return;
        const latestEl = activeEl() as VideoWithMeta | null;
        if (latestEl && !isEmbedFallback) {
          if (!syncedCurrent || latestEl._itemId === syncedCurrent.id) {
            alignElementToRoomClock(latestEl, true);
            if (latestEl.paused) {
              latestEl.play().catch(() => {});
            }
            setPlayerState((s) => ({ ...s, status: "playing" }));
          }
        }
      });
    }
  }, [
    activeEl,
    isEmbedFallback,
    isRoomControlled,
    syncedCurrent,
    alignElementToRoomClock,
    onRefreshSync,
  ]);

  // Allow any newspaper button (Header Ribbon, X-Ray Deck, Mini-Deck) to trigger instant Live Sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLiveResync = () => resumeRoomSync();
    window.addEventListener("lv:resume-live-sync", onLiveResync);
    return () => window.removeEventListener("lv:resume-live-sync", onLiveResync);
  }, [resumeRoomSync]);

  // ── Global Bi-Directional Event Bus Listener (lv:seek-video) ───────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSeekEvent = (e: Event) => {
      const detail = (e as CustomEvent<VideoSeekCommandDetail>).detail;
      if (!detail) return;
      if (detail.regionId && cuesRef.current.length > 0) {
        const regionCue = cuesRef.current.find(
          (c) => c.location.regionId === detail.regionId
        );
        if (regionCue) {
          seekToSeconds(regionCue.startTime + 0.5, Boolean(detail.autoPauseForensic));
          return;
        }
        const pin = LEONIDA_REGION_PINS.find((p) => p.id === detail.regionId);
        if (pin) {
          seekToSeconds(pin.defaultSeekSec, Boolean(detail.autoPauseForensic));
          return;
        }
      }
      if (typeof detail.timestampSec === "number") {
        seekToSeconds(detail.timestampSec, Boolean(detail.autoPauseForensic));
      }
    };
    window.addEventListener("lv:seek-video", onSeekEvent);
    return () => window.removeEventListener("lv:seek-video", onSeekEvent);
  }, [seekToSeconds]);

  // Honor inbound ?seek= and ?region= query parameters when jumping from an article
  const appliedQuerySeekRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || appliedQuerySeekRef.current) return;
    if (!playerState.current && !syncedCurrent) return;
    const params = new URLSearchParams(window.location.search);
    const seekParam = params.get("seek");
    const regionParam = params.get("region");
    if (!seekParam && !regionParam) return;

    appliedQuerySeekRef.current = true;
    const sec = seekParam ? Number(seekParam) : NaN;
    const timer = setTimeout(() => {
      if (regionParam && cuesRef.current.length > 0) {
        const cue = cuesRef.current.find((c) => c.location.regionId === regionParam);
        if (cue) {
          seekToSeconds(cue.startTime + 0.3, false);
          return;
        }
      }
      if (Number.isFinite(sec) && sec >= 0) {
        seekToSeconds(sec, false);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [playerState.current?.id, syncedCurrent?.id, seekToSeconds]);

  const exposedState: PlayerState = isEmbedFallback && syncedCurrent
    ? { ...playerState, status: "playing", current: syncedCurrent, next: syncedNext ?? null, progress: 0 }
    : playerState;

  return {
    playerARef,
    playerBRef,
    opacity,
    playerState: exposedState,
    isEmbedFallback,
    prime,
    unmute,
    handleTimeUpdate,
    slotAHandlers,
    slotBHandlers,
    toggleMute,
    setVolume,
    skipToNext,
    togglePlay,
    // Layer 3 Forensic & Bi-Directional Telemetry Exports
    currentTimeSec,
    frameNumber,
    fps,
    isForensicHold,
    isSyncingLive,
    resyncNonce,
    cues,
    activeCue,
    stepFrames,
    seekToSeconds,
    resumeRoomSync,
    getActiveVideoElement: activeEl,
  };
}
