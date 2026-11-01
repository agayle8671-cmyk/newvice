"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";
import type { VideoItem } from "@/lib/video/types";
import type {
  ClientToServerMessage,
  ReactionTallies,
  RoomDeltaTuple,
  RoomVehiclePresence,
  ServerToClientMessage,
  SyncedChatMessage,
  VehicleType,
} from "./party-protocol";

export type RoomSyncMode = "connecting" | "partyserver" | "server-clock";

export interface UseDriveInRoomOptions {
  roomSlug: string;
  userId: string;
  username: string;
  vehicleType?: string;
  badgeColor?: string;
  licensePlate?: string;
  viceCred?: number;
  streakDays?: number;
  onChatMessage?: (message: SyncedChatMessage) => void;
  onHornTrigger?: (seatId: string, hornId: string, panX: number, zDepth: number) => void;
  onEncoreSurge?: (bonusSec: number, highBeams: number) => void;
  onClipTransition?: (
    reason: "scheduled" | "emp_skip" | "admin",
    current: VideoItem
  ) => void;
}

export interface DriveInRoomState {
  syncMode: RoomSyncMode;
  isSynced: boolean;
  current: VideoItem | null;
  next: VideoItem | null;
  clipStartTimestamp: number;
  vehicles: RoomVehiclePresence[];
  reactionTallies: ReactionTallies;
  recentChat: SyncedChatMessage[];
  /** Returns authoritative CurrentClipOffset = (ServerNow() - ClipStartTimestamp) / 1000 */
  getSyncedOffsetSec: () => number;
  /** Returns RTT-compensated ServerNow() in epoch milliseconds */
  getServerNow: () => number;
  sendFlash: (active: boolean) => void;
  sendHazard: (active: boolean) => void;
  sendHorn: (hornId?: string) => void;
  /** Sends chat over PartyServer WebSocket; returns false if PartyServer is inactive so Supabase Realtime handles it */
  sendSyncedChat: (id: string, content: string) => boolean;
  reportClipDuration: (videoId: string, durationSec: number) => void;
  refreshSync: () => Promise<void>;
}

const DEFAULT_TALLIES: ReactionTallies = {
  highBeams: 0,
  hazards: 0,
  occupiedCount: 0,
  encoreTriggered: false,
};

const DEFAULT_CLIP_DURATION_SEC = 75;

function normalizeVehicleType(raw?: string): VehicleType {
  const valid: VehicleType[] = [
    "muscle_car",
    "sports_car",
    "truck",
    "synth_coupe",
    "vice_pd",
    "lowrider",
    "default",
  ];
  if (raw && valid.includes(raw as VehicleType)) {
    return raw as VehicleType;
  }
  return "muscle_car";
}

export function useDriveInRoom({
  roomSlug,
  userId,
  username,
  vehicleType = "muscle_car",
  badgeColor = "#ff007f",
  licensePlate,
  viceCred = 0,
  streakDays = 1,
  onChatMessage,
  onHornTrigger,
  onEncoreSurge,
  onClipTransition,
}: UseDriveInRoomOptions): DriveInRoomState {
  const partyHost = (process.env.NEXT_PUBLIC_PARTYSERVER_HOST || "").trim();

  const [syncMode, setSyncMode] = useState<RoomSyncMode>("connecting");
  const [isSynced, setIsSynced] = useState(false);
  const [current, setCurrent] = useState<VideoItem | null>(null);
  const [next, setNext] = useState<VideoItem | null>(null);
  const [clipStartTimestamp, setClipStartTimestamp] = useState(0);
  const [vehicles, setVehicles] = useState<RoomVehiclePresence[]>([]);
  const [reactionTallies, setReactionTallies] =
    useState<ReactionTallies>(DEFAULT_TALLIES);
  const [recentChat, setRecentChat] = useState<SyncedChatMessage[]>([]);

  // High-precision mutable refs so video drift controller reads lock-free without re-renders
  const serverClockOffsetRef = useRef(0);
  const hasClockSampleRef = useRef(false);
  const clipStartRef = useRef(0);
  const currentRef = useRef<VideoItem | null>(null);
  const wsConnectedRef = useRef(false);
  const socketRef = useRef<PartySocket | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncFnRef = useRef<() => Promise<void>>(async () => {});
  const mountedRef = useRef(true);

  // Keep callback refs fresh without forcing WebSocket reconnects
  const callbacksRef = useRef({
    onChatMessage,
    onHornTrigger,
    onEncoreSurge,
    onClipTransition,
  });
  useEffect(() => {
    callbacksRef.current = {
      onChatMessage,
      onHornTrigger,
      onEncoreSurge,
      onClipTransition,
    };
  }, [onChatMessage, onHornTrigger, onEncoreSurge, onClipTransition]);

  const updateClockOffset = useCallback((sampleOffsetMs: number) => {
    if (!Number.isFinite(sampleOffsetMs)) return;
    if (!hasClockSampleRef.current) {
      serverClockOffsetRef.current = sampleOffsetMs;
      hasClockSampleRef.current = true;
    } else {
      // Smooth clock jitter with EMA (80% prior, 20% new sample)
      serverClockOffsetRef.current =
        serverClockOffsetRef.current * 0.8 + sampleOffsetMs * 0.2;
    }
  }, []);

  const getServerNow = useCallback((): number => {
    return Date.now() + serverClockOffsetRef.current;
  }, []);

  const getSyncedOffsetSec = useCallback((): number => {
    if (!clipStartRef.current) return 0;
    const elapsedMs = Date.now() + serverClockOffsetRef.current - clipStartRef.current;
    return Math.max(0, elapsedMs / 1000);
  }, []);

  // ── Deterministic Server-Clock Coordinator Fallback (/api/room/[slug]/sync) ──
  const fetchServerClockSync = useCallback(async () => {
    // Do not override active PartyServer WebSocket authority
    if (wsConnectedRef.current) return;

    const scheduleNext = (delayMs: number) => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => {
        void syncFnRef.current();
      }, delayMs);
    };

    try {
      const t0 = Date.now();
      const res = await fetch(
        `/api/room/${encodeURIComponent(roomSlug || "main-theater")}/sync`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const t1 = Date.now();
      const rtt = Math.max(0, t1 - t0);
      const data = await res.json();

      if (!mountedRef.current) return;
      if (wsConnectedRef.current) return; // WS connected while HTTP was in flight

      if (typeof data.serverNow === "number") {
        updateClockOffset(data.serverNow + rtt / 2 - t1);
      }

      if (data.current) {
        const prevId = currentRef.current?.id;
        currentRef.current = data.current;
        clipStartRef.current = data.clipStartTimestamp || t1;

        setCurrent(data.current);
        setNext(data.next ?? null);
        setClipStartTimestamp(clipStartRef.current);
        setSyncMode("server-clock");
        setIsSynced(true);

        if (prevId && prevId !== data.current.id) {
          callbacksRef.current.onClipTransition?.("scheduled", data.current);
        }

        // Schedule exact boundary transition for the deterministic cycle
        const durMs =
          Math.max(
            12,
            Math.min(data.current.durationSec || DEFAULT_CLIP_DURATION_SEC, 1800)
          ) * 1000;
        const offsetMs = Math.max(
          0,
          Date.now() + serverClockOffsetRef.current - clipStartRef.current
        );
        scheduleNext(Math.max(600, durMs - offsetMs + 120));
      } else {
        scheduleNext(5000);
      }
    } catch {
      // Transient network/API failure: retry shortly instead of waiting for the 45s poll
      if (mountedRef.current && !wsConnectedRef.current) scheduleNext(4000);
    }
  }, [roomSlug, updateClockOffset]);

  useEffect(() => {
    syncFnRef.current = fetchServerClockSync;
  }, [fetchServerClockSync]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Apply 100ms Differential Delta Tuples ──────────────────────────────────
  const applyDeltas = useCallback((deltas: RoomDeltaTuple[]) => {
    let tallyPatch: [number, number, number] | null = null;
    for (const delta of deltas) {
      if (delta[0] === "CAR_HORN") {
        const [, seatId, hornId, panX, zDepth] = delta;
        callbacksRef.current.onHornTrigger?.(seatId, hornId, panX, zDepth);
      } else if (delta[0] === "TALLY") {
        tallyPatch = [delta[1], delta[2], delta[3]];
      }
    }

    setVehicles((prev) => {
      let nextList = prev;
      let mutated = false;
      const ensureClone = () => {
        if (!mutated) {
          nextList = [...prev];
          mutated = true;
        }
      };

      for (const delta of deltas) {
        switch (delta[0]) {
          case "SEAT_JOIN": {
            const incoming = delta[1];
            ensureClone();
            const idx = nextList.findIndex(
              (v) => v.seatId === incoming.seatId || v.userId === incoming.userId
            );
            if (idx >= 0) {
              nextList[idx] = incoming;
            } else {
              nextList.push(incoming);
            }
            break;
          }
          case "SEAT_LEAVE": {
            const seatId = delta[1];
            const filtered = nextList.filter((v) => v.seatId !== seatId);
            if (filtered.length !== nextList.length) {
              nextList = filtered;
              mutated = true;
            }
            break;
          }
          case "CAR_FLASH": {
            const [, seatId, flag] = delta;
            const idx = nextList.findIndex((v) => v.seatId === seatId);
            if (idx >= 0) {
              ensureClone();
              nextList[idx] = { ...nextList[idx], highBeamsOn: flag === 1 };
            }
            break;
          }
          case "CAR_HAZARD": {
            const [, seatId, flag] = delta;
            const idx = nextList.findIndex((v) => v.seatId === seatId);
            if (idx >= 0) {
              ensureClone();
              nextList[idx] = { ...nextList[idx], hazardsOn: flag === 1 };
            }
            break;
          }
          default:
            break;
        }
      }

      return nextList;
    });

    if (tallyPatch) {
      const [highBeams, hazards, occupiedCount] = tallyPatch;
      setReactionTallies((prev) => ({
        ...prev,
        highBeams,
        hazards,
        occupiedCount,
      }));
    }
  }, []);

  // ── Primary Connection Lifecycle (PartyServer WS -> Server-Clock Fallback) ──
  useEffect(() => {
    let disposed = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let fallbackPollInterval: ReturnType<typeof setInterval> | null = null;
    let wsFallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    if (!partyHost) {
      // PartyServer host not configured yet — immediately activate deterministic server-clock sync
      void syncFnRef.current();
      fallbackPollInterval = setInterval(() => {
        void syncFnRef.current();
      }, 45_000);

      return () => {
        disposed = true;
        if (fallbackPollInterval) clearInterval(fallbackPollInterval);
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      };
    }

    // Connect to Cloudflare Durable Object via PartySocket
    const ws = new PartySocket({
      host: partyHost,
      party: "drive-in-room",
      room: roomSlug || "main-theater",
    });
    socketRef.current = ws;

    // If Edge WS takes >3.5s on cold network, warm up with deterministic server-clock in the meantime
    wsFallbackTimeout = setTimeout(() => {
      if (!disposed && !wsConnectedRef.current) {
        void syncFnRef.current();
      }
    }, 3500);

    const sendPacket = (pkt: ClientToServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(pkt));
      }
    };

    ws.addEventListener("open", () => {
      if (disposed) return;
      wsConnectedRef.current = true;
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      setSyncMode("partyserver");

      sendPacket({
        type: "PING",
        clientSentAt: Date.now(),
      });

      sendPacket({
        type: "IDENTIFY",
        userId,
        username,
        vehicleType: normalizeVehicleType(vehicleType),
        badgeColor,
        licensePlate,
        viceCred,
        streakDays,
      });

      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        sendPacket({ type: "PING", clientSentAt: Date.now() });
      }, 10_000);
    });

    ws.addEventListener("message", (event) => {
      if (disposed || typeof event.data !== "string") return;
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(event.data) as ServerToClientMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "PONG": {
          const now = Date.now();
          const rtt = Math.max(0, now - msg.clientSentAt);
          updateClockOffset(msg.serverNow + rtt / 2 - now);
          break;
        }

        case "ROOM_SNAPSHOT": {
          updateClockOffset(msg.serverNow - Date.now());
          currentRef.current = msg.current;
          clipStartRef.current = msg.clipStartTimestamp;
          setCurrent(msg.current);
          setNext(msg.next);
          setClipStartTimestamp(msg.clipStartTimestamp);
          setVehicles(msg.vehicles || []);
          setReactionTallies(msg.reactionTallies || DEFAULT_TALLIES);
          setRecentChat(msg.recentChat || []);
          setSyncMode("partyserver");
          setIsSynced(true);
          break;
        }

        case "ROOM_DELTA": {
          applyDeltas(msg.deltas);
          break;
        }

        case "CLIP_TRANSITION": {
          updateClockOffset(msg.serverNow - Date.now());
          currentRef.current = msg.current;
          clipStartRef.current = msg.clipStartTimestamp;
          setCurrent(msg.current);
          setNext(msg.next);
          setClipStartTimestamp(msg.clipStartTimestamp);
          setReactionTallies((prev) => ({
            ...prev,
            highBeams: 0,
            hazards: 0,
            encoreTriggered: false,
          }));
          setVehicles((prev) =>
            prev.map((v) =>
              v.highBeamsOn || v.hazardsOn
                ? { ...v, highBeamsOn: false, hazardsOn: false }
                : v
            )
          );
          callbacksRef.current.onClipTransition?.(msg.reason, msg.current);
          break;
        }

        case "ENCORE_SURGE": {
          clipStartRef.current = msg.clipStartTimestamp;
          setClipStartTimestamp(msg.clipStartTimestamp);
          setReactionTallies((prev) => ({
            ...prev,
            highBeams: msg.highBeams,
            encoreTriggered: true,
          }));
          callbacksRef.current.onEncoreSurge?.(msg.bonusSec, msg.highBeams);
          break;
        }

        case "CHAT_MESSAGE": {
          setRecentChat((prev) => [...prev.slice(-99), msg.message]);
          callbacksRef.current.onChatMessage?.(msg.message);
          break;
        }
      }
    });

    ws.addEventListener("close", () => {
      if (disposed) return;
      wsConnectedRef.current = false;
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      // Fall back seamlessly to server-clock while PartySocket auto-reconnects
      void syncFnRef.current();
    });

    return () => {
      disposed = true;
      wsConnectedRef.current = false;
      socketRef.current = null;
      if (wsFallbackTimeout) clearTimeout(wsFallbackTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (fallbackPollInterval) clearInterval(fallbackPollInterval);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyHost, roomSlug, updateClockOffset, applyDeltas]);

  // Re-send IDENTIFY dynamically whenever auth profile or vehicle cosmetics change
  useEffect(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pkt: ClientToServerMessage = {
      type: "IDENTIFY",
      userId,
      username,
      vehicleType: normalizeVehicleType(vehicleType),
      badgeColor,
      licensePlate,
      viceCred,
      streakDays,
    };
    ws.send(JSON.stringify(pkt));
  }, [userId, username, vehicleType, badgeColor, licensePlate, viceCred, streakDays]);

  // ── Outbound Interactive Controls ──────────────────────────────────────────
  const sendFlash = useCallback((active: boolean) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pkt: ClientToServerMessage = { type: "CAR_FLASH", active };
      ws.send(JSON.stringify(pkt));
      return;
    }

    // Server-clock fallback: update local tally & trigger +15s Encore boost once per clip
    setReactionTallies((prev) => {
      const nextBeams = active ? Math.max(1, prev.highBeams + 1) : Math.max(0, prev.highBeams - 1);
      if (active && !prev.encoreTriggered) {
        const now = Date.now();
        clipStartRef.current = Math.min(now, clipStartRef.current + 15_000);
        setClipStartTimestamp(clipStartRef.current);
        callbacksRef.current.onEncoreSurge?.(15, nextBeams);
        return {
          ...prev,
          highBeams: nextBeams,
          encoreTriggered: true,
        };
      }
      return {
        ...prev,
        highBeams: nextBeams,
      };
    });
  }, []);

  const sendHazard = useCallback((active: boolean) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pkt: ClientToServerMessage = { type: "CAR_HAZARD", active };
      ws.send(JSON.stringify(pkt));
      return;
    }

    // Server-clock fallback: when Hazard skip is voted, cut to pre-buffered next clip
    if (active) {
      setNext((queuedNext) => {
        if (queuedNext) {
          const now = Date.now();
          currentRef.current = queuedNext;
          clipStartRef.current = now;
          setCurrent(queuedNext);
          setClipStartTimestamp(now);
          setReactionTallies({
            highBeams: 0,
            hazards: 0,
            occupiedCount: 1,
            encoreTriggered: false,
          });
          callbacksRef.current.onClipTransition?.("emp_skip", queuedNext);
        }
        return null;
      });
    }
  }, []);

  const sendHorn = useCallback((hornId = "synth_horn") => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pkt: ClientToServerMessage = { type: "CAR_HORN", hornId };
      ws.send(JSON.stringify(pkt));
    }
  }, []);

  const sendSyncedChat = useCallback((id: string, content: string): boolean => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pkt: ClientToServerMessage = { type: "CHAT_SEND", id, content };
      ws.send(JSON.stringify(pkt));
      return true;
    }
    return false;
  }, []);

  const reportClipDuration = useCallback((videoId: string, durationSec: number) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pkt: ClientToServerMessage = {
        type: "CLIP_DURATION_REPORT",
        videoId,
        durationSec,
      };
      ws.send(JSON.stringify(pkt));
    }
  }, []);

  return {
    syncMode,
    isSynced,
    current,
    next,
    clipStartTimestamp,
    vehicles,
    reactionTallies,
    recentChat,
    getSyncedOffsetSec,
    getServerNow,
    sendFlash,
    sendHazard,
    sendHorn,
    sendSyncedChat,
    reportClipDuration,
    refreshSync: fetchServerClockSync,
  };
}
