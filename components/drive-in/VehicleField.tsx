"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GlassPanel from "@/components/ui/GlassPanel";
import type {
  RoomVehiclePresence,
  VehicleType,
  LotRow,
} from "@/lib/realtime/party-protocol";
import { getScoutRank } from "@/lib/economy/vice-cred";

// ─── 3-Tier Curved Amphitheater Stall Topology (Matches Word Doc Diagram) ───
// Row A: Front inner arc closest to the Drive-In Screen (Daily Streak Holders & Top Scouts)
// Row B: Middle curved ramp (Creator & Syndicate Lot + 4-Seat Spatial Voice Cabins)
// Row C: Outer general admission curved ramp

export interface AmphitheaterStallSpec {
  stallId: string;
  row: LotRow;
  label: string;
  leftPct: number;      // Horizontal center % across the amphitheater stage
  topPct: number;       // Vertical position % within the amphitheater lot container
  scale: number;        // Perspective scale (larger in Row A, medium in Row B, smaller in Row C)
  beamAngleDeg: number; // Angle of headlights/car orientation toward the center of the screen
  panX: number;         // -1 (left) .. +1 (right) for Web Audio StereoPannerNode
  zDepth: number;       // 0.18 (Row A) .. 0.85 (Row C) for Web Audio distance attenuation
  defaultVehicleType: VehicleType;
  defaultColor: string;
  defaultHandle: string;
  defaultPlate: string;
  defaultCred: number;
  defaultStreak: number;
  defaultHighBeams?: boolean;
  defaultCabinUnlocked?: boolean;
  defaultCabinCode?: string;
}

export const AMPHITHEATER_STALLS: AmphitheaterStallSpec[] = [
  // ── ROW A: MAIN FM TRANSMITTER AUDIO (DAILY STREAK HOLDERS) ── (Front Curved Arc)
  {
    stallId: "A-0",
    row: "A",
    label: "ROW A • VIP STALL 01",
    leftPct: 16,
    topPct: 27,
    scale: 1.02,
    beamAngleDeg: 18,
    panX: -0.68,
    zDepth: 0.22,
    defaultVehicleType: "synth_coupe",
    defaultColor: "#00f3ff",
    defaultHandle: "Jason_Keys",
    defaultPlate: "LEON-305",
    defaultCred: 310,
    defaultStreak: 9,
  },
  {
    stallId: "A-1",
    row: "A",
    label: "ROW A • VIP STALL 02",
    leftPct: 32,
    topPct: 22,
    scale: 1.08,
    beamAngleDeg: 9,
    panX: -0.34,
    zDepth: 0.19,
    defaultVehicleType: "muscle_car",
    defaultColor: "#ff007f",
    defaultHandle: "OceanDrive86",
    defaultPlate: "OUTR-86",
    defaultCred: 280,
    defaultStreak: 8,
    defaultHighBeams: true,
  },
  {
    stallId: "A-2",
    row: "A",
    label: "ROW A • CENTER HERO VIP",
    leftPct: 50,
    topPct: 20,
    scale: 1.14,
    beamAngleDeg: 0,
    panX: 0.0,
    zDepth: 0.16,
    defaultVehicleType: "sports_car",
    defaultColor: "#ffdd00",
    defaultHandle: "Lucia_VI",
    defaultPlate: "VICE-001",
    defaultCred: 540,
    defaultStreak: 14,
    defaultHighBeams: true,
    defaultCabinUnlocked: true,
    defaultCabinCode: "VIP001",
  },
  {
    stallId: "A-3",
    row: "A",
    label: "ROW A • VIP STALL 04",
    leftPct: 68,
    topPct: 22,
    scale: 1.08,
    beamAngleDeg: -9,
    panX: 0.34,
    zDepth: 0.19,
    defaultVehicleType: "vice_pd",
    defaultColor: "#00f3ff",
    defaultHandle: "VicePD_Unit1",
    defaultPlate: "VCPD-911",
    defaultCred: 390,
    defaultStreak: 11,
  },
  {
    stallId: "A-4",
    row: "A",
    label: "ROW A • VIP STALL 05",
    leftPct: 84,
    topPct: 27,
    scale: 1.02,
    beamAngleDeg: -18,
    panX: 0.68,
    zDepth: 0.22,
    defaultVehicleType: "lowrider",
    defaultColor: "#39ff14",
    defaultHandle: "GatorScout",
    defaultPlate: "GLAD-88",
    defaultCred: 230,
    defaultStreak: 7,
  },

  // ── ROW B: CREATOR & SYNDICATE LOT (CAR CREW SPATIAL VOICE CABINS) ── (Middle Curved Arc)
  {
    stallId: "B-0",
    row: "B",
    label: "ROW B • SYNDICATE 01",
    leftPct: 11,
    topPct: 56,
    scale: 0.9,
    beamAngleDeg: 22,
    panX: -0.78,
    zDepth: 0.48,
    defaultVehicleType: "muscle_car",
    defaultColor: "#ff6b00",
    defaultHandle: "LittleHaiti",
    defaultPlate: "HYDR-404",
    defaultCred: 145,
    defaultStreak: 5,
  },
  {
    stallId: "B-1",
    row: "B",
    label: "ROW B • CREW CABIN 02",
    leftPct: 26,
    topPct: 50,
    scale: 0.94,
    beamAngleDeg: 13,
    panX: -0.48,
    zDepth: 0.45,
    defaultVehicleType: "synth_coupe",
    defaultColor: "#00f3ff",
    defaultHandle: "StarIsland",
    defaultPlate: "SYND-777",
    defaultCred: 190,
    defaultStreak: 6,
    defaultCabinUnlocked: true,
    defaultCabinCode: "CREW88",
  },
  {
    stallId: "B-2",
    row: "B",
    label: "ROW B • SYNDICATE 03",
    leftPct: 42,
    topPct: 47,
    scale: 0.96,
    beamAngleDeg: 5,
    panX: -0.16,
    zDepth: 0.42,
    defaultVehicleType: "sports_car",
    defaultColor: "#ff007f",
    defaultHandle: "TommyV_86",
    defaultPlate: "VERC-86",
    defaultCred: 175,
    defaultStreak: 5,
  },
  {
    stallId: "B-3",
    row: "B",
    label: "ROW B • HIGH-BEAM LOT 04",
    leftPct: 58,
    topPct: 47,
    scale: 0.96,
    beamAngleDeg: -5,
    panX: 0.16,
    zDepth: 0.42,
    defaultVehicleType: "synth_coupe",
    defaultColor: "#ffdd00",
    defaultHandle: "PortGellhorn",
    defaultPlate: "PORT-502",
    defaultCred: 165,
    defaultStreak: 6,
    defaultHighBeams: true,
  },
  {
    stallId: "B-4",
    row: "B",
    label: "ROW B • CREW CABIN 05",
    leftPct: 74,
    topPct: 50,
    scale: 0.94,
    beamAngleDeg: -13,
    panX: 0.48,
    zDepth: 0.45,
    defaultVehicleType: "truck",
    defaultColor: "#bf00ff",
    defaultHandle: "Everglades4x4",
    defaultPlate: "SWMP-4X4",
    defaultCred: 130,
    defaultStreak: 4,
    defaultCabinUnlocked: true,
    defaultCabinCode: "GATOR4",
  },
  {
    stallId: "B-5",
    row: "B",
    label: "ROW B • SYNDICATE 06",
    leftPct: 89,
    topPct: 56,
    scale: 0.9,
    beamAngleDeg: -22,
    panX: 0.78,
    zDepth: 0.48,
    defaultVehicleType: "lowrider",
    defaultColor: "#00f3ff",
    defaultHandle: "WashBeach",
    defaultPlate: "PALM-305",
    defaultCred: 115,
    defaultStreak: 4,
  },

  // ── ROW C: GENERAL ADMISSION VEHICLE FIELD ── (Outer Curved Arc)
  {
    stallId: "C-0",
    row: "C",
    label: "ROW C • GEN ADMISSION 01",
    leftPct: 9,
    topPct: 82,
    scale: 0.78,
    beamAngleDeg: 24,
    panX: -0.85,
    zDepth: 0.78,
    defaultVehicleType: "muscle_car",
    defaultColor: "#00f3ff",
    defaultHandle: "NightCaller",
    defaultPlate: "FM-886",
    defaultCred: 55,
    defaultStreak: 2,
  },
  {
    stallId: "C-1",
    row: "C",
    label: "ROW C • GEN ADMISSION 02",
    leftPct: 23,
    topPct: 78,
    scale: 0.8,
    beamAngleDeg: 16,
    panX: -0.56,
    zDepth: 0.75,
    defaultVehicleType: "sports_car",
    defaultColor: "#ff007f",
    defaultHandle: "NeonDrifter",
    defaultPlate: "DRFT-99",
    defaultCred: 65,
    defaultStreak: 3,
  },
  {
    stallId: "C-2",
    row: "C",
    label: "ROW C • GEN ADMISSION 03",
    leftPct: 37,
    topPct: 75,
    scale: 0.82,
    beamAngleDeg: 8,
    panX: -0.28,
    zDepth: 0.72,
    defaultVehicleType: "truck",
    defaultColor: "#39ff14",
    defaultHandle: "MudRunner",
    defaultPlate: "KEYS-404",
    defaultCred: 45,
    defaultStreak: 2,
  },
  {
    stallId: "C-3",
    row: "C",
    label: "ROW C • GEN ADMISSION 04",
    leftPct: 50,
    topPct: 74,
    scale: 0.84,
    beamAngleDeg: 0,
    panX: 0.0,
    zDepth: 0.7,
    defaultVehicleType: "synth_coupe",
    defaultColor: "#00f3ff",
    defaultHandle: "FlashFM_Fan",
    defaultPlate: "FLSH-103",
    defaultCred: 80,
    defaultStreak: 3,
  },
  {
    stallId: "C-4",
    row: "C",
    label: "ROW C • GEN ADMISSION 05",
    leftPct: 63,
    topPct: 75,
    scale: 0.82,
    beamAngleDeg: -8,
    panX: 0.28,
    zDepth: 0.72,
    defaultVehicleType: "lowrider",
    defaultColor: "#ffdd00",
    defaultHandle: "SunsetStrip",
    defaultPlate: "GOLD-808",
    defaultCred: 50,
    defaultStreak: 2,
  },
  {
    stallId: "C-5",
    row: "C",
    label: "ROW C • GEN ADMISSION 06",
    leftPct: 77,
    topPct: 78,
    scale: 0.8,
    beamAngleDeg: -16,
    panX: 0.56,
    zDepth: 0.75,
    defaultVehicleType: "vice_pd",
    defaultColor: "#ff0055",
    defaultHandle: "Detective_C",
    defaultPlate: "VCPD-305",
    defaultCred: 90,
    defaultStreak: 4,
  },
  {
    stallId: "C-6",
    row: "C",
    label: "ROW C • GEN ADMISSION 07",
    leftPct: 91,
    topPct: 82,
    scale: 0.78,
    beamAngleDeg: -24,
    panX: 0.85,
    zDepth: 0.78,
    defaultVehicleType: "muscle_car",
    defaultColor: "#bf00ff",
    defaultHandle: "SynthRider",
    defaultPlate: "WAVE-1984",
    defaultCred: 35,
    defaultStreak: 1,
  },
];

const VEHICLE_LABELS: Record<string, string> = {
  muscle_car: "🚗 '86 Muscle Challenger",
  sports_car: "🏎️ Vice GT Exotic",
  truck: "🚛 Leonida 4x4 Pickup",
  synth_coupe: "⚡ Gullwing Synth-Coupe",
  lowrider: "🌴 Hydraulic Lowrider",
  vice_pd: "🚓 Vice PD Interceptor",
  default: "🚙 Vice Night Cruiser",
};

export interface LocalDriverSpec {
  userId: string;
  username: string;
  vehicleType: VehicleType;
  badgeColor: string;
  licensePlate: string;
  viceCred: number;
  streakDays: number;
  hoursUntilRowATow?: number;
  highBeamsOn: boolean;
  hazardsOn: boolean;
  cabinUnlocked: boolean;
  cabinCode: string | null;
}

export interface VehicleFieldProps {
  remoteVehicles?: RoomVehiclePresence[];
  localDriver?: LocalDriverSpec;
  activeHornSeatId?: string | null;
  onToggleLocalHighBeams?: () => void;
  onToggleLocalHazards?: () => void;
  onHonkHorn?: (panX: number, zDepth: number, seatId: string) => void;
  onOpenCabinDrawer?: (joinCode?: string) => void;
}

interface BoundAmphitheaterStall {
  spec: AmphitheaterStallSpec;
  occupant: RoomVehiclePresence;
  isLocal: boolean;
  isLivePeer: boolean;
}

export default function VehicleField({
  remoteVehicles = [],
  localDriver,
  activeHornSeatId = null,
  onToggleLocalHighBeams,
  onToggleLocalHazards,
  onHonkHorn,
  onOpenCabinDrawer,
}: VehicleFieldProps) {
  const [selectedStallId, setSelectedStallId] = useState<string | null>(null);
  const [hoveredStallId, setHoveredStallId] = useState<string | null>(null);

  const effectiveDriver: LocalDriverSpec = useMemo(
    () =>
      localDriver ?? {
        userId: "local_driver",
        username: "Driver",
        vehicleType: "sports_car",
        badgeColor: "#ff007f",
        licensePlate: "VICE-305",
        viceCred: 120,
        streakDays: 7,
        hoursUntilRowATow: 48,
        highBeamsOn: false,
        hazardsOn: false,
        cabinUnlocked: false,
        cabinCode: null,
      },
    [localDriver]
  );

  const boundStalls = useMemo<BoundAmphitheaterStall[]>(() => {
    const qualifiesRowA =
      effectiveDriver.streakDays >= 7 || effectiveDriver.viceCred >= 100;
    // Place local driver in Row A Center Hero (A-2) if qualified, or Row B front-left (B-1) otherwise
    const myPreferredStallId = qualifiesRowA ? "A-2" : "B-1";

    const otherRemotes = remoteVehicles.filter(
      (v) => v.userId !== effectiveDriver.userId
    );
    let remoteCursor = 0;

    return AMPHITHEATER_STALLS.map((spec) => {
      if (spec.stallId === myPreferredStallId) {
        return {
          spec,
          isLocal: true,
          isLivePeer: true,
          occupant: {
            seatId: spec.stallId,
            row: spec.row,
            slotIndex: 0,
            xPct: spec.leftPct / 100,
            zDepth: spec.zDepth,
            userId: effectiveDriver.userId,
            username: effectiveDriver.username,
            vehicleType: effectiveDriver.vehicleType,
            badgeColor: effectiveDriver.badgeColor,
            licensePlate: effectiveDriver.licensePlate,
            viceCred: effectiveDriver.viceCred,
            streakDays: effectiveDriver.streakDays,
            highBeamsOn: effectiveDriver.highBeamsOn,
            hazardsOn: effectiveDriver.hazardsOn,
            cabinUnlocked: effectiveDriver.cabinUnlocked,
            cabinCode: effectiveDriver.cabinCode ?? undefined,
          },
        };
      }

      const peer = otherRemotes[remoteCursor];
      if (peer) {
        remoteCursor++;
        return {
          spec,
          isLocal: false,
          isLivePeer: true,
          occupant: {
            ...peer,
            seatId: spec.stallId,
            row: spec.row,
            xPct: spec.leftPct / 100,
            zDepth: spec.zDepth,
          },
        };
      }

      return {
        spec,
        isLocal: false,
        isLivePeer: false,
        occupant: {
          seatId: spec.stallId,
          row: spec.row,
          slotIndex: 0,
          xPct: spec.leftPct / 100,
          zDepth: spec.zDepth,
          userId: `lot_${spec.stallId}`,
          username: spec.defaultHandle,
          vehicleType: spec.defaultVehicleType,
          badgeColor: spec.defaultColor,
          licensePlate: spec.defaultPlate,
          viceCred: spec.defaultCred,
          streakDays: spec.defaultStreak,
          highBeamsOn: Boolean(spec.defaultHighBeams),
          hazardsOn: false,
          cabinUnlocked: Boolean(spec.defaultCabinUnlocked),
          cabinCode: spec.defaultCabinCode,
        },
      };
    });
  }, [remoteVehicles, effectiveDriver]);

  const activeStallId = selectedStallId ?? hoveredStallId;
  const activeStall = useMemo(
    () => boundStalls.find((s) => s.spec.stallId === activeStallId) ?? null,
    [boundStalls, activeStallId]
  );

  return (
    <div
      onClick={() => setSelectedStallId(null)}
      className="relative w-full h-[250px] sm:h-[290px] lg:h-[325px] select-none overflow-visible"
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          1. 3-TIER CURVED AMPHITHEATER ASPHALT DECK & PERSPECTIVE STALL GRID
             Matches image6.png from Drive-In Platform Upgrade Strategy.docx
      ═══════════════════════════════════════════════════════════════════════ */}
      <svg
        viewBox="0 0 1200 360"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          {/* Wet asphalt radial sheen reflecting active screen aura */}
          <radialGradient id="lotAsphaltSheen" cx="50%" cy="0%" r="85%">
            <stop offset="0%" stopColor="#1b0938" stopOpacity="0.95" />
            <stop offset="48%" stopColor="#0b041c" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#04010c" stopOpacity="0.99" />
          </radialGradient>

          <linearGradient id="rowAGoldGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff007f" stopOpacity="0.15" />
            <stop offset="25%" stopColor="#ffdd00" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#00f3ff" stopOpacity="0.85" />
            <stop offset="75%" stopColor="#ffdd00" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ff007f" stopOpacity="0.15" />
          </linearGradient>

          <linearGradient id="rowBCyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.08" />
            <stop offset="20%" stopColor="#00f3ff" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#ff007f" stopOpacity="0.65" />
            <stop offset="80%" stopColor="#00f3ff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#00f3ff" stopOpacity="0.08" />
          </linearGradient>

          <linearGradient id="rowCPurpleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#bf00ff" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#00f3ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#bf00ff" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Base Amphitheater Bowl */}
        <path
          d="M 10,355 Q 600,320 1190,355 L 1140,18 Q 600,-8 60,18 Z"
          fill="url(#lotAsphaltSheen)"
          stroke="rgba(0,243,255,0.22)"
          strokeWidth="1.5"
        />

        {/* ── TIER 1 (ROW A) CURVED RAMP DECK ── */}
        <path
          d="M 110,115 Q 600,48 1090,115 L 1045,28 Q 600,-4 155,28 Z"
          fill="rgba(26, 8, 52, 0.55)"
          stroke="url(#rowAGoldGlow)"
          strokeWidth="2"
        />
        {/* Row A Stall Divider Lines */}
        {[280, 440, 600, 760, 920].map((x, idx) => (
          <line
            key={`div-a-${idx}`}
            x1={x}
            y1={18 + Math.abs(x - 600) * 0.03}
            x2={x + (x - 600) * 0.08}
            y2={75 + Math.abs(x - 600) * 0.06}
            stroke="rgba(255,221,0,0.24)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        ))}

        {/* ── TIER 2 (ROW B) CURVED RAMP DECK ── */}
        <path
          d="M 55,222 Q 600,138 1145,222 L 1095,122 Q 600,54 105,122 Z"
          fill="rgba(14, 6, 34, 0.65)"
          stroke="url(#rowBCyanGlow)"
          strokeWidth="2"
        />
        {/* Row B Stall Divider Lines */}
        {[215, 370, 525, 675, 830, 985].map((x, idx) => (
          <line
            key={`div-b-${idx}`}
            x1={x}
            y1={105 + Math.abs(x - 600) * 0.05}
            x2={x + (x - 600) * 0.1}
            y2={182 + Math.abs(x - 600) * 0.07}
            stroke="rgba(0,243,255,0.22)"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
        ))}

        {/* ── TIER 3 (ROW C) CURVED RAMP DECK ── */}
        <path
          d="M 15,342 Q 600,255 1185,342 L 1148,230 Q 600,146 52,230 Z"
          fill="rgba(8, 3, 22, 0.72)"
          stroke="url(#rowCPurpleGlow)"
          strokeWidth="1.8"
        />
        {/* Row C Stall Divider Lines */}
        {[175, 315, 455, 600, 745, 885, 1025].map((x, idx) => (
          <line
            key={`div-c-${idx}`}
            x1={x}
            y1={208 + Math.abs(x - 600) * 0.06}
            x2={x + (x - 600) * 0.11}
            y2={302 + Math.abs(x - 600) * 0.07}
            stroke="rgba(191,0,255,0.22)"
            strokeWidth="1.4"
            strokeDasharray="5 5"
          />
        ))}
      </svg>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. DIEGETIC AMPHITHEATER ROW CALLOUT LABELS (Matching Word Doc Diagram)
      ═══════════════════════════════════════════════════════════════════════ */}
      {/* Row A Callout Pill */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[1%] z-10 pointer-events-none">
        <div
          className="px-3 py-0.5 rounded-full flex items-center gap-2 whitespace-nowrap"
          style={{
            background: "rgba(9, 4, 24, 0.88)",
            border: "1px solid rgba(255,221,0,0.5)",
            boxShadow: "0 0 14px rgba(255,221,0,0.2)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#ffdd00] animate-pulse" />
          <span className="font-[family-name:var(--font-display)] font-black text-[8px] sm:text-[9px] tracking-[0.18em] text-[#ffdd00] uppercase">
            ROW A: MAIN FM TRANSMITTER AUDIO (DAILY STREAK HOLDERS)
          </span>
        </div>
      </div>

      {/* Row B Callout Pill */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[34%] z-10 pointer-events-none">
        <div
          className="px-3 py-0.5 rounded-full flex items-center gap-2 whitespace-nowrap"
          style={{
            background: "rgba(6, 8, 26, 0.88)",
            border: "1px solid rgba(0,243,255,0.45)",
            boxShadow: "0 0 12px rgba(0,243,255,0.18)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#00f3ff]" />
          <span className="font-[family-name:var(--font-display)] font-black text-[8px] sm:text-[9px] tracking-[0.16em] text-[#00f3ff] uppercase">
            ROW B: CREATOR &amp; SYNDICATE LOT • CAR CREW SPATIAL VOICE CABINS
          </span>
        </div>
      </div>

      {/* Row C Callout Pill */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[65%] z-10 pointer-events-none">
        <div
          className="px-3 py-0.5 rounded-full flex items-center gap-2 whitespace-nowrap"
          style={{
            background: "rgba(8, 4, 22, 0.85)",
            border: "1px solid rgba(255,0,127,0.4)",
          }}
        >
          <span className="font-[family-name:var(--font-display)] font-bold text-[7px] sm:text-[8px] tracking-[0.18em] text-[#ff007f] uppercase">
            ROW C: GENERAL ADMISSION VEHICLE FIELD
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          3. INTERACTIVE 3/4-PERSPECTIVE SYNTHWAVE VEHICLES ACROSS ALL 3 TIERS
      ═══════════════════════════════════════════════════════════════════════ */}
      {boundStalls.map(({ spec, occupant, isLocal }) => {
        const isHonking = activeHornSeatId === spec.stallId;
        const isSelected = activeStallId === spec.stallId;

        return (
          <div
            key={spec.stallId}
            onMouseEnter={() => setHoveredStallId(spec.stallId)}
            onMouseLeave={() =>
              setHoveredStallId((prev) => (prev === spec.stallId ? null : prev))
            }
            onClick={(e) => {
              e.stopPropagation();
              setSelectedStallId((prev) =>
                prev === spec.stallId ? null : spec.stallId
              );
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
            style={{
              left: `${spec.leftPct}%`,
              top: `${spec.topPct}%`,
              zIndex:
                spec.row === "A"
                  ? 15
                  : spec.row === "B"
                  ? 20
                  : 25,
            }}
          >
            <div
              className="relative transition-transform duration-200 group-hover:scale-105"
              style={{
                transform: `scale(${spec.scale}) rotate(${spec.beamAngleDeg * 0.35}deg)`,
              }}
            >
              {/* A. Volumetric High-Beam Headlight Cones Projecting Forward Toward Screen */}
              {occupant.highBeamsOn && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-[72%] pointer-events-none"
                  style={{
                    width: "150px",
                    height: "145px",
                    transformOrigin: "bottom center",
                    transform: `rotate(${spec.beamAngleDeg * 0.65}deg)`,
                    background:
                      "linear-gradient(to top, rgba(255,235,140,0.78) 0%, rgba(255,210,80,0.34) 48%, rgba(0,243,255,0.12) 82%, transparent 100%)",
                    clipPath: "polygon(34% 100%, 66% 100%, 100% 0%, 0% 0%)",
                    mixBlendMode: "screen",
                    filter: "blur(3px)",
                  }}
                />
              )}

              {/* B. Car Crew Spatial Voice Cabin Acoustic Waveform Ring (Matches image6.png) */}
              {occupant.cabinUnlocked && (
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ width: "136px", height: "76px" }}
                >
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                      border: "1.5px solid rgba(0, 243, 255, 0.85)",
                      boxShadow:
                        "0 0 18px rgba(0,243,255,0.55), inset 0 0 12px rgba(0,243,255,0.35)",
                    }}
                  />
                  <div
                    className="absolute -inset-2 rounded-full opacity-60 animate-ping"
                    style={{
                      border: "1px dashed rgba(0, 243, 255, 0.6)",
                      animationDuration: "2.6s",
                    }}
                  />
                </div>
              )}

              {/* C. 20–120 Hz Sub-Bass Reactive Neon Chassis Underglow */}
              <div
                className="absolute -inset-x-3 -bottom-2 h-6 rounded-full pointer-events-none transition-opacity duration-150"
                style={{
                  background: `radial-gradient(ellipse at center, ${occupant.badgeColor} 0%, ${occupant.badgeColor}66 52%, transparent 80%)`,
                  mixBlendMode: "screen",
                  opacity:
                    isLocal || isSelected
                      ? "calc(0.62 + var(--vice-sub-bass, 0.28) * 0.38)"
                      : "calc(0.38 + var(--vice-sub-bass, 0.28) * 0.42)",
                  filter: "blur(5px)",
                }}
              />

              {/* D. 3/4-Rear-Perspective Synthwave Vehicle SVG */}
              <PerspectiveVehicleSvg
                vehicleType={occupant.vehicleType}
                accentColor={occupant.badgeColor}
                licensePlate={occupant.licensePlate}
                hazardsOn={occupant.hazardsOn}
                highBeamsOn={occupant.highBeamsOn}
                isRowA={spec.row === "A"}
                isLocal={isLocal}
              />

              {/* E. 3D Spatial Horn Sonic Ripple */}
              {isHonking && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
                  <div
                    className="w-20 h-20 rounded-full border-2 animate-ping"
                    style={{
                      borderColor: occupant.badgeColor,
                      boxShadow: `0 0 22px ${occupant.badgeColor}`,
                    }}
                  />
                  <span
                    className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded font-[family-name:var(--font-display)] font-black text-[9px] whitespace-nowrap"
                    style={{
                      background: "rgba(5, 6, 20, 0.94)",
                      color: occupant.badgeColor,
                      border: `1px solid ${occupant.badgeColor}`,
                    }}
                  >
                    🔊 HONK!
                  </span>
                </div>
              )}

              {/* F. Floating Driver Handle & Status Pill */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 -top-4 flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap transition-all duration-150 pointer-events-none ${
                  isLocal ||
                  occupant.highBeamsOn ||
                  occupant.cabinUnlocked ||
                  isSelected
                    ? "opacity-100 scale-100"
                    : "opacity-75 group-hover:opacity-100 scale-95 group-hover:scale-100"
                }`}
                style={{
                  background: "rgba(6, 7, 23, 0.9)",
                  border: `1px solid ${
                    isLocal ? "#39ff14" : occupant.badgeColor
                  }99`,
                  boxShadow: `0 0 10px ${
                    isLocal ? "#39ff1455" : `${occupant.badgeColor}44`
                  }`,
                }}
              >
                {isLocal && (
                  <span
                    className="font-[family-name:var(--font-display)] font-black text-[7px] px-1 rounded"
                    style={{ background: "#39ff14", color: "#030510" }}
                  >
                    YOU
                  </span>
                )}
                <span
                  className="font-[family-name:var(--font-display)] font-bold tracking-wider text-[8px]"
                  style={{ color: occupant.badgeColor }}
                >
                  {occupant.username}
                </span>
                {occupant.highBeamsOn && <span className="text-[8px]">💡</span>}
                {occupant.hazardsOn && <span className="text-[8px]">⚠️</span>}
                {occupant.cabinUnlocked && (
                  <span
                    className="text-[7px] font-mono px-1 rounded bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40"
                    title="Car Crew Spatial Voice Cabin Active"
                  >
                    📻 CREW
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ═══════════════════════════════════════════════════════════════════════
          4. HOVER / CLICK CYBERPUNK DRIVER HUD CARD (GlassPanel.tsx)
      ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {activeStall && (
          <motion.div
            key={activeStall.spec.stallId}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onMouseEnter={() => setHoveredStallId(activeStall.spec.stallId)}
            onMouseLeave={() => setHoveredStallId(null)}
            onClick={(e) => e.stopPropagation()}
            className="absolute z-40 pointer-events-auto"
            style={{
              left: `${Math.min(72, Math.max(6, activeStall.spec.leftPct - 10))}%`,
              bottom: `${Math.min(
                52,
                Math.max(12, 100 - activeStall.spec.topPct + 6)
              )}%`,
              width: "min(275px, 78vw)",
            }}
          >
            {(() => {
              const { spec, occupant, isLocal } = activeStall;
              const rank = getScoutRank(occupant.viceCred, occupant.streakDays);

              return (
                <GlassPanel
                  neonBorder={spec.row === "A" ? "pink" : "cyan"}
                  className="p-3 flex flex-col gap-2 bg-[#07081a]/95"
                >
                  {/* Top Row: Stall Tier + Custom License Plate */}
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="font-[family-name:var(--font-display)] font-black tracking-widest uppercase text-[8px]"
                      style={{
                        color: spec.row === "A" ? "#ffdd00" : "#00f3ff",
                      }}
                    >
                      {spec.label}
                    </span>
                    <span
                      className="font-[family-name:var(--font-display)] font-black tracking-widest px-1.5 py-0.5 rounded text-[8px]"
                      style={{
                        background:
                          "linear-gradient(180deg, #1b0b2e 0%, #090414 100%)",
                        color: "#ffdd00",
                        border: "1px solid rgba(255,221,0,0.5)",
                      }}
                    >
                      {occupant.licensePlate}
                    </span>
                  </div>

                  {/* Driver Identity & Synthwave Chassis */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="font-[family-name:var(--font-display)] font-bold truncate text-xs"
                          style={{
                            color: occupant.badgeColor,
                            textShadow: `0 0 8px ${occupant.badgeColor}66`,
                          }}
                        >
                          {occupant.username}
                        </span>
                        {isLocal && (
                          <span className="text-[8px] font-mono bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40 px-1 rounded">
                            YOUR RIDE
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/70 font-[family-name:var(--font-chat)] truncate">
                        {VEHICLE_LABELS[occupant.vehicleType] ??
                          VEHICLE_LABELS.default}
                      </p>
                    </div>
                  </div>

                  {/* Scout Rank, Vice Cred & Attendance Streak */}
                  <div className="flex items-center justify-between text-[9px] font-[family-name:var(--font-chat)] bg-black/60 rounded px-2 py-1 border border-white/10">
                    <span style={{ color: rank.color }}>
                      {rank.badge} {rank.title}
                    </span>
                    <span className="text-[#ffdd00] font-bold">
                      {occupant.viceCred} CRED • 🔥{occupant.streakDays}d
                    </span>
                  </div>

                  {/* Row A 48-Hour Tow-Truck Impound Timer (if Row A) */}
                  {spec.row === "A" && (
                    <div className="flex items-center justify-between text-[8px] font-[family-name:var(--font-chat)] px-2 py-0.5 rounded bg-[#ffdd00]/10 border border-[#ffdd00]/30 text-[#ffdd00]">
                      <span>🚚 ROW A VIP LEASE</span>
                      <span>
                        ⏳ Tow Check:{" "}
                        {isLocal
                          ? `${effectiveDriver.hoursUntilRowATow ?? 48}h left`
                          : "42h left"}
                      </span>
                    </div>
                  )}

                  {/* Interactive Vehicle Controls */}
                  {isLocal ? (
                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onToggleLocalHighBeams?.()}
                        className="px-1.5 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer transition-all"
                        style={{
                          background: occupant.highBeamsOn
                            ? "rgba(255,221,0,0.25)"
                            : "rgba(255,255,255,0.06)",
                          color: occupant.highBeamsOn ? "#ffdd00" : "#ffffffcc",
                          border: occupant.highBeamsOn
                            ? "1px solid #ffdd00"
                            : "1px solid rgba(255,255,255,0.15)",
                        }}
                      >
                        💡 Beam
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onHonkHorn?.(spec.panX, spec.zDepth, spec.stallId)
                        }
                        className="px-1.5 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-white/5 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/30"
                      >
                        🔊 Horn
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleLocalHazards?.()}
                        className="px-1.5 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer transition-all"
                        style={{
                          background: occupant.hazardsOn
                            ? "rgba(255,107,0,0.28)"
                            : "rgba(255,255,255,0.06)",
                          color: occupant.hazardsOn ? "#ff6b00" : "#ffffffcc",
                          border: occupant.hazardsOn
                            ? "1px solid #ff6b00"
                            : "1px solid rgba(255,255,255,0.15)",
                        }}
                      >
                        ⚠️ Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenCabinDrawer?.()}
                        className="px-1.5 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-[#ff007f]/20 hover:bg-[#ff007f]/35 text-[#ff007f] border border-[#ff007f]/40"
                      >
                        📻 Cabin
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onHonkHorn?.(spec.panX, spec.zDepth, spec.stallId)
                        }
                        className="flex-1 px-2 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-[#00f3ff]/15 hover:bg-[#00f3ff]/30 text-[#00f3ff] border border-[#00f3ff]/35"
                      >
                        🔊 Salute Honk
                      </button>
                      {occupant.cabinUnlocked && occupant.cabinCode && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCabinDrawer?.(occupant.cabinCode)
                          }
                          className="flex-1 px-2 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-[#39ff14]/15 hover:bg-[#39ff14]/30 text-[#39ff14] border border-[#39ff14]/40"
                        >
                          📻 Hop In ({occupant.cabinCode})
                        </button>
                      )}
                    </div>
                  )}
                </GlassPanel>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 3/4-Rear-Perspective Synthwave Vehicle Renderer ────────────────────────
// Renders distinct, high-contrast 80s Vice City vehicles facing the Drive-In Screen
function PerspectiveVehicleSvg({
  vehicleType,
  accentColor,
  licensePlate,
  hazardsOn,
  highBeamsOn,
  isRowA,
  isLocal,
}: {
  vehicleType: VehicleType;
  accentColor: string;
  licensePlate: string;
  hazardsOn: boolean;
  highBeamsOn: boolean;
  isRowA: boolean;
  isLocal: boolean;
}) {
  const tailColor = hazardsOn ? "#ff8800" : "#ff0055";
  const trimStroke = isRowA ? "#ffdd00" : accentColor;

  return (
    <svg
      width="96"
      height="54"
      viewBox="0 0 96 54"
      fill="none"
      className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.85)]"
    >
      {/* Left & Right Rear Tires */}
      <rect x="10" y="34" width="14" height="16" rx="3" fill="#05030a" stroke="#221538" strokeWidth="1" />
      <rect x="72" y="34" width="14" height="16" rx="3" fill="#05030a" stroke="#221538" strokeWidth="1" />

      {/* Lower Rear Diffuser & Exhausts */}
      <path
        d="M 14,42 L 82,42 L 78,48 L 18,48 Z"
        fill="#080412"
        stroke={accentColor}
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <circle cx="25" cy="45" r="2.2" fill="#1f1a2e" stroke="#00f3ff" strokeWidth="0.8" />
      <circle cx="30" cy="45" r="2.2" fill="#1f1a2e" stroke="#00f3ff" strokeWidth="0.8" />
      <circle cx="66" cy="45" r="2.2" fill="#1f1a2e" stroke="#00f3ff" strokeWidth="0.8" />
      <circle cx="71" cy="45" r="2.2" fill="#1f1a2e" stroke="#00f3ff" strokeWidth="0.8" />

      {/* Main Rear Fenders & Widebody Chassis */}
      <path
        d={
          vehicleType === "truck"
            ? "M 12,20 L 84,20 L 86,42 L 10,42 Z"
            : "M 16,22 L 80,22 L 86,42 L 10,42 Z"
        }
        fill="#0e0620"
        stroke={trimStroke}
        strokeWidth={isLocal || isRowA ? "1.6" : "1.2"}
      />

      {/* Upper Cabin / Roofline / Rear Louvers */}
      <path
        d={
          vehicleType === "truck"
            ? "M 24,8 L 72,8 L 76,20 L 20,20 Z"
            : "M 22,9 L 74,9 L 80,22 L 16,22 Z"
        }
        fill="#160a30"
        stroke={accentColor}
        strokeWidth="1.2"
      />

      {/* Rear Window Glass + Synthwave Louvers */}
      <path
        d="M 25,11 L 71,11 L 75,20 L 21,20 Z"
        fill="#070d24"
        stroke="rgba(0,243,255,0.4)"
        strokeWidth="0.8"
      />
      <line x1="24" y1="14" x2="72" y2="14" stroke={accentColor} strokeOpacity="0.45" strokeWidth="1" />
      <line x1="23" y1="17" x2="73" y2="17" stroke={accentColor} strokeOpacity="0.45" strokeWidth="1" />

      {/* Vehicle-Specific Aero / Lightbar Details */}
      {vehicleType === "sports_car" && (
        /* Countach / Vice GT Elevated Wing */
        <path
          d="M 12,18 L 84,18 L 82,21 L 14,21 Z"
          fill="#090314"
          stroke="#ffdd00"
          strokeWidth="1.2"
        />
      )}
      {vehicleType === "vice_pd" && (
        /* Vice PD Roof Lightbar (Red / Blue Neon) */
        <g>
          <rect x="31" y="4" width="16" height="4" rx="1.5" fill="#ff0055" />
          <rect x="49" y="4" width="16" height="4" rx="1.5" fill="#00f3ff" />
        </g>
      )}
      {vehicleType === "synth_coupe" && (
        /* Outrun Gullwing Center Spine */
        <line x1="48" y1="9" x2="48" y2="22" stroke="#00f3ff" strokeWidth="1.5" />
      )}

      {/* Rear Taillight Fascia Panel */}
      <rect
        x="14"
        y="26"
        width="68"
        height="9"
        rx="2"
        fill="#06020e"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.8"
      />

      {/* Dual Glowing Outrun Taillight Bars */}
      <rect
        x="16"
        y="28"
        width="20"
        height="5"
        rx="1"
        fill={tailColor}
        className={hazardsOn ? "animate-ping" : ""}
      />
      <rect
        x="60"
        y="28"
        width="20"
        height="5"
        rx="1"
        fill={tailColor}
        className={hazardsOn ? "animate-ping" : ""}
      />
      {/* Neon Horizon Taillight Strip */}
      <line
        x1="16"
        y1="27"
        x2="80"
        y2="27"
        stroke={highBeamsOn ? "#ffdd00" : accentColor}
        strokeWidth="1.2"
      />

      {/* Custom License Plate in Rear Fascia */}
      <rect
        x="38"
        y="27"
        width="20"
        height="7"
        rx="1"
        fill="#120824"
        stroke="#ffdd00"
        strokeWidth="0.8"
      />
      <text
        x="48"
        y="32.2"
        textAnchor="middle"
        fill="#ffdd00"
        fontSize="4.2"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {licensePlate.slice(0, 7)}
      </text>
    </svg>
  );
}
