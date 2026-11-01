import {
  Server,
  routePartykitRequest,
  type Connection,
  type WSMessage,
} from "partyserver";
import type { VideoItem } from "../../lib/video/types";
import {
  DEFAULT_CLIP_DURATION_SEC,
  filterCatalogRows,
  rowToVideoItem,
  type CatalogRow,
} from "../../lib/video/catalog";
import { fetchAllowedMedia, parseAllowedMediaUrl } from "../../lib/video/media-hosts";
import type {
  ClientToServerMessage,
  LotRow,
  ReactionTallies,
  RoomDeltaTuple,
  RoomVehiclePresence,
  ServerToClientMessage,
  SyncedChatMessage,
  VehicleType,
} from "../../lib/realtime/party-protocol";

export interface Env {
  DriveInRoom: DurableObjectNamespace<DriveInRoomServer>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  GTA6_LAUNCH_DATE?: string;
  GTA6_LAUNCH_MODE?: string;
}

interface PersistedRoomState {
  playlist: VideoItem[];
  currentIndex: number;
  clipStartTimestamp: number;
  encoreTriggered: boolean;
  lastCatalogFetchMs: number;
  lastFlushMs: number;
  recentChat: SyncedChatMessage[];
}

const CATALOG_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Refresh catalog from Supabase every 5 min
const SUPABASE_ALARM_FLUSH_MS = 30 * 1000;         // Batch DB writes every 30s (99% write reduction)
const DELTA_BATCH_INTERVAL_MS = 100;               // Aggregate crowd deltas over 100ms intervals
const CHAT_MIN_INTERVAL_MS = 700;                  // Per-connection chat flood control
const REACTION_MIN_INTERVAL_MS = 120;              // Per-connection flash/hazard flood control
const HORN_MIN_INTERVAL_MS = 1500;                 // Horns are loud — rate-limit harder

// Parking grid topology (Row A = Front Row Streak/Scouts, Row B = Crew Lot, Row C = General Admission)
const ROW_CAPACITIES: Record<LotRow, number> = { A: 6, B: 8, C: 10 };
const ROW_DEPTH: Record<LotRow, number> = { A: 0.22, B: 0.52, C: 0.82 };

const FALLBACK_PLAYLIST: VideoItem[] = [
  {
    id: "fallback-mux-001",
    source: "direct",
    manifestUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    title: "GTA VI — Leonida Vice Broadcast Feed",
    creatorName: "LeonidaVice",
    creatorUrl: "https://leonidavice.com",
    platform: "direct",
    platformIcon: "📡",
    sourceUrl: "https://leonidavice.com",
    durationSec: 120,
    category: "gameplay",
    fetchedAt: new Date().toISOString(),
    playCount: 0,
  },
];

export class DriveInRoomServer extends Server<Env> {
  // Enable Cloudflare WebSocket Hibernation API — idle rooms consume 0 compute!
  static options = {
    hibernate: true,
  };

  private playlist: VideoItem[] = [];
  private currentIndex = 0;
  private clipStartTimestamp = 0;
  private encoreTriggered = false;
  private lastCatalogFetchMs = 0;
  private lastFlushMs = 0;
  private recentChat: SyncedChatMessage[] = [];

  // 100ms Differential Delta Buffer
  private pendingDeltas: RoomDeltaTuple[] = [];
  private deltaTimer: ReturnType<typeof setTimeout> | null = null;

  // 30s Batched Supabase Persistence Accumulators
  private dirtyChatQueue: SyncedChatMessage[] = [];
  private dirtyPlayIncrements: Map<string, number> = new Map();
  private dirtyHighBeamIncrements: Map<string, number> = new Map();
  private dirtyDurationCalibrations: Map<string, number> = new Map();
  private dirtyRoomCheckpoint = false;

  // ── Lifecycle: Hydrate state on cold start or hibernation wake ──────────────
  async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<PersistedRoomState>("roomState");
    if (stored && stored.playlist.length > 0) {
      this.playlist = stored.playlist;
      this.currentIndex = stored.currentIndex % stored.playlist.length;
      this.clipStartTimestamp = stored.clipStartTimestamp;
      this.encoreTriggered = stored.encoreTriggered;
      this.lastCatalogFetchMs = stored.lastCatalogFetchMs;
      this.lastFlushMs = stored.lastFlushMs || Date.now();
      this.recentChat = stored.recentChat || [];
    }

    await this.ensureCatalogFresh();
    this.fastForwardClockIfNeeded();
    await this.persistLocalState();
    await this.scheduleNextAlarm();
  }

  private get supabaseKey(): string {
    return this.env.SUPABASE_SERVICE_ROLE_KEY || this.env.SUPABASE_ANON_KEY || "";
  }

  private async ensureCatalogFresh(): Promise<void> {
    const now = Date.now();
    if (
      this.playlist.length > 1 &&
      now - this.lastCatalogFetchMs < CATALOG_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    const sbUrl = this.env.SUPABASE_URL;
    const sbKey = this.supabaseKey;
    if (!sbUrl || !sbKey) {
      if (this.playlist.length === 0) {
        this.playlist = FALLBACK_PLAYLIST;
        this.clipStartTimestamp = now;
      }
      return;
    }

    try {
      const url = `${sbUrl}/rest/v1/video_catalog?is_active=eq.true&is_approved=eq.true&select=*&order=viral_heat_score.desc.nullslast,play_count.asc&limit=80`;
      const res = await fetch(url, {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      });
      if (res.ok) {
        const rows = (await res.json()) as CatalogRow[];
        // Shared gate: English-only + Launch-Day post-launch filter (leaks/speculation/pre-launch uploads)
        const items = filterCatalogRows(rows, {
          GTA6_LAUNCH_DATE: this.env.GTA6_LAUNCH_DATE,
          GTA6_LAUNCH_MODE: this.env.GTA6_LAUNCH_MODE,
        }).map(rowToVideoItem);
        if (items.length > 0) {
          // Preserve currently playing video identity across catalog refreshes
          const activeId = this.currentItem?.id;
          this.playlist = items;
          const idx = activeId ? this.playlist.findIndex((i) => i.id === activeId) : -1;
          if (idx >= 0) {
            this.currentIndex = idx;
          } else {
            // Active clip was retired (e.g. launch-day filter) or first load: restart cleanly
            this.currentIndex = 0;
            this.clipStartTimestamp = now;
            this.encoreTriggered = false;
          }
          this.lastCatalogFetchMs = now;
        }
      }
    } catch (err) {
      console.error("[DriveInRoomServer] catalog fetch error:", err);
    }

    if (this.playlist.length === 0) {
      this.playlist = FALLBACK_PLAYLIST;
      this.clipStartTimestamp = now;
    }
  }

  private get currentItem(): VideoItem | null {
    if (this.playlist.length === 0) return null;
    return this.playlist[this.currentIndex % this.playlist.length] ?? null;
  }

  private get nextItem(): VideoItem | null {
    if (this.playlist.length === 0) return null;
    return this.playlist[(this.currentIndex + 1) % this.playlist.length] ?? null;
  }

  private get currentClipDurationMs(): number {
    const durSec = this.currentItem?.durationSec || DEFAULT_CLIP_DURATION_SEC;
    return Math.max(12, Math.min(durSec, 1800)) * 1000;
  }

  /**
   * Authoritative Playback Clock:
   * CurrentClipOffset = ServerNow() - ClipStartTimestamp
   * Fast-forwards cleanly if room woke from hibernation after one or more clips elapsed.
   */
  private fastForwardClockIfNeeded(): boolean {
    if (this.playlist.length === 0) return false;
    const now = Date.now();
    if (!this.clipStartTimestamp || this.clipStartTimestamp > now + 60_000) {
      this.clipStartTimestamp = now;
      return true;
    }

    let advanced = false;
    let safety = 0;
    while (now - this.clipStartTimestamp >= this.currentClipDurationMs && safety < 200) {
      this.clipStartTimestamp += this.currentClipDurationMs;
      this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
      this.encoreTriggered = false;
      advanced = true;
      safety++;
    }
    if (safety >= 200) {
      this.clipStartTimestamp = now;
    }
    return advanced;
  }

  private getActiveVehicles(): RoomVehiclePresence[] {
    const list: RoomVehiclePresence[] = [];
    for (const conn of this.getConnections<RoomVehiclePresence>()) {
      if (conn.state) {
        list.push({ ...(conn.state as RoomVehiclePresence) });
      }
    }
    return list;
  }

  private getConnectionCount(): number {
    let count = 0;
    for (const conn of this.getConnections()) {
      void conn;
      count++;
    }
    return count;
  }

  // Per-connection flood control (in-memory; resets on hibernation which is acceptable)
  private lastActionAt = new Map<string, number>();

  private rateLimited(connectionId: string, action: string, minIntervalMs: number): boolean {
    const key = `${connectionId}:${action}`;
    const now = Date.now();
    const last = this.lastActionAt.get(key) ?? 0;
    if (now - last < minIntervalMs) return true;
    this.lastActionAt.set(key, now);
    if (this.lastActionAt.size > 2000) {
      for (const [k, t] of this.lastActionAt) {
        if (now - t > 60_000) this.lastActionAt.delete(k);
      }
    }
    return false;
  }

  private computeTallies(vehicles?: RoomVehiclePresence[]): ReactionTallies {
    const active = vehicles ?? this.getActiveVehicles();
    let highBeams = 0;
    let hazards = 0;
    for (const v of active) {
      if (v.highBeamsOn) highBeams++;
      if (v.hazardsOn) hazards++;
    }
    return {
      highBeams,
      hazards,
      occupiedCount: active.length,
      encoreTriggered: this.encoreTriggered,
    };
  }

  private allocateParkingSlot(streakDays: number, viceCred: number): {
    seatId: string;
    row: LotRow;
    slotIndex: number;
    xPct: number;
    zDepth: number;
  } {
    const taken = new Set(this.getActiveVehicles().map((v) => v.seatId));
    // Row A reserved for 7-day streak holders or top Clip Scouts (Vice Cred >= 100), else B -> C -> A overflow
    const qualifiesRowA = streakDays >= 7 || viceCred >= 100;
    const rowOrder: LotRow[] = qualifiesRowA ? ["A", "B", "C"] : ["B", "C", "A"];

    for (const row of rowOrder) {
      const cap = ROW_CAPACITIES[row];
      for (let i = 0; i < cap; i++) {
        const seatId = `${row}-${i}`;
        if (!taken.has(seatId)) {
          const xPct = Number(((i + 0.5) / cap).toFixed(3));
          return { seatId, row, slotIndex: i, xPct, zDepth: ROW_DEPTH[row] };
        }
      }
    }

    const overflowIdx = taken.size;
    return {
      seatId: `C-${overflowIdx}`,
      row: "C",
      slotIndex: overflowIdx,
      xPct: 0.5,
      zDepth: 0.9,
    };
  }

  // ── 100ms Differential Delta Coalescer ─────────────────────────────────────
  private enqueueDelta(delta: RoomDeltaTuple): void {
    this.pendingDeltas.push(delta);
    if (!this.deltaTimer) {
      this.deltaTimer = setTimeout(() => {
        this.flushDeltas();
      }, DELTA_BATCH_INTERVAL_MS);
    }
  }

  private flushDeltas(): void {
    this.deltaTimer = null;
    if (this.pendingDeltas.length === 0) return;

    const tallies = this.computeTallies();
    const deltas: RoomDeltaTuple[] = [
      ...this.pendingDeltas,
      ["TALLY", tallies.highBeams, tallies.hazards, tallies.occupiedCount],
    ];
    this.pendingDeltas = [];

    const packet: ServerToClientMessage = {
      type: "ROOM_DELTA",
      serverNow: Date.now(),
      deltas,
    };
    this.broadcast(JSON.stringify(packet));
  }

  private clearAllVehicleReactions(): void {
    for (const conn of this.getConnections<RoomVehiclePresence>()) {
      if (conn.state && (conn.state.highBeamsOn || conn.state.hazardsOn)) {
        conn.setState({
          ...(conn.state as RoomVehiclePresence),
          highBeamsOn: false,
          hazardsOn: false,
        });
      }
    }
  }

  private async advanceToNextClip(reason: "scheduled" | "emp_skip" | "admin"): Promise<void> {
    await this.ensureCatalogFresh();
    if (this.playlist.length === 0) return;

    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    this.clipStartTimestamp = Date.now();
    this.encoreTriggered = false;
    this.clearAllVehicleReactions();

    const current = this.currentItem;
    if (current) {
      this.dirtyPlayIncrements.set(
        current.id,
        (this.dirtyPlayIncrements.get(current.id) ?? 0) + 1
      );
      this.dirtyRoomCheckpoint = true;

      const msg: ServerToClientMessage = {
        type: "CLIP_TRANSITION",
        serverNow: this.clipStartTimestamp,
        current,
        next: this.nextItem,
        clipStartTimestamp: this.clipStartTimestamp,
        reason,
      };
      this.broadcast(JSON.stringify(msg));
    }

    await this.persistLocalState();
    await this.scheduleNextAlarm();
  }

  // ── WebSocket Handlers ─────────────────────────────────────────────────────
  async onConnect(connection: Connection<RoomVehiclePresence>): Promise<void> {
    await this.ensureCatalogFresh();
    this.fastForwardClockIfNeeded();

    const slot = this.allocateParkingSlot(1, 0);
    const shortId = connection.id.slice(0, 4).toUpperCase();
    const initialVehicle: RoomVehiclePresence = {
      ...slot,
      userId: `anon_${connection.id.slice(0, 8)}`,
      username: `Driver_${shortId}`,
      vehicleType: "muscle_car",
      badgeColor: "#ff007f",
      licensePlate: `VICE-${shortId}`,
      viceCred: 0,
      streakDays: 1,
      highBeamsOn: false,
      hazardsOn: false,
    };
    connection.setState(initialVehicle);

    const now = Date.now();
    const vehicles = this.getActiveVehicles();
    const snapshot: ServerToClientMessage = {
      type: "ROOM_SNAPSHOT",
      roomSlug: this.name || "main",
      serverNow: now,
      current: this.currentItem,
      next: this.nextItem,
      clipStartTimestamp: this.clipStartTimestamp,
      currentOffsetMs: Math.max(0, now - this.clipStartTimestamp),
      vehicles,
      reactionTallies: this.computeTallies(vehicles),
      recentChat: this.recentChat.slice(-40),
    };
    connection.send(JSON.stringify(snapshot));

    this.enqueueDelta(["SEAT_JOIN", initialVehicle]);
    this.dirtyRoomCheckpoint = true;
    await this.scheduleNextAlarm();
  }

  async onMessage(connection: Connection<RoomVehiclePresence>, raw: WSMessage): Promise<void> {
    if (typeof raw !== "string") return;
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(raw) as ClientToServerMessage;
    } catch {
      return;
    }

    const now = Date.now();

    switch (msg.type) {
      case "PING": {
        const pong: ServerToClientMessage = {
          type: "PONG",
          clientSentAt: msg.clientSentAt,
          serverNow: now,
        };
        connection.send(JSON.stringify(pong));
        return;
      }

      case "IDENTIFY": {
        const prev = connection.state as RoomVehiclePresence | null;
        const streakDays = msg.streakDays ?? prev?.streakDays ?? 1;
        const viceCred = msg.viceCred ?? prev?.viceCred ?? 0;

        // Upgrade to Row A if newly identified user qualifies for Front Row!
        let seat = prev
          ? {
              seatId: prev.seatId,
              row: prev.row,
              slotIndex: prev.slotIndex,
              xPct: prev.xPct,
              zDepth: prev.zDepth,
            }
          : this.allocateParkingSlot(streakDays, viceCred);

        if (prev && prev.row !== "A" && (streakDays >= 7 || viceCred >= 100)) {
          const upgraded = this.allocateParkingSlot(streakDays, viceCred);
          if (upgraded.row === "A") {
            this.enqueueDelta(["SEAT_LEAVE", prev.seatId]);
            seat = upgraded;
          }
        }

        const updated: RoomVehiclePresence = {
          ...seat,
          userId: msg.userId || prev?.userId || connection.id,
          username: (msg.username || prev?.username || "Driver").slice(0, 32),
          vehicleType: (msg.vehicleType || prev?.vehicleType || "muscle_car") as VehicleType,
          badgeColor: msg.badgeColor || prev?.badgeColor || "#ff007f",
          licensePlate: (
            msg.licensePlate ||
            prev?.licensePlate ||
            `VICE-${connection.id.slice(0, 4).toUpperCase()}`
          ).slice(0, 9),
          viceCred,
          streakDays,
          highBeamsOn: prev?.highBeamsOn ?? false,
          hazardsOn: prev?.hazardsOn ?? false,
        };
        connection.setState(updated);
        this.enqueueDelta(["SEAT_JOIN", updated]);
        return;
      }

      case "CAR_FLASH": {
        if (this.rateLimited(connection.id, "flash", REACTION_MIN_INTERVAL_MS)) return;
        const prev = connection.state as RoomVehiclePresence | null;
        if (!prev) return;
        const nextActive = Boolean(msg.active);
        if (prev.highBeamsOn === nextActive) return;

        connection.setState({ ...prev, highBeamsOn: nextActive });
        this.enqueueDelta(["CAR_FLASH", prev.seatId, nextActive ? 1 : 0]);

        if (nextActive && this.currentItem) {
          this.dirtyHighBeamIncrements.set(
            this.currentItem.id,
            (this.dirtyHighBeamIncrements.get(this.currentItem.id) ?? 0) + 1
          );
          this.dirtyRoomCheckpoint = true;

          // Crowd Vote Rule: >25% High-Beams triggers 15-second Replay Encore!
          const tallies = this.computeTallies();
          const minVotes = tallies.occupiedCount >= 4 ? 2 : 1;
          if (
            !this.encoreTriggered &&
            tallies.highBeams >= minVotes &&
            tallies.highBeams / Math.max(1, tallies.occupiedCount) > 0.25
          ) {
            this.encoreTriggered = true;
            this.clipStartTimestamp = Math.min(now, this.clipStartTimestamp + 15_000);
            const surge: ServerToClientMessage = {
              type: "ENCORE_SURGE",
              serverNow: now,
              clipStartTimestamp: this.clipStartTimestamp,
              bonusSec: 15,
              highBeams: tallies.highBeams,
            };
            this.broadcast(JSON.stringify(surge));
            await this.persistLocalState();
            await this.scheduleNextAlarm();
          }
        }
        return;
      }

      case "CAR_HAZARD": {
        if (this.rateLimited(connection.id, "hazard", REACTION_MIN_INTERVAL_MS)) return;
        const prev = connection.state as RoomVehiclePresence | null;
        if (!prev) return;
        const nextHazard = Boolean(msg.active);
        if (prev.hazardsOn === nextHazard) return;

        connection.setState({ ...prev, hazardsOn: nextHazard });
        this.enqueueDelta(["CAR_HAZARD", prev.seatId, nextHazard ? 1 : 0]);

        // Crowd Vote Rule: >50% Hazards triggers EMP Glitch Skip to pre-buffered next clip!
        if (nextHazard) {
          const tallies = this.computeTallies();
          const minVotes = tallies.occupiedCount >= 3 ? 2 : 1;
          if (
            tallies.hazards >= minVotes &&
            tallies.hazards / Math.max(1, tallies.occupiedCount) > 0.5
          ) {
            this.flushDeltas();
            await this.advanceToNextClip("emp_skip");
          }
        }
        return;
      }

      case "CAR_HORN": {
        if (this.rateLimited(connection.id, "horn", HORN_MIN_INTERVAL_MS)) return;
        const prev = connection.state as RoomVehiclePresence | null;
        if (!prev) return;
        const panX = Number(((prev.xPct - 0.5) * 2).toFixed(3)); // -1 (far left) .. +1 (far right)
        this.enqueueDelta([
          "CAR_HORN",
          prev.seatId,
          (msg.hornId || "synth_horn").slice(0, 24),
          panX,
          prev.zDepth,
        ]);
        return;
      }

      case "CHAT_SEND": {
        if (this.rateLimited(connection.id, "chat", CHAT_MIN_INTERVAL_MS)) return;
        const prev = connection.state as RoomVehiclePresence | null;
        const content = (msg.content || "")
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
          .trim()
          .slice(0, 500);
        if (!content) return;

        const chatMsg: SyncedChatMessage = {
          id: msg.id || `m_${now}_${Math.random().toString(36).slice(2, 7)}`,
          userId: prev?.userId || connection.id,
          username: prev?.username || "Driver",
          vehicleBadge: prev?.vehicleType || "muscle_car",
          badgeColor: prev?.badgeColor || "#00f3ff",
          content,
          createdAt: new Date(now).toISOString(),
        };

        this.recentChat = [...this.recentChat.slice(-49), chatMsg];
        this.dirtyChatQueue.push(chatMsg);
        this.dirtyRoomCheckpoint = true;

        const packet: ServerToClientMessage = {
          type: "CHAT_MESSAGE",
          message: chatMsg,
        };
        this.broadcast(JSON.stringify(packet));
        await this.persistLocalState();
        await this.scheduleNextAlarm();
        return;
      }

      case "CLIP_DURATION_REPORT": {
        const cur = this.currentItem;
        if (
          cur &&
          cur.id === msg.videoId &&
          !cur.durationSec &&
          Number.isFinite(msg.durationSec) &&
          msg.durationSec >= 10 &&
          msg.durationSec <= 10800
        ) {
          const calibrated = Math.round(msg.durationSec);
          cur.durationSec = calibrated;
          this.dirtyDurationCalibrations.set(cur.id, calibrated);
          await this.persistLocalState();
          await this.scheduleNextAlarm();
        }
        return;
      }
    }
  }

  async onClose(connection: Connection<RoomVehiclePresence>): Promise<void> {
    const prev = connection.state as RoomVehiclePresence | null;
    if (prev) {
      this.enqueueDelta(["SEAT_LEAVE", prev.seatId]);
    }
    this.dirtyRoomCheckpoint = true;
    await this.scheduleNextAlarm();
  }

  // ── HTTP Inspection Endpoint on the Room DO ────────────────────────────────
  async onRequest(): Promise<Response> {
    await this.ensureCatalogFresh();
    this.fastForwardClockIfNeeded();
    const now = Date.now();
    const vehicles = this.getActiveVehicles();
    return Response.json({
      ok: true,
      roomSlug: this.name || "main",
      serverNow: now,
      current: this.currentItem,
      next: this.nextItem,
      clipStartTimestamp: this.clipStartTimestamp,
      currentOffsetMs: Math.max(0, now - this.clipStartTimestamp),
      vehicles,
      reactionTallies: this.computeTallies(vehicles),
    });
  }

  // ── Durable Object Alarm: Transitions + 30s Batched Supabase Persistence ──
  private get hasDirtyPersistence(): boolean {
    return (
      this.dirtyChatQueue.length > 0 ||
      this.dirtyPlayIncrements.size > 0 ||
      this.dirtyHighBeamIncrements.size > 0 ||
      this.dirtyDurationCalibrations.size > 0 ||
      this.dirtyRoomCheckpoint
    );
  }

  private async persistLocalState(): Promise<void> {
    const state: PersistedRoomState = {
      playlist: this.playlist,
      currentIndex: this.currentIndex,
      clipStartTimestamp: this.clipStartTimestamp,
      encoreTriggered: this.encoreTriggered,
      lastCatalogFetchMs: this.lastCatalogFetchMs,
      lastFlushMs: this.lastFlushMs,
      recentChat: this.recentChat.slice(-50),
    };
    await this.ctx.storage.put("roomState", state);
  }

  private async scheduleNextAlarm(): Promise<void> {
    const viewerCount = this.getConnectionCount();
    const now = Date.now();

    if (viewerCount === 0 && !this.hasDirtyPersistence) {
      // Zero viewers & zero pending writes -> clear alarms so DO hibernates at $0 cost!
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const clipEndMs =
      viewerCount > 0
        ? this.clipStartTimestamp + this.currentClipDurationMs
        : Number.POSITIVE_INFINITY;
    const flushDueMs = this.hasDirtyPersistence
      ? Math.max(now + 1000, this.lastFlushMs + SUPABASE_ALARM_FLUSH_MS)
      : Number.POSITIVE_INFINITY;

    const nextAlarm = Math.min(clipEndMs, flushDueMs);
    if (Number.isFinite(nextAlarm)) {
      await this.ctx.storage.setAlarm(Math.max(now + 250, nextAlarm));
    }
  }

  async onAlarm(): Promise<void> {
    const now = Date.now();
    const clipEndMs = this.clipStartTimestamp + this.currentClipDurationMs;

    if (this.getConnectionCount() > 0 && now >= clipEndMs - 80) {
      await this.advanceToNextClip("scheduled");
    }

    if (
      this.hasDirtyPersistence &&
      (now - this.lastFlushMs >= SUPABASE_ALARM_FLUSH_MS - 1000 ||
        this.getConnectionCount() === 0)
    ) {
      await this.flushBatchedWritesToSupabase();
    }

    await this.scheduleNextAlarm();
  }

  private async flushBatchedWritesToSupabase(): Promise<void> {
    const sbUrl = this.env.SUPABASE_URL;
    const sbKey = this.supabaseKey;
    this.lastFlushMs = Date.now();

    if (!sbUrl || !sbKey) {
      this.dirtyChatQueue = [];
      this.dirtyPlayIncrements.clear();
      this.dirtyHighBeamIncrements.clear();
      this.dirtyDurationCalibrations.clear();
      this.dirtyRoomCheckpoint = false;
      return;
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };

    // 1. Flush room playback checkpoint (1 upsert instead of hundreds of per-event commits)
    if (this.dirtyRoomCheckpoint) {
      const tallies = this.computeTallies();
      this.dirtyRoomCheckpoint = false;
      await fetch(`${sbUrl}/rest/v1/room_playback_state`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          room_slug: this.name || "main",
          current_video_id: this.currentItem?.id ?? null,
          next_video_id: this.nextItem?.id ?? null,
          clip_start_ms: this.clipStartTimestamp,
          high_beam_count: tallies.highBeams,
          hazard_count: tallies.hazards,
          occupied_vehicles: tallies.occupiedCount,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    // 2. Flush calibrated video durations
    for (const [vidId, durSec] of this.dirtyDurationCalibrations.entries()) {
      await fetch(`${sbUrl}/rest/v1/video_catalog?id=eq.${encodeURIComponent(vidId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ duration_sec: durSec }),
      }).catch(() => {});
    }
    this.dirtyDurationCalibrations.clear();

    // 3. Flush batched play_count & high_beam_count / viral_heat_score deltas
    const touchedIds = new Set([
      ...this.dirtyPlayIncrements.keys(),
      ...this.dirtyHighBeamIncrements.keys(),
    ]);
    for (const vidId of touchedIds) {
      const item = this.playlist.find((v) => v.id === vidId);
      const addPlays = this.dirtyPlayIncrements.get(vidId) ?? 0;
      const addBeams = this.dirtyHighBeamIncrements.get(vidId) ?? 0;
      if (!item) continue;

      item.playCount = (item.playCount || 0) + addPlays;
      item.highBeamCount = (item.highBeamCount || 0) + addBeams;
      item.viralHeatScore = (item.viralHeatScore || 0) + addBeams * 5 + addPlays;

      await fetch(`${sbUrl}/rest/v1/video_catalog?id=eq.${encodeURIComponent(vidId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          play_count: item.playCount,
          high_beam_count: item.highBeamCount,
          viral_heat_score: item.viralHeatScore,
          last_played: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
    this.dirtyPlayIncrements.clear();
    this.dirtyHighBeamIncrements.clear();

    // 4. Clear buffered chat queue (persisted in DO SQLite / storage + optional authenticated DB log)
    this.dirtyChatQueue = [];
    await this.persistLocalState();
  }
}

// ─── Edge Byte-Range CORS Media Proxy (Zero Memory Buffering) ────────────────
async function handleMediaProxy(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // https-only, strict dot-boundary host-suffix allowlist, no raw IPs/localhost
  const parsedTarget = parseAllowedMediaUrl(target);
  if (!parsedTarget) {
    return Response.json({ error: "URL not permitted" }, { status: 403 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("Range");
  if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.set("Range", range);
  upstreamHeaders.set("User-Agent", "Mozilla/5.0 (compatible; LeonidaViceEdge/3.0)");

  let upstream: Response | null;
  try {
    // Every redirect hop is re-validated against the allowlist
    upstream = await fetchAllowedMedia(parsedTarget, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
    });
  } catch {
    return Response.json({ error: "Upstream stream unreachable" }, { status: 502 });
  }
  if (!upstream) {
    return Response.json({ error: "Upstream redirect not permitted" }, { status: 502 });
  }

  // Only relay actual media — never HTML/JSON pages from the upstream host
  const contentType = upstream.headers.get("Content-Type") ?? "";
  if (upstream.ok && !/^(video\/|audio\/|application\/(octet-stream|mp4|vnd\.apple\.mpegurl|x-mpegurl))/i.test(contentType)) {
    return Response.json({ error: "Upstream is not a media resource" }, { status: 415 });
  }

  const respHeaders = new Headers();
  for (const key of [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
    "ETag",
    "Last-Modified",
  ]) {
    const val = upstream.headers.get(key);
    if (val) respHeaders.set(key, val);
  }
  respHeaders.set("Cache-Control", "public, max-age=3600");
  respHeaders.set("Access-Control-Allow-Origin", "*");
  respHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

// ─── Cloudflare Worker Fetch Entrypoint ──────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "leonida-vice-party", runtime: "cloudflare-durable-objects" },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (url.pathname === "/proxy-media") {
      return handleMediaProxy(request);
    }

    const partyResponse = await routePartykitRequest(request, env, { cors: true });
    if (partyResponse) return partyResponse;

    return Response.json({ error: "Not Found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
