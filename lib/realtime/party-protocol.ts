// ─── NewVice V3 Hybrid Real-Time Edge Protocol ───────────────────────────────
// Shared wire format between Next.js (partysocket) and Cloudflare Durable Objects (partyserver)

import type { VideoItem } from "../video/types";

export type VehicleType =
  | "muscle_car"
  | "sports_car"
  | "truck"
  | "synth_coupe"
  | "vice_pd"
  | "lowrider"
  | "default";

export type LotRow = "A" | "B" | "C";

export interface RoomVehiclePresence {
  seatId: string;           // e.g. "A-2", "B-4"
  row: LotRow;
  slotIndex: number;
  xPct: number;             // Normalized lot X coordinate (0..1) for spatial 3D PannerNode
  zDepth: number;           // Normalized lot Z distance (0..1) for spatial attenuation
  userId: string;
  username: string;
  vehicleType: VehicleType;
  badgeColor: string;
  licensePlate: string;
  viceCred: number;
  streakDays: number;
  highBeamsOn: boolean;
  hazardsOn: boolean;
  cabinUnlocked?: boolean;
  cabinCode?: string;
}

export interface ReactionTallies {
  highBeams: number;
  hazards: number;
  occupiedCount: number;
  encoreTriggered: boolean;
}

export interface SyncedChatMessage {
  id: string;
  userId: string;
  username: string;
  vehicleBadge: string;
  badgeColor: string;
  content: string;
  createdAt: string;
  isAnnouncement?: boolean;
}

/**
 * Compact differential deltas aggregated over 100ms intervals by the Durable Object
 * to eliminate full-snapshot bandwidth bottlenecks at 200+ concurrent viewers.
 */
export type RoomDeltaTuple =
  | ["CAR_FLASH", string /* seatId */, 0 | 1]
  | ["CAR_HAZARD", string /* seatId */, 0 | 1]
  | ["CAR_HORN", string /* seatId */, string /* hornId */, number /* panX */, number /* zDepth */]
  | ["SEAT_JOIN", RoomVehiclePresence]
  | ["SEAT_LEAVE", string /* seatId */]
  | ["TALLY", number /* highBeams */, number /* hazards */, number /* occupiedCount */];

// ─── Server -> Client Wire Messages ──────────────────────────────────────────
export type ServerToClientMessage =
  | {
      type: "ROOM_SNAPSHOT";
      roomSlug: string;
      serverNow: number;
      current: VideoItem | null;
      next: VideoItem | null;
      clipStartTimestamp: number;
      currentOffsetMs: number;
      vehicles: RoomVehiclePresence[];
      reactionTallies: ReactionTallies;
      recentChat: SyncedChatMessage[];
    }
  | {
      type: "ROOM_DELTA";
      serverNow: number;
      deltas: RoomDeltaTuple[];
    }
  | {
      type: "CLIP_TRANSITION";
      serverNow: number;
      current: VideoItem;
      next: VideoItem | null;
      clipStartTimestamp: number;
      reason: "scheduled" | "emp_skip" | "admin";
    }
  | {
      type: "ENCORE_SURGE";
      serverNow: number;
      clipStartTimestamp: number;
      bonusSec: number;
      highBeams: number;
    }
  | {
      type: "CHAT_MESSAGE";
      message: SyncedChatMessage;
    }
  | {
      type: "PONG";
      clientSentAt: number;
      serverNow: number;
    };

// ─── Client -> Server Wire Messages ──────────────────────────────────────────
export type ClientToServerMessage =
  | {
      type: "IDENTIFY";
      userId: string;
      username: string;
      vehicleType: VehicleType;
      badgeColor: string;
      licensePlate?: string;
      viceCred?: number;
      streakDays?: number;
    }
  | {
      type: "PING";
      clientSentAt: number;
    }
  | {
      type: "CAR_FLASH";
      active: boolean;
    }
  | {
      type: "CAR_HAZARD";
      active: boolean;
    }
  | {
      type: "CAR_HORN";
      hornId: string;
    }
  | {
      type: "CHAT_SEND";
      id: string;
      content: string;
    }
  | {
      type: "CLIP_DURATION_REPORT";
      videoId: string;
      durationSec: number;
    };
