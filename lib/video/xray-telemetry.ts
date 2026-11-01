// ─── Layer 3: Bi-Directional <track kind="metadata"> X-Ray Telemetry Engine ───
// Generates deterministic, time-coded WebVTT / JSON cue sheets for every clip
// in the Leonida Vice broadcast catalog so that every second of video playback
// drives live updates across:
//   1. The 2D/Vector Leonida Interactive Radar (6 counties, camera frustum, coords)
//   2. The Vehicle & Weapon "X-Ray Asset Drawer" (Trunk gun locker, HSW, hacking gear)
//   3. The Character Relationship & Parody Economy Ticker (CrashPad, RydeMe, What-Up!)
//   4. The 4-Block GEO Spec Table & Take-Two Provenance Taxonomy

import type { VideoItem } from "./types";

export type LeonidaRegionId =
  | "vice-city"
  | "leonida-keys"
  | "grassrivers"
  | "port-gellhorn"
  | "ambrosia"
  | "mount-kalaga";

export type ProvenanceBadge = "CONFIRMED" | "LEAK_ARCHIVE" | "SPECULATION";

export interface XRayLocationTelemetry {
  regionId: LeonidaRegionId;
  regionName: string;
  subdistrict: string;
  landmark: string;
  /** Normalized 0-100 coordinates on the Leonida Tactical Radar */
  radarX: number;
  radarY: number;
  /** Display coordinates in Leonida Vice grid format */
  latLngLabel: string;
  /** Camera compass bearing in degrees (0-360) */
  bearingDeg: number;
  weather: string;
}

export interface XRayVehicleAsset {
  id: string;
  name: string;
  manufacturer: string;
  vehicleClass: string;
  estTopSpeedMph: number;
  trunkLockerSlots: number;
  hswUpgradeable: boolean;
  interiorFeature: string;
  provenance: ProvenanceBadge;
}

export interface XRayWeaponOrGearAsset {
  id: string;
  name: string;
  category: "Primary Longarm (Trunk)" | "Sidearm (Holster)" | "Lucia Tactical Hacking Gear" | "Improvised / Melee";
  carryLimitNote: string;
  tacticalEffect: string;
  provenance: ProvenanceBadge;
}

export interface XRayCharacterTelemetry {
  name: string;
  role: string;
  attitude: "Pragmatic / Cool-Headed" | "Aggressive / Unfiltered" | "High-Alert / Evading" | "Undercover / Observational";
  relationshipSyncPct: number;
  activeMechanic: string;
}

export interface XRayEconomyAppTicker {
  appName: "CrashPad" | "RydeMe" | "What-Up!" | "BuckMe" | "Lawn & Order";
  category: string;
  liveMetricLabel: string;
  liveMetricValue: string;
}

export interface XRayMetadataCue {
  id: string;
  startTime: number;
  endTime: number;
  cueTitle: string;
  forensicNote: string;
  provenance: ProvenanceBadge;
  location: XRayLocationTelemetry;
  vehicle: XRayVehicleAsset;
  weaponOrGear: XRayWeaponOrGearAsset;
  character: XRayCharacterTelemetry;
  economyTicker: XRayEconomyAppTicker;
  radioTrack?: {
    station: string;
    trackTitle: string;
    artist: string;
  };
  relatedArticleSlug: string;
  relatedArticleTitle: string;
}

export interface CapturedForensicFrame {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampSec: number;
  timestampFormatted: string;
  frameNumber: number;
  fps: number;
  dataUrl: string;
  width: number;
  height: number;
  regionName: string;
  cueTitle: string;
  annotationNote?: string;
  createdAt: string;
}

export interface LeonidaRegionPin {
  id: LeonidaRegionId;
  name: string;
  code: string;
  radarX: number;
  radarY: number;
  summary: string;
  signatureVehicle: string;
  defaultSeekSec: number;
  articleSlug: string;
}

export const LEONIDA_REGION_PINS: LeonidaRegionPin[] = [
  {
    id: "vice-city",
    name: "Vice City Metro",
    code: "VC-305",
    radarX: 76,
    radarY: 58,
    summary: "Ocean Beach Art Deco neon strip, Crosstown Megaproject cranes, Club Jack of Hearts, and Venetian islands.",
    signatureVehicle: "Pfister Comet S2 Cabrio",
    defaultSeekSec: 4,
    articleSlug: "vice-city-ocean-beach-to-little-haiti-district-guide",
  },
  {
    id: "leonida-keys",
    name: "Leonida Keys",
    code: "LK-001",
    radarX: 62,
    radarY: 86,
    summary: "Tropical island chain linked by the Overseas Highway bridges, shallow coral reefs, smuggling marinas, and seaplane docks.",
    signatureVehicle: "Pegassi Speeder Foil / Dodo Seaplane",
    defaultSeekSec: 16,
    articleSlug: "leonida-keys-archipelago-smuggling-lanes-and-overseas-highway",
  },
  {
    id: "grassrivers",
    name: "Grassrivers",
    code: "GR-407",
    radarX: 48,
    radarY: 70,
    summary: "Untamed mangrove wetlands, airboat smuggling channels, apex alligator ecosystems, and mudflat hovercraft trails.",
    signatureVehicle: "Nagasaki Hurricane Airboat",
    defaultSeekSec: 28,
    articleSlug: "grassrivers-biome-airboats-alligators-and-swamp-foliage",
  },
  {
    id: "port-gellhorn",
    name: "Port Gellhorn",
    code: "PG-813",
    radarX: 24,
    radarY: 50,
    summary: "Forgotten Gulf Coast industrial strip, pawn shops, motel safehouses (Room 209), dirt-bike crews, and high-response police precincts.",
    signatureVehicle: "Declasse Tulip M-100 (Jason's Daily)",
    defaultSeekSec: 40,
    articleSlug: "port-gellhorn-rundown-motels-pawn-shops-and-coastal-decay",
  },
  {
    id: "ambrosia",
    name: "Ambrosia",
    code: "AM-863",
    radarX: 54,
    radarY: 42,
    summary: "Central Leonida sugar-refinery heartland, Lake Leonida industrial freight corridors, and Final Chapter MC biker turf.",
    signatureVehicle: "Western Sovereign Custom Chopper",
    defaultSeekSec: 52,
    articleSlug: "ambrosia-sugar-refineries-biker-gangs-and-central-leonida",
  },
  {
    id: "mount-kalaga",
    name: "Mount Kalaga National Park",
    code: "MK-904",
    radarX: 42,
    radarY: 16,
    summary: "Northern pine canyons, whitewater kayak rapids, off-grid survivalist compounds, and steep 4x4 rock-crawling trails.",
    signatureVehicle: "Canis Kamacho Trailhawk 4x4",
    defaultSeekSec: 64,
    articleSlug: "mount-kalaga-national-park-northern-wilderness-and-hunting-trails",
  },
];

// Curated pool of rich X-Ray cue templates grounded in the 6 knowledge-base files
const CUE_TEMPLATES: Omit<XRayMetadataCue, "id" | "startTime" | "endTime">[] = [
  {
    cueTitle: "Ocean Drive Volumetric RTGI & High-Density Pedestrian Beachfront",
    forensicNote:
      "RAGE 9 ray-traced global illumination bounces pastel neon off wet asphalt and multi-layer clear-coat car paint while NPCs run individual beach routines.",
    provenance: "CONFIRMED",
    location: {
      regionId: "vice-city",
      regionName: "Vice City Metro",
      subdistrict: "Ocean Beach / South Vice",
      landmark: "Hotel Dixon & Ocean View Strip",
      radarX: 78,
      radarY: 60,
      latLngLabel: "25.7826° N, 80.1304° W",
      bearingDeg: 115,
      weather: "Tropical Humid • 84°F • Volumetric Haze",
    },
    vehicle: {
      id: "cheetah-classic-vc",
      name: "Grotti Cheetah Classic (Vice Spec)",
      manufacturer: "Grotti",
      vehicleClass: "Sports Classic",
      estTopSpeedMph: 148,
      trunkLockerSlots: 2,
      hswUpgradeable: true,
      interiorFeature: "Working digital cluster + articulated sun visors & mirrors",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "tracker-jammer",
      name: "RF Vehicle Tracker Jammer",
      category: "Lucia Tactical Hacking Gear",
      carryLimitNote: "1 Utility Slot (Concealed Bag)",
      tacticalEffect: "Blocks LSPD satellite ping during high-value exotic vehicle thefts",
      provenance: "LEAK_ARCHIVE",
    },
    character: {
      name: "Lucia Caminos",
      role: "Co-Protagonist • Tactical Specialist",
      attitude: "Aggressive / Unfiltered",
      relationshipSyncPct: 86,
      activeMechanic: "Dual-Protagonist Quick-Switch + Threat Intimidation",
    },
    economyTicker: {
      appName: "What-Up!",
      category: "Encrypted Crew Comms & Social Feed",
      liveMetricLabel: "Viral Ocean Beach Clip Heat",
      liveMetricValue: "98.4K Live Views (+410%/min)",
    },
    radioTrack: {
      station: "Flash FM 105.7 (Vice Heritage)",
      trackTitle: "Love Is A Long Road",
      artist: "Tom Petty",
    },
    relatedArticleSlug: "vice-city-ocean-beach-to-little-haiti-district-guide",
    relatedArticleTitle: "Vice City Metro: From Ocean Beach Neon to Little Haiti",
  },
  {
    cueTitle: "Overseas Highway Low-Altitude Seaplane & High-Speed Boat Intercept",
    forensicNote:
      "Physically simulated ocean wave crests dynamically pitch cigarette hulls while volumetric cumulus clouds cast real-time shadows across the Keys bridges.",
    provenance: "CONFIRMED",
    location: {
      regionId: "leonida-keys",
      regionName: "Leonida Keys",
      subdistrict: "Key Lento Bridge Span",
      landmark: "Seven-Mile Overseas Viaduct",
      radarX: 62,
      radarY: 86,
      latLngLabel: "24.6981° N, 81.1542° W",
      bearingDeg: 210,
      weather: "Clear Trade Winds • 88°F • Choppy Swell",
    },
    vehicle: {
      id: "pegassi-vortex-marine",
      name: "Pegassi Vortex Cigarette 42'",
      manufacturer: "Pegassi Marine",
      vehicleClass: "Offshore Interceptor Boat",
      estTopSpeedMph: 94,
      trunkLockerSlots: 4,
      hswUpgradeable: false,
      interiorFeature: "Twin throttle trim levers + concealed hull contraband hold",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "carbine-mk2-trunk",
      name: "Service Carbine (Sling-Mounted)",
      category: "Primary Longarm (Trunk)",
      carryLimitNote: "1 of 2 Longarm Slots (RDR2-Style Sling)",
      tacticalEffect: "Must be retrieved from vehicle trunk or boat locker before breach",
      provenance: "CONFIRMED",
    },
    character: {
      name: "Jason Duval",
      role: "Co-Protagonist • Wheelman & Recon",
      attitude: "Pragmatic / Cool-Headed",
      relationshipSyncPct: 89,
      activeMechanic: "Eagle-Eye Contraband Appraisal (Highlights High-Value Loot)",
    },
    economyTicker: {
      appName: "CrashPad",
      category: "Short-Term Safehouse Rentals",
      liveMetricLabel: "Key Lento Waterfront Hideout",
      liveMetricValue: "$1,450 / Night (No ID Check)",
    },
    radioTrack: {
      station: "Vice Beach Radio",
      trackTitle: "Hot Together",
      artist: "The Pointer Sisters",
    },
    relatedArticleSlug: "leonida-keys-archipelago-smuggling-lanes-and-overseas-highway",
    relatedArticleTitle: "Leonida Keys Archipelago: Smuggling Lanes & The Overseas Highway",
  },
  {
    cueTitle: "Grassrivers Mangrove Airboat Traversal & Apex Predator AI",
    forensicNote:
      "Deformable swamp mud and buoyant sawgrass react to airboat prop wash; alligator AI stalks shallow shorelines with full ragdoll physics.",
    provenance: "CONFIRMED",
    location: {
      regionId: "grassrivers",
      regionName: "Grassrivers",
      subdistrict: "Blackwater Hammock",
      landmark: "Gator Keys Airboat Outpost",
      radarX: 48,
      radarY: 70,
      latLngLabel: "25.8419° N, 80.8920° W",
      bearingDeg: 285,
      weather: "Swamp Mist • 89°F • 94% Humidity",
    },
    vehicle: {
      id: "nagasaki-airboat",
      name: "Nagasaki Gator-Fan Airboat",
      manufacturer: "Nagasaki",
      vehicleClass: "Amphibious Utility",
      estTopSpeedMph: 62,
      trunkLockerSlots: 3,
      hswUpgradeable: false,
      interiorFeature: "Elevated cage rudder control + rear waterproof gun crate",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "pump-shotgun-marine",
      name: "Marine Nickel-Plated Pump Shotgun",
      category: "Primary Longarm (Trunk)",
      carryLimitNote: "1 of 2 Longarm Slots (Weatherproof)",
      tacticalEffect: "High stopping power against swamp predators and airboat pursuers",
      provenance: "CONFIRMED",
    },
    character: {
      name: "Cal Hampton",
      role: "Jason's Associate • Coast Guard Watcher",
      attitude: "Undercover / Observational",
      relationshipSyncPct: 74,
      activeMechanic: "Scanner Frequency Intercept (Reveals Coast Guard Patrols)",
    },
    economyTicker: {
      appName: "BuckMe",
      category: "Peer-to-Peer Cash & Bounty Transfers",
      liveMetricLabel: "Grassrivers Drop Payout",
      liveMetricValue: "+$18,500 Unmarked Wire",
    },
    relatedArticleSlug: "grassrivers-biome-airboats-alligators-and-swamp-foliage",
    relatedArticleTitle: "The Grassrivers Biome: Airboats, Alligators & Swamp Foliage",
  },
  {
    cueTitle: "Port Gellhorn Motel Safehouse, Trunk Gun Locker & Diner Stickup",
    forensicNote:
      "Demonstrates the RDR2-inspired trunk weapon locker, CCTV camera countdown timer, and NPC witness vehicle-description reporting.",
    provenance: "CONFIRMED",
    location: {
      regionId: "port-gellhorn",
      regionName: "Port Gellhorn",
      subdistrict: "Route 19 Industrial Strip",
      landmark: "Uncle Jack's Liquor & Arrowhead Motel #209",
      radarX: 24,
      radarY: 50,
      latLngLabel: "27.4989° N, 82.5748° W",
      bearingDeg: 45,
      weather: "Overcast Gulf Breeze • 79°F",
    },
    vehicle: {
      id: "declasse-tulip-jason",
      name: "Declasse Tulip M-100 (Jason's Personal Car)",
      manufacturer: "Declasse",
      vehicleClass: "Muscle Sedan",
      estTopSpeedMph: 124,
      trunkLockerSlots: 6,
      hswUpgradeable: true,
      interiorFeature: "Full personal mobile arsenal in trunk + custom plate swapper",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "immobilizer-bypass",
      name: "OBD-II Immobilizer Bypass & Auto Dialer",
      category: "Lucia Tactical Hacking Gear",
      carryLimitNote: "Concealed Tech Pouch",
      tacticalEffect: "Defeats modern push-to-start luxury vehicle locks in under 6 seconds",
      provenance: "LEAK_ARCHIVE",
    },
    character: {
      name: "Jason & Lucia (Joint Robbery Sync)",
      role: "Dual-Protagonist Stickup Formation",
      attitude: "High-Alert / Evading",
      relationshipSyncPct: 94,
      activeMechanic: "Crowd Control Aim-Intimidation + Witness Phone Snatch",
    },
    economyTicker: {
      appName: "RydeMe",
      category: "On-Demand Getaway & Ride-Hail",
      liveMetricLabel: "Port Gellhorn Surge Multiplier",
      liveMetricValue: "3.2x Wanted Evasion Rate",
    },
    relatedArticleSlug: "port-gellhorn-rundown-motels-pawn-shops-and-coastal-decay",
    relatedArticleTitle: "Port Gellhorn: Rundown Motels, Pawn Shops & Coastal Decay",
  },
  {
    cueTitle: "Ambrosia Sugar Refinery Freight Yard & Final Chapter MC Convoy",
    forensicNote:
      "Volumetric smoke plumes from the Allied Crystal sugar stacks mix with dynamic dust physics kicked up by heavy formation motorcycles.",
    provenance: "CONFIRMED",
    location: {
      regionId: "ambrosia",
      regionName: "Ambrosia",
      subdistrict: "Lake Leonida Eastern Shore",
      landmark: "Allied Crystal Sugar Refinery",
      radarX: 54,
      radarY: 42,
      latLngLabel: "26.7512° N, 80.6634° W",
      bearingDeg: 330,
      weather: "Industrial Amber Smog • 91°F",
    },
    vehicle: {
      id: "western-reaver-mc",
      name: "Western Reaver (Final Chapter MC Spec)",
      manufacturer: "Western Motorcycle Co.",
      vehicleClass: "Custom Cruiser Bike",
      estTopSpeedMph: 136,
      trunkLockerSlots: 1,
      hswUpgradeable: true,
      interiorFeature: "Saddlebag sawed-off holster + reinforced highway crash bars",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "compact-smg-sidearm",
      name: "Micro Tactical SMG",
      category: "Sidearm (Holster)",
      carryLimitNote: "Concealed Jacket Holster (One-Handed Bike Fire)",
      tacticalEffect: "Full-auto drive-by stability while steering motorcycles",
      provenance: "CONFIRMED",
    },
    character: {
      name: "Raul Bautista",
      role: "Veteran Bank Heist Mastermind",
      attitude: "Pragmatic / Cool-Headed",
      relationshipSyncPct: 81,
      activeMechanic: "High-Stakes Vault Thermite & Armored Convoy Ambush",
    },
    economyTicker: {
      appName: "BuckMe",
      category: "Underground Fence & Laundered Split",
      liveMetricLabel: "Refinery Payroll Heist Cut",
      liveMetricValue: "$142,000 Clean Split (80/20)",
    },
    relatedArticleSlug: "ambrosia-sugar-refineries-biker-gangs-and-central-leonida",
    relatedArticleTitle: "Ambrosia: Sugar Refineries, Biker Gangs & Central Leonida",
  },
  {
    cueTitle: "Mount Kalaga Northern Wilderness, 4x4 Mud Physics & Kayak Rapids",
    forensicNote:
      "Real-time suspension articulation, tire-pressure mud deformation, and procedural pine-canopy crepuscular rays in northern Leonida.",
    provenance: "CONFIRMED",
    location: {
      regionId: "mount-kalaga",
      regionName: "Mount Kalaga National Park",
      subdistrict: "Kalaga Ridge & Whitewater Gorge",
      landmark: "Firewatch Tower #4 & Canyon Rapids",
      radarX: 42,
      radarY: 16,
      latLngLabel: "29.1872° N, 81.9810° W",
      bearingDeg: 15,
      weather: "Crisp Pine Mountain Air • 68°F • Morning Fog",
    },
    vehicle: {
      id: "canis-freecrawler-kalaga",
      name: "Canis Mesa 4x4 Overland Rig",
      manufacturer: "Canis",
      vehicleClass: "Off-Road Rock Crawler",
      estTopSpeedMph: 108,
      trunkLockerSlots: 5,
      hswUpgradeable: false,
      interiorFeature: "Working winch bumper, snorkel intake & roof expedition rack",
      provenance: "CONFIRMED",
    },
    weaponOrGear: {
      id: "precision-bolt-rifle",
      name: "Marksman Bolt-Action Hunting Rifle",
      category: "Primary Longarm (Trunk)",
      carryLimitNote: "Longarm Slot + Variable Thermal/8x Optic",
      tacticalEffect: "Long-range windage & ballistic drop across Kalaga canyons",
      provenance: "CONFIRMED",
    },
    character: {
      name: "Boobie Ike & Dre'Quan Priest",
      role: "Vice City Nightlife & Only Raw RecordsMoguls",
      attitude: "Pragmatic / Cool-Headed",
      relationshipSyncPct: 79,
      activeMechanic: "Empire Cash-Flow Laundering via Strip Clubs & Studio Cuts",
    },
    economyTicker: {
      appName: "CrashPad",
      category: "Off-Grid Cabin Hideouts",
      liveMetricLabel: "Kalaga Ridge Bunker Listing",
      liveMetricValue: "$620 / Week (Zero Police Patrols)",
    },
    relatedArticleSlug: "mount-kalaga-national-park-northern-wilderness-and-hunting-trails",
    relatedArticleTitle: "Mount Kalaga National Park: Northern Wilderness & Hunting Trails",
  },
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Generates a deterministic, time-coded sequence of X-Ray metadata cues for any
 * VideoItem in the catalog, adapting automatically to the clip's duration and title keywords.
 */
export function generateXRayCuesForVideo(
  item: VideoItem | null | undefined,
  knownDurationSec?: number
): XRayMetadataCue[] {
  const duration = Math.max(
    30,
    Math.min(600, Math.round(knownDurationSec || item?.durationSec || 75))
  );
  const titleLower = (item?.title || "").toLowerCase();
  const baseHash = hashString(item?.id || item?.title || "leonida-default");

  // Prioritize matching region if the video title mentions a specific county/topic
  let startOffset = baseHash % CUE_TEMPLATES.length;
  if (titleLower.includes("keys") || titleLower.includes("boat") || titleLower.includes("ocean")) {
    startOffset = 1;
  } else if (titleLower.includes("grass") || titleLower.includes("gator") || titleLower.includes("swamp")) {
    startOffset = 2;
  } else if (titleLower.includes("gellhorn") || titleLower.includes("motel") || titleLower.includes("robbery")) {
    startOffset = 3;
  } else if (titleLower.includes("ambrosia") || titleLower.includes("biker") || titleLower.includes("heist")) {
    startOffset = 4;
  } else if (titleLower.includes("kalaga") || titleLower.includes("mount") || titleLower.includes("off-road")) {
    startOffset = 5;
  } else if (titleLower.includes("vice") || titleLower.includes("lucia") || titleLower.includes("trailer")) {
    startOffset = 0;
  }

  const numSegments = 6;
  const segLen = duration / numSegments;

  const isLeak =
    item?.category === "leak" ||
    titleLower.includes("leak") ||
    titleLower.includes("2022") ||
    titleLower.includes("debug");
  const isSpeculation =
    item?.category === "analysis" ||
    item?.category === "reaction" ||
    titleLower.includes("theory") ||
    titleLower.includes("speculation");

  return Array.from({ length: numSegments }, (_, idx) => {
    const templateIdx = (startOffset + idx) % CUE_TEMPLATES.length;
    const tpl = CUE_TEMPLATES[templateIdx];
    const startTime = Number((idx * segLen).toFixed(2));
    const endTime = Number(((idx + 1) * segLen).toFixed(2));

    const provenance: ProvenanceBadge =
      idx === 0 && isLeak
        ? "LEAK_ARCHIVE"
        : idx === 0 && isSpeculation
        ? "SPECULATION"
        : tpl.provenance;

    return {
      ...tpl,
      id: `${item?.id || "vid"}_cue_${idx}`,
      startTime,
      endTime,
      provenance,
    };
  });
}

export function formatPreciseTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function formatShortTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Serializes XRayMetadataCue[] into a valid WebVTT string (kind="metadata")
 * as specified in Section 3.1 of the GTA 6 Video Player Integration blueprint.
 */
export function buildWebVttFromCues(cues: XRayMetadataCue[]): string {
  const toVttTime = (sec: number) => {
    const safe = Math.max(0, sec);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.floor((safe % 1) * 1000);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  const lines = ["WEBVTT - LEONIDA VICE BI-DIRECTIONAL TELEMETRY TRACK", ""];
  for (const cue of cues) {
    lines.push(cue.id);
    lines.push(`${toVttTime(cue.startTime)} --> ${toVttTime(cue.endTime)}`);
    lines.push(JSON.stringify(cue));
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Shared Forensic Draft Storage (Bridges Broadcast Player -> /admin Studio) ───
const FORENSIC_STORAGE_KEY = "lv_forensic_captured_frames";

export function getSavedForensicFrames(): CapturedForensicFrame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FORENSIC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveForensicFrameToDrafts(frame: CapturedForensicFrame): CapturedForensicFrame[] {
  if (typeof window === "undefined") return [frame];
  try {
    const existing = getSavedForensicFrames();
    const updated = [frame, ...existing.filter((f) => f.id !== frame.id)].slice(0, 16);
    localStorage.setItem(FORENSIC_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("lv:forensic-frames-updated"));
    return updated;
  } catch {
    return [frame];
  }
}

export function clearSavedForensicFrames(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FORENSIC_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("lv:forensic-frames-updated"));
  } catch {
    // ignore
  }
}

// ─── Global Custom Event Bus for Bi-Directional Seeking (Newspaper <-> Video) ───
export interface VideoSeekCommandDetail {
  timestampSec: number;
  regionId?: LeonidaRegionId;
  reason?: string;
  autoPauseForensic?: boolean;
}

export function dispatchVideoSeekCommand(detail: VideoSeekCommandDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<VideoSeekCommandDetail>("lv:seek-video", { detail }));
}
