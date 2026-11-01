"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { VideoItem, PlayerState } from "@/lib/video/types";
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
 * Resolves a media URL through the zero-buffer CORS byte-range streamer so
 * Web Audio DSP (loudness compressor, 20-120Hz sub-bass analyser, Cabin FM)
 * and 32x18 ambient canvas sampling never hit cross-origin tainting.
 */
export function resolveCorsMediaUrl(
  rawUrl: string,
  preferNextProxy = false
): { url: string; useAnonymousCors: boolean } {
  if (!rawUrl) return { url: "", useAnonymousCors: false };

  // Same-origin relative URLs already satisfy CORS
  if (rawUrl.startsWith("/")) {
    return { url: rawUrl, useAnonymousCors: true };
  }

  // HLS manifests use XHR/Fetch via hls.js (PeerTube & Mux send native CORS headers)
  if (isHlsUrl(rawUrl)) {
    return { url: rawUrl, useAnonymousCors: true };
  }

  if (canProxyUrl(rawUrl)) {
    const partyHost = (process.env.NEXT_PUBLIC_PARTYSERVER_HOST || "")
      .trim()
      .replace(/^(http|https|ws|wss):\/\//, "")
      .replace(/\/$/, "");

    if (partyHost && !preferNextProxy) {
      const proto =
        partyHost.startsWith("localhost:") || partyHost.startsWith("127.0.0.1:")
          ? "http"
          : "https";
      return {
        url: `${proto}://${partyHost}/proxy-media?url=${encodeURIComponent(rawUrl)}`,
        useAnonymousCors: true,
      };
    }

    return {
      url: `/api/video/stream?url=${encodeURIComponent(rawUrl)}`,
      useAnonymousCors: true,
    };
  }

  return { url: rawUrl, useAnonymousCors: false };
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
  _triedNextProxyFallback?: boolean;
  _triedDirectFallback?: boolean;
};

async function attachSource(
  video: HTMLVideoElement,
  rawUrl: string,
  itemId: string,
  muted: boolean,
  options?: { preferNextProxy?: boolean; forceDirectNoCors?: boolean }
): Promise<HlsInstance | null> {
  const v = video as VideoWithMeta;
  video.muted = muted;
  video.playbackRate = 1.0;

  if (v._hls) {
    v._hls.destroy();
    v._hls = undefined;
  }

  v._rawUrl = rawUrl;
  v._itemId = itemId;
  if (!options?.preferNextProxy && !options?.forceDirectNoCors) {
    v._triedNextProxyFallback = false;
    v._triedDirectFallback = false;
  }

  const audioGraph = getDriveInAudioGraph();
  const alreadyRoutedToWebAudio = audioGraph.isElementRouted(video);

  const resolved = options?.forceDirectNoCors
    ? { url: rawUrl, useAnonymousCors: alreadyRoutedToWebAudio }
    : resolveCorsMediaUrl(rawUrl, options?.preferNextProxy);

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
  } = options;

  const isRoomControlled = syncedCurrent !== undefined;

  const playerARef = useRef<HTMLVideoElement>(null);
  const playerBRef = useRef<HTMLVideoElement>(null);

  const activeSlot = useRef<"A" | "B">("A");
  const swapping = useRef(false);
  const swapQueued = useRef(false);

  const volumeRef = useRef(0.85);
  const mutedRef = useRef(true);
  const reportedDurationIds = useRef<Set<string>>(new Set());

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
  const [isEmbedFallback, setIsEmbedFallback] = useState(false);

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

  // ── Align playback position to authoritative room clock (<50ms drift target) ──
  const alignElementToRoomClock = useCallback(
    (el: HTMLVideoElement, forceHardSeek = false) => {
      if (!getSyncedOffsetSec) return;
      const dur = el.duration;
      if (!dur || Number.isNaN(dur) || !Number.isFinite(dur) || dur <= 1) return;

      const rawTarget = getSyncedOffsetSec();
      // Wrap cleanly modulo duration if room default slot (75s) exceeds a shorter clip
      const effectiveTarget =
        rawTarget < dur - 0.35 ? rawTarget : rawTarget % Math.max(1, dur - 0.25);

      const drift = el.currentTime - effectiveTarget;
      const absDrift = Math.abs(drift);

      if (forceHardSeek || absDrift > 1.2) {
        try {
          el.currentTime = Math.max(0, effectiveTarget);
        } catch {
          // Ignore seek before buffer ready
        }
        if (el.playbackRate !== 1.0) el.playbackRate = 1.0;
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
    [getSyncedOffsetSec]
  );

  // ── Room-Controlled Sync Effect: Instant <16ms Pre-Buffer Swap or Direct Load ──
  useEffect(() => {
    if (!isRoomControlled) return;
    if (!syncedCurrent) return;

    let cancelled = false;
    errorCount.current = 0;

    // Tier-2 Official Embed Fallback (YouTube / Vimeo / Dailymotion iframe)
    if (isOfficialEmbedOnly(syncedCurrent)) {
      setIsEmbedFallback(true);
      playerARef.current?.pause();
      playerBRef.current?.pause();
      setPlayerState((s) => ({
        ...s,
        status: "playing",
        current: syncedCurrent,
        next: syncedNext ?? null,
        progress: 0,
      }));
      return;
    }

    setIsEmbedFallback(false);
    const streamUrl = syncedCurrent.manifestUrl ?? syncedCurrent.directMp4Url;
    if (!streamUrl) return;

    const currentActiveSlot = activeSlot.current;
    const inactiveSlot: "A" | "B" = currentActiveSlot === "A" ? "B" : "A";
    const curEl = slotEl(currentActiveSlot) as VideoWithMeta | null;
    const preEl = slotEl(inactiveSlot) as VideoWithMeta | null;
    const audioGraph = getDriveInAudioGraph();

    // Case 1: Already playing this exact clip in the active slot (e.g. metadata refresh)
    if (curEl && curEl._itemId === syncedCurrent.id) {
      alignElementToRoomClock(curEl, false);
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
  }, [isRoomControlled, syncedCurrent?.id]);

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
    const newEl = slotEl(newSlot);
    const oldEl = slotEl(activeSlot.current);
    const audioGraph = getDriveInAudioGraph();

    activeSlot.current = newSlot;
    setOpacity(newSlot === "A" ? { A: 1, B: 0 } : { A: 0, B: 1 });
    audioGraph.setActiveSlot(newSlot);

    if (newEl) {
      applyVolumeToActiveElement(newEl);
      newEl.play().catch(() => {});
    }

    if (oldEl) {
      oldEl.pause();
      oldEl.muted = true;
    }

    setPlayerState((s) => ({
      ...s,
      status: "playing",
      current: s.next,
      next: null,
      progress: 0,
      duration: 0,
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
      swap();
    }
  }, [
    isRoomControlled,
    onRefreshSync,
    fetchNext,
    prebufferEl,
    slotEl,
    applyVolumeToActiveElement,
  ]);

  // ── Time update -> progress bar + <50ms drift alignment + standalone handoff ──
  const handleTimeUpdate = useCallback(() => {
    const el = activeEl() as VideoWithMeta | null;
    if (!el || !el.duration || Number.isNaN(el.duration) || el.duration === Infinity) {
      return;
    }

    const progress = el.currentTime / el.duration;
    const remaining = el.duration - el.currentTime;

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
    } else if (remaining <= HANDOFF_THRESHOLD_SEC && !swapping.current) {
      swap();
    }
  }, [activeEl, isRoomControlled, alignElementToRoomClock, onReportDuration, swap]);

  // ── Resilient Slot Handlers (Proxy -> Next Proxy -> Direct Raw Fallback) ──
  const makeSlotHandlers = useCallback(
    (slot: "A" | "B") => ({
      onEnded: () => {
        if (activeSlot.current !== slot) return;
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
        const el = slotEl(slot) as VideoWithMeta | null;
        if (!el) return;

        // Tiered self-healing stream recovery before declaring error
        const rawUrl = el._rawUrl;
        const itemId = el._itemId || "unknown";
        const partyHostConfigured = Boolean(
          (process.env.NEXT_PUBLIC_PARTYSERVER_HOST || "").trim()
        );

        if (rawUrl && partyHostConfigured && !el._triedNextProxyFallback) {
          el._triedNextProxyFallback = true;
          attachSource(el, rawUrl, itemId, slot !== activeSlot.current ? true : mutedRef.current, {
            preferNextProxy: true,
          }).then(() => {
            if (activeSlot.current === slot) el.play().catch(() => {});
            else el.load();
          });
          return;
        }

        if (rawUrl && !el._triedDirectFallback) {
          el._triedDirectFallback = true;
          attachSource(el, rawUrl, itemId, slot !== activeSlot.current ? true : mutedRef.current, {
            forceDirectNoCors: true,
          }).then(() => {
            if (activeSlot.current === slot) el.play().catch(() => {});
            else el.load();
          });
          return;
        }

        if (activeSlot.current !== slot) return; // Ignore unrecoverable prebuffer error

        errorCount.current++;
        if (errorCount.current > 3) {
          setPlayerState((s) => ({ ...s, status: "error" }));
          return;
        }
        setTimeout(() => {
          if (!swapping.current) swap();
        }, 1200);
      },
    }),
    [isRoomControlled, slotEl, alignElementToRoomClock, onRefreshSync, swap]
  );

  const slotAHandlers = makeSlotHandlers("A");
  const slotBHandlers = makeSlotHandlers("B");

  // ── Standalone Prime (skipped automatically when room-controlled) ──────────
  const prime = useCallback(async () => {
    if (isRoomControlled) return;

    setPlayerState((s) => ({ ...s, status: "loading" }));

    const first = await fetchNext();
    if (!first) {
      setPlayerState((s) => ({ ...s, status: "error" }));
      return;
    }

    const slotA = playerARef.current;
    if (slotA && (first.manifestUrl || first.directMp4Url)) {
      const url = first.manifestUrl ?? first.directMp4Url!;
      await attachSource(slotA, url, first.id, true);
      slotA.play().catch(() => {});
    }

    setPlayerState((s) => ({ ...s, status: "playing", current: first }));

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
  }, [isRoomControlled, fetchNext]);

  useEffect(() => {
    return () => {
      destroyHls(playerARef.current);
      destroyHls(playerBRef.current);
    };
  }, []);

  // ── Audio & Playback Controls (Unlocks Web Audio Graph on First Gesture) ───
  const unmute = useCallback(() => {
    if (!mutedRef.current) return;
    mutedRef.current = false;

    const audioGraph = getDriveInAudioGraph();
    audioGraph.unlock(playerARef.current, playerBRef.current);
    audioGraph.setActiveSlot(activeSlot.current);
    audioGraph.setMasterVolume(volumeRef.current, false);

    const el = activeEl();
    applyVolumeToActiveElement(el);
    if (el && el.paused) {
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
    audioGraph.setMasterVolume(volumeRef.current, newMuted);

    const el = activeEl();
    applyVolumeToActiveElement(el);
    setPlayerState((s) => ({ ...s, isMuted: newMuted }));
  }, [activeEl, applyVolumeToActiveElement]);

  const setVolume = useCallback(
    (vol: number) => {
      volumeRef.current = vol;
      mutedRef.current = vol === 0;

      const audioGraph = getDriveInAudioGraph();
      if (vol > 0) {
        audioGraph.unlock(playerARef.current, playerBRef.current);
        audioGraph.setActiveSlot(activeSlot.current);
      }
      audioGraph.setMasterVolume(vol, vol === 0);

      const el = activeEl();
      applyVolumeToActiveElement(el);
      setPlayerState((s) => ({ ...s, volume: vol, isMuted: vol === 0 }));
    },
    [activeEl, applyVolumeToActiveElement]
  );

  const skipToNext = useCallback(() => {
    if (!swapping.current) swap();
  }, [swap]);

  const togglePlay = useCallback(() => {
    const el = activeEl();
    if (!el) return;
    if (el.paused) {
      if (isRoomControlled) alignElementToRoomClock(el, true);
      el.play().catch(() => {});
      setPlayerState((s) => ({ ...s, status: "playing" }));
    } else {
      el.pause();
      setPlayerState((s) => ({ ...s, status: "paused" }));
    }
  }, [activeEl, isRoomControlled, alignElementToRoomClock]);

  return {
    playerARef,
    playerBRef,
    opacity,
    playerState,
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
  };
}
