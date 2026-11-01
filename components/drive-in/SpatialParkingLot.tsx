"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RoomVehiclePresence, VehicleType, LotRow } from "@/lib/realtime/party-protocol";
import { getScoutRank } from "@/lib/economy/vice-cred";

// ─── Painted Lot Topology (1408 × 768 Artwork Coordinates) ──────────────────
// Maps directly onto the 9 painted vehicles in public/images/drive-in-background.jpg
// so every car in the artwork has a live sub-bass underglow, volumetric high-beams,
// hazard blinkers, 3D spatial horn ripples, and a hoverable GlassPanel Driver HUD.

export interface PaintedStallSpec {
  stallId: string;
  row: LotRow;
  label: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  panX: number;       // -1 (far left) .. +1 (far right) for Web Audio StereoPannerNode
  zDepth: number;     // 0.2 (front) .. 0.85 (back) for distance attenuation
  beamAngleDeg: number;
  defaultVehicleType: VehicleType;
  defaultColor: string;
  defaultHandle: string;
  defaultPlate: string;
  defaultCred: number;
  defaultStreak: number;
}

export const PAINTED_LOT_STALLS: PaintedStallSpec[] = [
  {
    stallId: "A-1",
    row: "A",
    label: "ROW A • FRONT CENTER VIP",
    leftPct: 39.2,
    topPct: 70.6,
    widthPct: 21.8,
    heightPct: 16.2,
    panX: 0.0,
    zDepth: 0.2,
    beamAngleDeg: 0,
    defaultVehicleType: "sports_car",
    defaultColor: "#ff007f",
    defaultHandle: "Lucia_VI",
    defaultPlate: "VICE-001",
    defaultCred: 420,
    defaultStreak: 12,
  },
  {
    stallId: "A-0",
    row: "A",
    label: "ROW A • LEFT MUSCLE",
    leftPct: 20.1,
    topPct: 68.4,
    widthPct: 19.3,
    heightPct: 18.2,
    panX: -0.42,
    zDepth: 0.24,
    beamAngleDeg: 11,
    defaultVehicleType: "muscle_car",
    defaultColor: "#00f3ff",
    defaultHandle: "Jason_Keys",
    defaultPlate: "LEON-305",
    defaultCred: 260,
    defaultStreak: 8,
  },
  {
    stallId: "A-2",
    row: "A",
    label: "ROW A • RIGHT PICKUP",
    leftPct: 61.5,
    topPct: 65.8,
    widthPct: 19.6,
    heightPct: 20.8,
    panX: 0.42,
    zDepth: 0.24,
    beamAngleDeg: -11,
    defaultVehicleType: "truck",
    defaultColor: "#39ff14",
    defaultHandle: "GatorScout",
    defaultPlate: "GLAD-88",
    defaultCred: 195,
    defaultStreak: 7,
  },
  {
    stallId: "B-0",
    row: "B",
    label: "ROW B • WEST WING COUPE",
    leftPct: 0.8,
    topPct: 70.5,
    widthPct: 26.5,
    heightPct: 27.5,
    panX: -0.78,
    zDepth: 0.45,
    beamAngleDeg: 20,
    defaultVehicleType: "synth_coupe",
    defaultColor: "#ff6b00",
    defaultHandle: "OceanDrive86",
    defaultPlate: "OUTR-1986",
    defaultCred: 115,
    defaultStreak: 5,
  },
  {
    stallId: "B-3",
    row: "B",
    label: "ROW B • EAST WING GT",
    leftPct: 72.5,
    topPct: 71.2,
    widthPct: 26.8,
    heightPct: 27.0,
    panX: 0.78,
    zDepth: 0.45,
    beamAngleDeg: -20,
    defaultVehicleType: "sports_car",
    defaultColor: "#bf00ff",
    defaultHandle: "StarIsland",
    defaultPlate: "SYND-777",
    defaultCred: 140,
    defaultStreak: 6,
  },
  {
    stallId: "B-1",
    row: "B",
    label: "ROW B • MID-LEFT CRUISER",
    leftPct: 7.4,
    topPct: 66.8,
    widthPct: 15.6,
    heightPct: 10.6,
    panX: -0.64,
    zDepth: 0.56,
    beamAngleDeg: 15,
    defaultVehicleType: "lowrider",
    defaultColor: "#ffdd00",
    defaultHandle: "LittleHaiti",
    defaultPlate: "HYDR-404",
    defaultCred: 85,
    defaultStreak: 4,
  },
  {
    stallId: "B-2",
    row: "B",
    label: "ROW B • MID-RIGHT RIG",
    leftPct: 77.2,
    topPct: 66.0,
    widthPct: 14.2,
    heightPct: 12.2,
    panX: 0.64,
    zDepth: 0.56,
    beamAngleDeg: -15,
    defaultVehicleType: "truck",
    defaultColor: "#ffdd00",
    defaultHandle: "PortGellhorn",
    defaultPlate: "PORT-502",
    defaultCred: 70,
    defaultStreak: 3,
  },
  {
    stallId: "C-0",
    row: "C",
    label: "ROW C • OVERFLOW WEST",
    leftPct: 0.3,
    topPct: 66.6,
    widthPct: 7.0,
    heightPct: 6.4,
    panX: -0.92,
    zDepth: 0.82,
    beamAngleDeg: 24,
    defaultVehicleType: "muscle_car",
    defaultColor: "#00f3ff",
    defaultHandle: "NightCaller",
    defaultPlate: "FM-886",
    defaultCred: 40,
    defaultStreak: 2,
  },
  {
    stallId: "C-1",
    row: "C",
    label: "ROW C • OVERFLOW EAST",
    leftPct: 91.5,
    topPct: 67.2,
    widthPct: 8.0,
    heightPct: 6.4,
    panX: 0.92,
    zDepth: 0.82,
    beamAngleDeg: -24,
    defaultVehicleType: "vice_pd",
    defaultColor: "#ff4444",
    defaultHandle: "VicePD_Unit4",
    defaultPlate: "VCPD-911",
    defaultCred: 310,
    defaultStreak: 9,
  },
];

const VEHICLE_LABELS: Record<string, string> = {
  muscle_car: "🚗 Muscle Challenger",
  sports_car: "🏎️ Vice GT Exotic",
  truck: "🚛 Leonida 4x4 Pickup",
  synth_coupe: "⚡ Outrun Synth Coupe",
  lowrider: "🌴 Hydraulic Lowrider",
  vice_pd: "🚓 Vice PD Interceptor",
  default: "🚙 Vice Cruiser",
};

export interface LocalDriverSpec {
  userId: string;
  username: string;
  vehicleType: VehicleType;
  badgeColor: string;
  licensePlate: string;
  viceCred: number;
  streakDays: number;
  highBeamsOn: boolean;
  hazardsOn: boolean;
  cabinUnlocked: boolean;
  cabinCode: string | null;
}

interface SpatialParkingLotProps {
  remoteVehicles: RoomVehiclePresence[];
  localDriver: LocalDriverSpec;
  activeHornSeatId: string | null;
  onToggleLocalHighBeams: () => void;
  onToggleLocalHazards: () => void;
  onHonkHorn: (panX: number, zDepth: number, seatId: string) => void;
  onOpenCabinDrawer: (joinCode?: string) => void;
}

interface BoundStall {
  spec: PaintedStallSpec;
  occupant: RoomVehiclePresence;
  isLocal: boolean;
  isLivePeer: boolean;
}

export default function SpatialParkingLot({
  remoteVehicles,
  localDriver,
  activeHornSeatId,
  onToggleLocalHighBeams,
  onToggleLocalHazards,
  onHonkHorn,
  onOpenCabinDrawer,
}: SpatialParkingLotProps) {
  const [selectedStallId, setSelectedStallId] = useState<string | null>(null);
  const [hoveredStallId, setHoveredStallId] = useState<string | null>(null);

  const boundStalls = useMemo<BoundStall[]>(() => {
    const qualifiesRowA =
      localDriver.streakDays >= 7 || localDriver.viceCred >= 100;
    // Local driver gets A-1 (Front Center Hero) when qualified for Row A, else A-0 (Front Left Muscle)
    const myPreferredStallId = qualifiesRowA ? "A-1" : "A-0";

    const otherRemotes = remoteVehicles.filter(
      (v) => v.userId !== localDriver.userId
    );
    let remoteCursor = 0;

    return PAINTED_LOT_STALLS.map((spec) => {
      if (spec.stallId === myPreferredStallId) {
        return {
          spec,
          isLocal: true,
          isLivePeer: true,
          occupant: {
            seatId: spec.stallId,
            row: spec.row,
            slotIndex: 0,
            xPct: (spec.leftPct + spec.widthPct / 2) / 100,
            zDepth: spec.zDepth,
            userId: localDriver.userId,
            username: localDriver.username,
            vehicleType: localDriver.vehicleType,
            badgeColor: localDriver.badgeColor,
            licensePlate: localDriver.licensePlate,
            viceCred: localDriver.viceCred,
            streakDays: localDriver.streakDays,
            highBeamsOn: localDriver.highBeamsOn,
            hazardsOn: localDriver.hazardsOn,
            cabinUnlocked: localDriver.cabinUnlocked,
            cabinCode: localDriver.cabinCode ?? undefined,
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
            xPct: (spec.leftPct + spec.widthPct / 2) / 100,
            zDepth: spec.zDepth,
          },
        };
      }

      // Ambient parked regular so all 9 painted cars in the artwork are inspectable
      return {
        spec,
        isLocal: false,
        isLivePeer: false,
        occupant: {
          seatId: spec.stallId,
          row: spec.row,
          slotIndex: 0,
          xPct: (spec.leftPct + spec.widthPct / 2) / 100,
          zDepth: spec.zDepth,
          userId: `lot_${spec.stallId}`,
          username: spec.defaultHandle,
          vehicleType: spec.defaultVehicleType,
          badgeColor: spec.defaultColor,
          licensePlate: spec.defaultPlate,
          viceCred: spec.defaultCred,
          streakDays: spec.defaultStreak,
          highBeamsOn: false,
          hazardsOn: false,
        },
      };
    });
  }, [remoteVehicles, localDriver]);

  const activeStallId = selectedStallId ?? hoveredStallId;
  const activeStall = useMemo(
    () => boundStalls.find((s) => s.spec.stallId === activeStallId) ?? null,
    [boundStalls, activeStallId]
  );

  return (
    <>
      {/* ── Interactive Hitboxes, Sub-Bass Underglows, High-Beams & Hazards ── */}
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
            className="absolute z-[16] cursor-pointer group"
            style={{
              left: `${spec.leftPct}%`,
              top: `${spec.topPct}%`,
              width: `${spec.widthPct}%`,
              height: `${spec.heightPct}%`,
            }}
          >
            {/* 1. 20-120 Hz Sub-Bass Reactive Chassis Underglow */}
            <div
              className="absolute pointer-events-none transition-opacity duration-150"
              style={{
                left: "8%",
                right: "8%",
                bottom: "3%",
                height: "24%",
                borderRadius: "9999px",
                background: `radial-gradient(ellipse at center, ${occupant.badgeColor} 0%, ${occupant.badgeColor}55 48%, transparent 78%)`,
                mixBlendMode: "screen",
                opacity: isLocal || isSelected
                  ? "calc(0.45 + var(--vice-sub-bass, 0.25) * 0.55)"
                  : "calc(0.22 + var(--vice-sub-bass, 0.25) * 0.45)",
                filter: "blur(6px)",
              }}
            />

            {/* 2. Volumetric High-Beam Cones Projected Toward Screen */}
            {occupant.highBeamsOn && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: "12%",
                  right: "12%",
                  bottom: "62%",
                  height: "210%",
                  transformOrigin: "bottom center",
                  transform: `rotate(${spec.beamAngleDeg}deg)`,
                  background:
                    "linear-gradient(to top, rgba(255,250,210,0.68) 0%, rgba(0,243,255,0.28) 45%, transparent 100%)",
                  clipPath: "polygon(32% 100%, 68% 100%, 100% 0%, 0% 0%)",
                  mixBlendMode: "screen",
                  filter: "blur(3px)",
                }}
              />
            )}

            {/* 3. Hazard Blinkers on Taillights */}
            {occupant.hazardsOn && (
              <>
                <span
                  className="absolute animate-ping rounded-full pointer-events-none"
                  style={{
                    left: "16%",
                    top: "48%",
                    width: "12px",
                    height: "12px",
                    background: "#ff6b00",
                    boxShadow: "0 0 16px #ff6b00, 0 0 28px #ff007f",
                  }}
                />
                <span
                  className="absolute animate-ping rounded-full pointer-events-none"
                  style={{
                    right: "16%",
                    top: "48%",
                    width: "12px",
                    height: "12px",
                    background: "#ff6b00",
                    boxShadow: "0 0 16px #ff6b00, 0 0 28px #ff007f",
                  }}
                />
              </>
            )}

            {/* 4. 3D Spatial Horn Sonic Ripple */}
            {isHonking && (
              <div
                className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ zIndex: 25 }}
              >
                <div
                  className="w-16 h-16 rounded-full border-2 animate-ping"
                  style={{
                    borderColor: occupant.badgeColor,
                    boxShadow: `0 0 20px ${occupant.badgeColor}`,
                  }}
                />
                <span
                  className="absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded font-[family-name:var(--font-display)] font-black text-[9px] whitespace-nowrap"
                  style={{
                    background: "rgba(5, 6, 20, 0.9)",
                    color: occupant.badgeColor,
                    border: `1px solid ${occupant.badgeColor}`,
                  }}
                >
                  🔊 HONK!
                </span>
              </div>
            )}

            {/* 5. Floating Driver Tag Pill (Always visible on your own car or active cars, subtle on hover for others) */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 -top-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap transition-all duration-150 pointer-events-none ${
                isLocal || occupant.highBeamsOn || occupant.hazardsOn || isSelected
                  ? "opacity-100 scale-100"
                  : "opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100"
              }`}
              style={{
                background: "rgba(6, 7, 23, 0.88)",
                border: `1px solid ${
                  isLocal ? "#39ff14" : occupant.badgeColor
                }88`,
                boxShadow: `0 0 10px ${
                  isLocal ? "#39ff1444" : `${occupant.badgeColor}44`
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
                className="font-[family-name:var(--font-display)] font-bold tracking-wider"
                style={{
                  fontSize: "clamp(6px,0.6vw,9px)",
                  color: occupant.badgeColor,
                }}
              >
                {occupant.username}
              </span>
              {occupant.highBeamsOn && <span className="text-[8px]">💡</span>}
              {occupant.hazardsOn && <span className="text-[8px]">⚠️</span>}
              {occupant.cabinUnlocked && <span className="text-[8px]">📻</span>}
            </div>
          </div>
        );
      })}

      {/* ── Hover / Click Cyberpunk Driver HUD Card (GlassPanel) ──────────── */}
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
            className="absolute z-[38] pointer-events-auto"
            style={{
              left: `${Math.min(72, Math.max(4, activeStall.spec.leftPct))}%`,
              bottom: `${Math.min(
                42,
                Math.max(14, 100 - activeStall.spec.topPct + 1.5)
              )}%`,
              width: "min(255px, 68vw)",
            }}
          >
            {(() => {
              const { spec, occupant, isLocal } = activeStall;
              const rank = getScoutRank(occupant.viceCred, occupant.streakDays);

              return (
                <div
                  className="rounded-lg p-2.5 flex flex-col gap-1.5"
                  style={{
                    background: "rgba(7, 8, 26, 0.94)",
                    backdropFilter: "blur(10px)",
                    border: `1px solid ${occupant.badgeColor}77`,
                    boxShadow: `0 0 24px ${occupant.badgeColor}33, inset 0 0 12px rgba(0,243,255,0.08)`,
                  }}
                >
                  {/* Top Row: Stall Label + License Plate */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="font-[family-name:var(--font-display)] font-black tracking-widest uppercase"
                      style={{
                        fontSize: "8px",
                        color: spec.row === "A" ? "#ffdd00" : "#00f3ffaa",
                      }}
                    >
                      {spec.label}
                    </span>
                    <span
                      className="font-[family-name:var(--font-display)] font-black tracking-widest px-1.5 py-0.5 rounded"
                      style={{
                        fontSize: "8px",
                        background: "linear-gradient(180deg, #1b0b2e 0%, #090414 100%)",
                        color: "#ffdd00",
                        border: "1px solid rgba(255,221,0,0.45)",
                      }}
                    >
                      {occupant.licensePlate}
                    </span>
                  </div>

                  {/* Driver Identity & Vehicle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className="font-[family-name:var(--font-display)] font-bold truncate"
                          style={{
                            fontSize: "12px",
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
                      <p className="text-[10px] text-white/65 font-[family-name:var(--font-chat)] truncate">
                        {VEHICLE_LABELS[occupant.vehicleType] ?? VEHICLE_LABELS.default}
                      </p>
                    </div>
                  </div>

                  {/* Scout Rank, Vice Cred & Streak */}
                  <div className="flex items-center justify-between text-[9px] font-[family-name:var(--font-chat)] bg-black/50 rounded px-2 py-1 border border-white/10">
                    <span style={{ color: rank.color }}>
                      {rank.badge} {rank.title}
                    </span>
                    <span className="text-[#ffdd00] font-bold">
                      {occupant.viceCred} CRED • 🔥{occupant.streakDays}d
                    </span>
                  </div>

                  {/* Action Controls */}
                  {isLocal ? (
                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={onToggleLocalHighBeams}
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
                          onHonkHorn(spec.panX, spec.zDepth, spec.stallId)
                        }
                        className="px-1.5 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-white/5 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/30"
                      >
                        🔊 Horn
                      </button>
                      <button
                        type="button"
                        onClick={onToggleLocalHazards}
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
                        onClick={() => onOpenCabinDrawer()}
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
                          onHonkHorn(spec.panX, spec.zDepth, spec.stallId)
                        }
                        className="flex-1 px-2 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-[#00f3ff]/15 hover:bg-[#00f3ff]/30 text-[#00f3ff] border border-[#00f3ff]/35"
                      >
                        🔊 Salute Honk
                      </button>
                      {occupant.cabinUnlocked && occupant.cabinCode && (
                        <button
                          type="button"
                          onClick={() => onOpenCabinDrawer(occupant.cabinCode)}
                          className="flex-1 px-2 py-1 rounded text-[9px] font-[family-name:var(--font-display)] font-bold uppercase cursor-pointer bg-[#39ff14]/15 hover:bg-[#39ff14]/30 text-[#39ff14] border border-[#39ff14]/40"
                        >
                          📻 Hop In ({occupant.cabinCode})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
