"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { VideoItem, PlayerState } from "@/lib/video/types";

const HANDOFF_THRESHOLD_SEC = 3;   // begin swap this many seconds before end
const API_ENDPOINT = "/api/video/next";

// ─── Session ID ───────────────────────────────────────────────────────────────
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("lv_vid_session");
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("lv_vid_session", id);
  }
  return id;
}

// ─── HLS helper types ─────────────────────────────────────────────────────────
type HlsInstance = import("hls.js").default;
type VideoWithHls = HTMLVideoElement & { _hls?: HlsInstance };

// ─── Attach an HLS or MP4 source to a <video> element ────────────────────────
// Returns the HLS instance if created, so the caller can store it.
async function attachSource(
  video: HTMLVideoElement,
  url: string,
  muted: boolean
): Promise<HlsInstance | null> {
  // Always mute before touching src — prevents AbortError race
  video.muted = muted;

  // Tear down any existing HLS instance on this slot
  const v = video as VideoWithHls;
  if (v._hls) {
    v._hls.destroy();
    v._hls = undefined;
  }

  if (url.includes(".m3u8") || url.includes("m3u8")) {
    const { default: Hls } = await import("hls.js");

    if (Hls.isSupported()) {
      const hls = new Hls({
        autoStartLoad: true,
        startFragPrefetch: true,
        lowLatencyMode: false,
        enableWorker: true,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      v._hls = hls;
      return hls;
    }

    // Safari native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return null;
    }

    // Browser has no HLS support — nothing we can do
    return null;
  }

  // Progressive MP4
  video.src = url;
  return null;
}

// ─── Destroy HLS on a slot if present ────────────────────────────────────────
function destroyHls(video: HTMLVideoElement | null) {
  if (!video) return;
  const v = video as VideoWithHls;
  if (v._hls) {
    v._hls.destroy();
    v._hls = undefined;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSeamlessPlayer() {
  const playerARef = useRef<HTMLVideoElement>(null);
  const playerBRef = useRef<HTMLVideoElement>(null);

  const activeSlot  = useRef<"A" | "B">("A");
  const swapping    = useRef(false);
  const swapQueued  = useRef(false);   // guard: only one swap at a time

  // Volume/mute stored in refs so swap() never reads stale closure values
  const volumeRef   = useRef(0.85);
  const mutedRef    = useRef(true);    // start muted — browser policy

  const [playerState, setPlayerState] = useState<PlayerState>({
    status: "idle",
    current: null,
    next: null,
    isMuted: true,    // muted until user interacts
    volume: 0.85,
    progress: 0,
    duration: 0,
  });

  const [opacity, setOpacity] = useState({ A: 1, B: 0 });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const slotEl = useCallback((slot: "A" | "B"): HTMLVideoElement | null =>
    slot === "A" ? playerARef.current : playerBRef.current, []);

  const activeEl     = useCallback(() => slotEl(activeSlot.current), [slotEl]);
  const prebufferEl  = useCallback(() =>
    slotEl(activeSlot.current === "A" ? "B" : "A"), [slotEl]);

  // ── Fetch next item ──────────────────────────────────────────────────────────
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

  // ── Error retry counter — reset on successful swap ───────────────────────────
  const errorCount = useRef(0);

  // ── Seamless swap: cross-fade to prebuffer slot, fetch next+1 ────────────────
  const swap = useCallback(async () => {
    if (swapping.current) {
      swapQueued.current = true;
      return;
    }
    swapping.current = true;
    swapQueued.current = false;
    errorCount.current = 0;  // reset on deliberate swap

    const newSlot = activeSlot.current === "A" ? "B" : "A";
    const newEl   = slotEl(newSlot);
    const oldEl   = slotEl(activeSlot.current);

    // Cross-fade: flip z-index and opacity atomically
    activeSlot.current = newSlot;
    setOpacity(newSlot === "A" ? { A: 1, B: 0 } : { A: 0, B: 1 });

    // Bring new slot to life
    if (newEl) {
      newEl.muted  = mutedRef.current;
      newEl.volume = volumeRef.current;
      newEl.play().catch(() => {});
    }

    // Park old slot
    if (oldEl) {
      oldEl.pause();
      // Don't destroy HLS yet — let the next preload call handle it
    }

    // Advance state
    setPlayerState((s) => ({
      ...s,
      status: "playing",
      current: s.next,
      next: null,
      progress: 0,
      duration: 0,
    }));

    // Preload the next clip into the now-idle slot
    const nextItem = await fetchNext();
    if (nextItem) {
      const prebuf = prebufferEl();
      if (prebuf && (nextItem.manifestUrl || nextItem.directMp4Url)) {
        const url = nextItem.manifestUrl ?? nextItem.directMp4Url!;
        await attachSource(prebuf, url, true);   // always muted while preloading
        // For native video (non-HLS), call load() to start buffering
        if (!(prebuf as VideoWithHls)._hls) {
          prebuf.load();
        }
      }
      setPlayerState((s) => ({ ...s, next: nextItem }));
    }

    swapping.current = false;

    // If another swap was requested while we were busy, honour it now
    if (swapQueued.current) {
      swapQueued.current = false;
      swap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNext, prebufferEl, slotEl]);

  // ── Time update → trigger handoff ────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const el = activeEl();
    if (!el || !el.duration || isNaN(el.duration) || el.duration === Infinity) return;

    const progress  = el.currentTime / el.duration;
    const remaining = el.duration - el.currentTime;

    setPlayerState((s) => ({ ...s, progress, duration: el.duration }));

    if (remaining <= HANDOFF_THRESHOLD_SEC && !swapping.current) {
      swap();
    }
  }, [activeEl, swap]);

  // Only fire error/ended handlers when the slot is the active one
  const makeSlotHandlers = useCallback((slot: "A" | "B") => ({
    onEnded: () => {
      if (activeSlot.current !== slot) return;
      if (!swapping.current) swap();
    },
    onError: () => {
      if (activeSlot.current !== slot) return;  // prebuffer error — ignore
      errorCount.current++;
      if (errorCount.current > 3) {
        setPlayerState((s) => ({ ...s, status: "error" }));
        return;
      }
      setTimeout(() => { if (!swapping.current) swap(); }, 1500);
    },
  }), [swap]);

  const slotAHandlers = makeSlotHandlers("A");
  const slotBHandlers = makeSlotHandlers("B");

  // ── Prime: fetch first two clips and start playback ──────────────────────────
  const prime = useCallback(async () => {
    setPlayerState((s) => ({ ...s, status: "loading" }));

    const first = await fetchNext();
    if (!first) {
      setPlayerState((s) => ({ ...s, status: "error" }));
      return;
    }

    // Load first clip into slot A — always start muted (browser autoplay policy)
    const slotA = playerARef.current;
    if (slotA && (first.manifestUrl || first.directMp4Url)) {
      const url = first.manifestUrl ?? first.directMp4Url!;
      await attachSource(slotA, url, true /* muted */);
      slotA.play().catch(() => {});
    }

    setPlayerState((s) => ({ ...s, status: "playing", current: first }));

    // Preload second clip into slot B (silent)
    const second = await fetchNext();
    if (second && (second.manifestUrl || second.directMp4Url)) {
      const slotB = playerBRef.current;
      if (slotB) {
        const url = second.manifestUrl ?? second.directMp4Url!;
        await attachSource(slotB, url, true);
        if (!(slotB as VideoWithHls)._hls) slotB.load();
      }
    }
    if (second) setPlayerState((s) => ({ ...s, next: second }));
  }, [fetchNext]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      destroyHls(playerARef.current);
      destroyHls(playerBRef.current);
    };
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────────

  // First click anywhere on the player unmutes — call this from the wrapper div
  const unmute = useCallback(() => {
    if (!mutedRef.current) return;
    mutedRef.current = false;
    const el = activeEl();
    if (el) {
      el.muted  = false;
      el.volume = volumeRef.current;
    }
    setPlayerState((s) => ({ ...s, isMuted: false }));
  }, [activeEl]);

  const toggleMute = useCallback(() => {
    const el = activeEl();
    if (!el) return;
    const newMuted = !el.muted;
    el.muted = newMuted;
    mutedRef.current = newMuted;
    setPlayerState((s) => ({ ...s, isMuted: newMuted }));
  }, [activeEl]);

  const setVolume = useCallback((vol: number) => {
    volumeRef.current = vol;
    const el = activeEl();
    if (el) {
      el.volume = vol;
      el.muted  = vol === 0;
    }
    mutedRef.current = vol === 0;
    setPlayerState((s) => ({ ...s, volume: vol, isMuted: vol === 0 }));
  }, [activeEl]);

  const skipToNext = useCallback(() => {
    if (!swapping.current) swap();
  }, [swap]);

  const togglePlay = useCallback(() => {
    const el = activeEl();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlayerState((s) => ({ ...s, status: "playing" }));
    } else {
      el.pause();
      setPlayerState((s) => ({ ...s, status: "paused" }));
    }
  }, [activeEl]);

  return {
    playerARef,
    playerBRef,
    opacity,
    playerState,
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
