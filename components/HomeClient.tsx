"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth/context";
import { useGuestProfile } from "@/lib/profile/guest";
import AuthModal from "@/components/auth/AuthModal";
import ProfileModal from "@/components/profile/ProfileModal";
import SubmitClipModal from "@/components/drive-in/SubmitClipModal";
import CarCabinDrawer from "@/components/drive-in/CarCabinDrawer";
import SkylineBackground from "@/components/drive-in/SkylineBackground";
import NeonMarquee from "@/components/drive-in/NeonMarquee";
import VehicleField from "@/components/drive-in/VehicleField";
import VideoEngine from "@/components/video-engine/VideoEngine";
import NowPlaying from "@/components/video-engine/NowPlaying";
import ChatTerminal from "@/components/chat/ChatTerminal";
import AffiliateWidget from "@/components/monetization/AffiliateWidget";
import { filterMessage } from "@/lib/moderation/filter";
import { useDriveInRoom } from "@/lib/realtime/useDriveInRoom";
import { useCarCabinVoice } from "@/lib/realtime/cabin-voice";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";
import {
  useViceEconomy,
  recordDailyLotCheckIn,
  awardViceCred,
  dismissTowImpoundNotice,
} from "@/lib/economy/vice-cred";
import type { ChatMessage } from "@/lib/realtime/chat";
import type { VehicleType } from "@/lib/realtime/party-protocol";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface HomeClientProps {
  roomSlug?: string;
  roomTitle?: string;
  videoId?: string;
}

export default function HomeClient({
  roomSlug = "main-theater",
}: HomeClientProps) {
  const { user, profile, setShowAuthModal, showAuthModal, signOut } = useAuth();
  const guest = useGuestProfile();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presenceCount, setPresenceCount] = useState(18);
  const [inputError, setInputError] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCabinDrawer, setShowCabinDrawer] = useState(false);
  const [wantedLevel, setWantedLevel] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [currentVideoItem, setCurrentVideoItem] = useState<
    import("@/lib/video/types").VideoItem | null
  >(null);

  // Spatial Lot & Crowd Reaction states
  const [localHighBeamsOn, setLocalHighBeamsOn] = useState(false);
  const [localHazardsOn, setLocalHazardsOn] = useState(false);
  const [activeHornSeatId, setActiveHornSeatId] = useState<string | null>(null);
  const [encoreSurgeActive, setEncoreSurgeActive] = useState(false);
  const [empGlitchActive, setEmpGlitchActive] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const flashedClipIdsRef = useRef<Set<string>>(new Set());
  const highBeamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hornRippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const economy = useViceEconomy();

  // Record daily check-in & evaluate 48-hour Tow-Truck impound once on mount
  useEffect(() => {
    recordDailyLotCheckIn();
  }, []);

  const currentUserId = user ? user.id : guest?.id ?? "guest_pending";
  const currentUsername = profile?.username ?? guest?.username ?? "Driver";
  const currentBadge = (profile?.vehicle_badge ??
    guest?.vehicle_badge ??
    "sports_car") as VehicleType;
  const currentBadgeColor =
    profile?.badge_color ?? guest?.badge_color ?? "#ff007f";
  const isAuthenticated = !!user;

  // ── 4-Seat WebRTC Car Crew Cabin + Warm 950 Hz FM Radio DSP ─────────────
  const cabin = useCarCabinVoice({
    userId: currentUserId,
    username: currentUsername,
    badgeColor: currentBadgeColor,
  });

  const appendUniqueMessage = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev.slice(-150), incoming];
    });
  }, []);

  // ── Authoritative Edge Room Coordinator (PartyServer DO + Server-Clock Fallback) ──
  const room = useDriveInRoom({
    roomSlug,
    userId: currentUserId,
    username: currentUsername,
    vehicleType: currentBadge,
    badgeColor: currentBadgeColor,
    licensePlate: economy.licensePlate,
    viceCred: economy.viceCred,
    streakDays: economy.streakDays,
    onHornTrigger: (seatId, hornId, panX, zDepth) => {
      const g = getDriveInAudioGraph();
      g.unlock();
      g.playSpatialHorn(hornId, panX, zDepth);
      setActiveHornSeatId(seatId);
      if (hornRippleTimerRef.current) clearTimeout(hornRippleTimerRef.current);
      hornRippleTimerRef.current = setTimeout(
        () => setActiveHornSeatId(null),
        900
      );
    },
    onEncoreSurge: (bonusSec, highBeams) => {
      setEncoreSurgeActive(true);
      setTimeout(() => setEncoreSurgeActive(false), 4500);
      appendUniqueMessage({
        id: `encore_${Date.now()}`,
        userId: "system",
        username: "DRIVE-IN",
        vehicleBadge: "vice_pd",
        badgeColor: "#ffdd00",
        content: `💡 CROWD ENCORE! ${highBeams} High-Beams flashed — +${bonusSec}s replay boost!`,
        isAnnouncement: true,
        createdAt: new Date().toISOString(),
      });
    },
    onClipTransition: (reason, nextClip) => {
      setLocalHighBeamsOn(false);
      setLocalHazardsOn(false);
      if (reason === "emp_skip") {
        setEmpGlitchActive(true);
        setTimeout(() => setEmpGlitchActive(false), 950);
        appendUniqueMessage({
          id: `emp_${Date.now()}`,
          userId: "system",
          username: "DRIVE-IN",
          vehicleBadge: "vice_pd",
          badgeColor: "#ff007f",
          content: `⚡ CROWD HAZARD SKIP — Cutting straight to "${nextClip.title}"!`,
          isAnnouncement: true,
          createdAt: new Date().toISOString(),
        });
      }
    },
  });

  // Merge local/Supabase messages with Edge Durable Object recent chat
  const displayMessages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of messages) byId.set(m.id, m);
    for (const synced of room.recentChat) {
      byId.set(synced.id, {
        id: synced.id,
        userId: synced.userId,
        username: synced.username,
        vehicleBadge: synced.vehicleBadge,
        badgeColor: synced.badgeColor,
        content: synced.content,
        isAnnouncement: Boolean(synced.isAnnouncement),
        createdAt: synced.createdAt,
      });
    }
    return [...byId.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-150);
  }, [messages, room.recentChat]);

  const [syncGaveUp, setSyncGaveUp] = useState(false);
  useEffect(() => {
    if (room.isSynced) return;
    const t = setTimeout(() => setSyncGaveUp(true), 9000);
    return () => clearTimeout(t);
  }, [room.isSynced]);

  const sendSyncedChat = room.sendSyncedChat;
  const displayedPresenceCount =
    room.syncMode === "partyserver" && room.vehicles.length > 0
      ? room.vehicles.length
      : presenceCount;
  const anyModalOpen =
    showAuthModal || showProfileModal || showSubmitModal || showCabinDrawer;

  // ── Interactive Lot Handlers & Keyboard Shortcuts ────────────────────────
  const handleToggleHighBeams = useCallback(() => {
    const nextState = !localHighBeamsOn;
    setLocalHighBeamsOn(nextState);
    room.sendFlash(nextState);

    if (highBeamTimerRef.current) clearTimeout(highBeamTimerRef.current);
    if (nextState) {
      highBeamTimerRef.current = setTimeout(() => {
        setLocalHighBeamsOn(false);
        room.sendFlash(false);
      }, 5500);

      const activeClipId = currentVideoItem?.id;
      if (activeClipId && !flashedClipIdsRef.current.has(activeClipId)) {
        flashedClipIdsRef.current.add(activeClipId);
        awardViceCred(5, "high_beam");
        fetch("/api/video/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: activeClipId,
            reaction: "high_beam",
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.ok && typeof data.highBeamCount === "number") {
              setCurrentVideoItem((prev) =>
                prev && prev.id === activeClipId
                  ? {
                      ...prev,
                      highBeamCount: data.highBeamCount,
                      viralHeatScore:
                        data.viralHeatScore ?? prev.viralHeatScore,
                    }
                  : prev
              );
            }
          })
          .catch(() => {});
      }
    }
  }, [localHighBeamsOn, room, currentVideoItem?.id]);

  const handleHonkHorn = useCallback(
    (panX = 0, zDepth = 0.18, seatId?: string) => {
      const g = getDriveInAudioGraph();
      g.unlock();
      g.playSpatialHorn(economy.preferredHorn, panX, zDepth);
      room.sendHorn(economy.preferredHorn);

      const targetSeat =
        seatId ?? (economy.rank.qualifiesRowA ? "A-2" : "B-1");
      setActiveHornSeatId(targetSeat);
      if (hornRippleTimerRef.current) clearTimeout(hornRippleTimerRef.current);
      hornRippleTimerRef.current = setTimeout(
        () => setActiveHornSeatId(null),
        900
      );
    },
    [economy.preferredHorn, economy.rank.qualifiesRowA, room]
  );

  const handleToggleHazards = useCallback(() => {
    const nextState = !localHazardsOn;
    setLocalHazardsOn(nextState);
    if (nextState && room.syncMode !== "partyserver") {
      setEmpGlitchActive(true);
      setTimeout(() => {
        setEmpGlitchActive(false);
        setLocalHazardsOn(false);
      }, 950);
    }
    room.sendHazard(nextState);
  }, [localHazardsOn, room]);

  // Global hotkeys when chat input & modals are not focused:
  //   SPACE = Flash High-Beams | H = 3D Horn | X = Hazard Vote Skip | R = FM Cabin Radio
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen || inputFocused) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space") {
        e.preventDefault();
        handleToggleHighBeams();
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        handleHonkHorn();
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        handleToggleHazards();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        cabin.toggleWindowsUpFm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    anyModalOpen,
    inputFocused,
    handleToggleHighBeams,
    handleHonkHorn,
    handleToggleHazards,
    cabin,
  ]);

  // ── Supabase Realtime Chat Connection ───────────────────────────────────
  const isDemoMode = useRef(true);
  const [chatConnected, setChatConnected] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const live = url.startsWith("https://") && key.length > 10;

    if (!user && !guest) return;

    if (!live) {
      isDemoMode.current = true;
      return;
    }

    isDemoMode.current = false;
    async function connectRealtime() {
      try {
        const { subscribeToChatRoom } = await import("@/lib/realtime/chat");
        const channel = subscribeToChatRoom(roomSlug, currentUserId, {
          onMessage: (message) => appendUniqueMessage(message),
          onPresenceUpdate: (count) => setPresenceCount(count),
        });
        channelRef.current = channel;
        setChatConnected(true);
      } catch {
        isDemoMode.current = true;
      }
    }
    connectRealtime();

    return () => {
      const ch = channelRef.current;
      if (ch) {
        import("@/lib/supabase/client")
          .then(({ createClient }) => createClient().removeChannel(ch))
          .catch(() => {});
      }
    };
  }, [currentUserId, roomSlug, user, guest, appendUniqueMessage]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const filterResult = filterMessage(content);
      if (!filterResult.allowed) {
        setInputError(filterResult.reason || "Message blocked");
        setTimeout(() => setInputError(null), 3000);
        return;
      }

      const message: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: currentUserId,
        username: currentUsername,
        vehicleBadge: currentBadge,
        badgeColor: currentBadgeColor,
        content,
        isAnnouncement: false,
        createdAt: new Date().toISOString(),
      };

      if (sendSyncedChat(message.id, content)) {
        return;
      }

      if (isDemoMode.current || !channelRef.current) {
        appendUniqueMessage(message);
        return;
      }

      try {
        const { sendChatMessage, persistMessage } = await import(
          "@/lib/realtime/chat"
        );
        await sendChatMessage(channelRef.current, message);
        if (isAuthenticated) {
          persistMessage(roomSlug, currentUserId, content).catch(() => {});
        }
      } catch {
        appendUniqueMessage(message);
      }
    },
    [
      currentUserId,
      currentUsername,
      currentBadge,
      currentBadgeColor,
      isAuthenticated,
      roomSlug,
      sendSyncedChat,
      appendUniqueMessage,
    ]
  );

  const highBeamTotal =
    room.reactionTallies.highBeams +
    (room.syncMode !== "partyserver" && localHighBeamsOn ? 1 : 0);
  const hazardTotal =
    room.reactionTallies.hazards +
    (room.syncMode !== "partyserver" && localHazardsOn ? 1 : 0);
  const totalLotCars = Math.max(18, displayedPresenceCount);
  const encoreThreshold = Math.max(1, Math.ceil(totalLotCars * 0.25));
  const skipThreshold = Math.max(2, Math.ceil(totalLotCars * 0.5));

  return (
    <div
      ref={stageRef}
      className="relative w-screen min-h-screen lg:h-screen bg-[#02000a] text-white flex flex-col overflow-x-hidden lg:overflow-hidden select-none"
    >
      {/* ── Modals & Drawers ── */}
      <AuthModal />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
      <SubmitClipModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        defaultCreatorName={currentUsername}
        userId={user?.id}
        onClipSubmitted={(clipTitle, creator, scout) => {
          const credit =
            scout && scout !== creator
              ? `by ${creator} (Scouted by @${scout})`
              : `by ${creator}`;
          handleSendMessage(
            `🎬 New community stunt submitted: "${clipTitle}" ${credit}! Queued on screen.`
          );
        }}
      />
      <CarCabinDrawer
        isOpen={showCabinDrawer}
        onClose={() => setShowCabinDrawer(false)}
        cabinCode={cabin.cabinCode}
        windowsUpFmMode={cabin.windowsUpFmMode}
        micEnabled={cabin.micEnabled}
        micError={cabin.micError}
        isLocalSpeaking={cabin.isLocalSpeaking}
        passengers={cabin.passengers}
        cabinNotes={cabin.cabinNotes}
        onToggleWindowsUpFm={() => cabin.toggleWindowsUpFm()}
        onToggleMicrophone={() => void cabin.toggleMicrophone()}
        onOpenOrJoinCabin={(code) => cabin.openOrJoinCabin(code)}
        onLeaveCabin={() => cabin.leaveCabin()}
        onSendCabinNote={(text) => cabin.sendCabinNote(text)}
        onTestVoiceDuck={() => cabin.triggerVoiceDuck()}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 0: LIVING VICE CITY SKYLINE, ROOFTOP SPONSOR BILLBOARDS,
          POLICE HELICOPTER SEARCHLIGHTS & 30FPS VIDEO AURA ENGINE
      ═══════════════════════════════════════════════════════════════════════ */}
      <SkylineBackground
        stageRef={stageRef}
        isPlaying={isVideoPlaying}
        wantedLevel={wantedLevel}
        encoreActive={encoreSurgeActive}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 1: TOP AMPHITHEATER COMMAND BAR
      ═══════════════════════════════════════════════════════════════════════ */}
      <header className="relative z-30 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-[#00f3ff]/20 bg-[#050214]/85 backdrop-blur-md shrink-0">
        {/* Left: Brand Identity + Live Lot Telemetry + Scout Rank */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-base">🌴</span>
            <span
              className="font-[family-name:var(--font-display)] font-black tracking-[0.2em] text-xs sm:text-sm uppercase"
              style={{
                color: "#ff007f",
                textShadow: "0 0 10px rgba(255,0,127,0.7)",
              }}
            >
              LEONIDA DRIVE-IN
            </span>
          </div>

          {/* Live Cars Parked Pill */}
          <div className="flex items-center gap-1.5 bg-black/70 border border-[#39ff14]/40 rounded-full px-2.5 py-0.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39ff14] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#39ff14]" />
            </span>
            <span className="font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider text-[#39ff14]">
              {totalLotCars} CARS PARKED
            </span>
          </div>

          {/* Driver Scout Rank, Vice Cred & Row A Qualification */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="hidden sm:flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#0c0724]/90 hover:bg-[#160d3d] border border-[#00f3ff]/35 transition-colors cursor-pointer"
            title="Open Driver Garage, Custom License Plate & 3D Horn Selector"
          >
            <span
              className="font-[family-name:var(--font-display)] font-bold text-[10px]"
              style={{ color: economy.rank.color }}
            >
              {economy.rank.badge} {economy.rank.title}
            </span>
            <span className="text-[#ffdd00] font-[family-name:var(--font-display)] font-black text-[10px]">
              {economy.viceCred} CRED
            </span>
            <span className="text-[10px] font-[family-name:var(--font-chat)] text-[#00f3ff]">
              🔥{economy.streakDays}d
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/60 text-[#ffdd00] border border-[#ffdd00]/40">
              {economy.licensePlate}
            </span>
          </button>
        </div>

        {/* Center: 48-Hour Vice City Tow-Truck Impound Warning (if active) */}
        {economy.towStatus !== "safe" && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff6b00]/20 border border-[#ffdd00] text-white text-[10px] font-[family-name:var(--font-chat)] shadow-[0_0_15px_rgba(255,107,0,0.35)]">
            <span>🚚</span>
            <span className="truncate max-w-[260px] sm:max-w-md">
              <strong className="text-[#ffdd00] font-[family-name:var(--font-display)]">
                VICE CITY TOWING:
              </strong>{" "}
              {economy.towStatus === "impounded"
                ? "Row A spot impounded after 48h inactivity!"
                : `Row A lease expires in ${economy.hoursUntilTow}h!`}
            </span>
            <button
              type="button"
              onClick={() => dismissTowImpoundNotice()}
              className="px-2 py-0.5 rounded bg-[#ffdd00] text-black font-[family-name:var(--font-display)] font-black text-[9px] uppercase cursor-pointer shrink-0"
            >
              RECLAIM SPOT
            </button>
          </div>
        )}

        {/* Right: Submit Clip, 4-Seat Cabin, Projector Toggle & Garage */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-2.5 py-1 rounded-full bg-[#ff007f]/25 hover:bg-[#ff007f]/40 border border-[#ff007f] text-white font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider flex items-center gap-1 shadow-[0_0_12px_rgba(255,0,127,0.35)] transition-all cursor-pointer"
          >
            <span>🎬</span>
            <span>SUBMIT CLIP (+50 CRED)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCabinDrawer(true)}
            className="px-2.5 py-1 rounded-full bg-[#00f3ff]/15 hover:bg-[#00f3ff]/30 border border-[#00f3ff]/50 text-[#00f3ff] font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>📻</span>
            <span className="hidden md:inline">
              {cabin.cabinCode ? `CABIN ${cabin.cabinCode}` : "4-SEAT CABIN"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsVideoPlaying((p) => !p)}
            className="px-2.5 py-1 rounded-full bg-black/70 border border-white/20 hover:border-[#00f3ff] text-[#00f3ff] font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider transition-colors cursor-pointer"
            title="Toggle Drive-In Projector"
          >
            {isVideoPlaying ? "📺 LIVE" : "🖼️ STANDBY"}
          </button>

          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="px-2.5 py-1 rounded-full bg-black/70 border border-[#ffdd00]/40 hover:border-[#ffdd00] text-[#ffdd00] font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider transition-colors cursor-pointer"
            title="Customize Vehicle, License Plate & 3D Horn"
          >
            ⚙ GARAGE
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAYER 2: MAIN WIDESCREEN SPLIT STAGE
          Left/Center: Giant Drive-In Marquee + 16:9 Screen + 3-Tier Curved Amphitheater Lot
          Right Sidebar: CRT Chat Terminal + Context-Aware Affiliate Gear
      ═══════════════════════════════════════════════════════════════════════ */}
      <main className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-[1fr_350px] xl:grid-cols-[1fr_385px] gap-3 px-2 sm:px-4 py-2 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* ── LEFT / CENTER COLUMN: DRIVE-IN SCREEN TOWER & 3-TIER CURVED LOT ── */}
        <div className="flex flex-col justify-between min-h-0 gap-1">
          {/* 1. Giant Angled Drive-In Screen Tower & Live Broadcast Marquee */}
          <div className="w-full max-w-[820px] mx-auto shrink-0">
            <NeonMarquee
              wantedLevel={wantedLevel}
              onChangeWantedLevel={setWantedLevel}
              encoreActive={encoreSurgeActive}
              empGlitchActive={empGlitchActive}
              nowPlayingBar={
                <NowPlaying
                  item={isVideoPlaying ? currentVideoItem : null}
                  syncMode={room.syncMode}
                />
              }
            >
              {isVideoPlaying ? (
                <VideoEngine
                  onItemChange={setCurrentVideoItem}
                  modalOpen={anyModalOpen}
                  syncMode={room.syncMode}
                  syncedCurrent={
                    room.isSynced
                      ? room.current
                      : syncGaveUp
                      ? undefined
                      : null
                  }
                  syncedNext={
                    room.isSynced ? room.next : syncGaveUp ? undefined : null
                  }
                  clipStartTimestamp={room.clipStartTimestamp}
                  getSyncedOffsetSec={room.getSyncedOffsetSec}
                  onReportDuration={room.reportClipDuration}
                  onRefreshSync={room.refreshSync}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsVideoPlaying(true)}
                  className="w-full h-full flex flex-col items-center justify-center bg-[#05010f] gap-2 group cursor-pointer"
                >
                  <span className="text-2xl">📽️</span>
                  <span className="bg-[#ff007f]/20 border border-[#ff007f] px-4 py-1.5 rounded text-[#ff007f] group-hover:bg-[#ff007f] group-hover:text-white tracking-widest font-[family-name:var(--font-display)] font-black text-xs transition-all shadow-[0_0_20px_rgba(255,0,127,0.5)]">
                    ▶ IGNITE DRIVE-IN PROJECTOR
                  </span>
                </button>
              )}
            </NeonMarquee>
          </div>

          {/* 2. 3-Tier Curved Amphitheater Vehicle Field (Row A / Row B / Row C) */}
          <div className="relative w-full max-w-[1060px] mx-auto flex-1 flex items-center">
            <VehicleField
              remoteVehicles={room.vehicles}
              localDriver={{
                userId: currentUserId,
                username: currentUsername,
                vehicleType: currentBadge,
                badgeColor: currentBadgeColor,
                licensePlate: economy.licensePlate,
                viceCred: economy.viceCred,
                streakDays: economy.streakDays,
                hoursUntilRowATow: economy.hoursUntilTow,
                highBeamsOn: localHighBeamsOn,
                hazardsOn: localHazardsOn,
                cabinUnlocked: cabin.cabinUnlocked,
                cabinCode: cabin.cabinCode,
              }}
              activeHornSeatId={activeHornSeatId}
              onToggleLocalHighBeams={handleToggleHighBeams}
              onToggleLocalHazards={handleToggleHazards}
              onHonkHorn={(panX, zDepth, seatId) =>
                handleHonkHorn(panX, zDepth, seatId)
              }
              onOpenCabinDrawer={(joinCode) => {
                if (joinCode) cabin.openOrJoinCabin(joinCode);
                setShowCabinDrawer(true);
              }}
            />
          </div>

          {/* 3. Tactile Vehicle Dashboard Control Bar */}
          <div className="w-full max-w-[940px] mx-auto shrink-0 pt-0.5">
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl"
              style={{
                background:
                  "linear-gradient(180deg, rgba(12, 6, 32, 0.92) 0%, rgba(5, 3, 16, 0.96) 100%)",
                border: "1px solid rgba(0, 243, 255, 0.35)",
                boxShadow:
                  "0 0 24px rgba(0, 0, 0, 0.8), inset 0 0 12px rgba(0, 243, 255, 0.08)",
              }}
            >
              {/* Left: Primary Vehicle Crowd Reactions */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* High-Beams [SPACE] */}
                <button
                  type="button"
                  onClick={handleToggleHighBeams}
                  className="px-2.5 py-1 rounded-lg font-[family-name:var(--font-display)] font-black text-[10px] tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                  style={{
                    background: localHighBeamsOn
                      ? "rgba(255, 221, 0, 0.25)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: localHighBeamsOn ? "#ffdd00" : "#ffffffdd",
                    border: localHighBeamsOn
                      ? "1px solid #ffdd00"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: localHighBeamsOn
                      ? "0 0 14px rgba(255, 221, 0, 0.45)"
                      : "none",
                  }}
                  title="Flash High-Beams toward the screen (>25% triggers Marquee Encore Surge)"
                >
                  <span>💡</span>
                  <span>HIGH-BEAMS</span>
                  <span className="text-[8px] px-1 rounded bg-black/50 text-[#ffdd00]">
                    {highBeamTotal}/{encoreThreshold} [SPACE]
                  </span>
                </button>

                {/* 3D Spatial Horn [H] */}
                <button
                  type="button"
                  onClick={() => handleHonkHorn()}
                  className="px-2.5 py-1 rounded-lg font-[family-name:var(--font-display)] font-black text-[10px] tracking-wider uppercase flex items-center gap-1.5 bg-white/5 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/35 transition-all cursor-pointer"
                  title="Honk 3D Spatial Horn across the amphitheater lot"
                >
                  <span>🔊</span>
                  <span>3D HORN</span>
                  <span className="text-[8px] px-1 rounded bg-black/50 text-[#00f3ff]">
                    [H]
                  </span>
                </button>

                {/* Hazard Vote Skip [X] */}
                <button
                  type="button"
                  onClick={handleToggleHazards}
                  className="px-2.5 py-1 rounded-lg font-[family-name:var(--font-display)] font-black text-[10px] tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                  style={{
                    background: localHazardsOn
                      ? "rgba(255, 107, 0, 0.28)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: localHazardsOn ? "#ff6b00" : "#ffffffcc",
                    border: localHazardsOn
                      ? "1px solid #ff6b00"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                  title="Vote to EMP Skip boring clip (>50% triggers instant cut)"
                >
                  <span>⚠️</span>
                  <span>HAZARD SKIP</span>
                  <span className="text-[8px] px-1 rounded bg-black/50 text-[#ff6b00]">
                    {hazardTotal}/{skipThreshold} [X]
                  </span>
                </button>
              </div>

              {/* Right: FM 88.6 Cabin DSP & 4-Seat Spatial Voice Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => cabin.toggleWindowsUpFm()}
                  className="px-2.5 py-1 rounded-lg font-[family-name:var(--font-display)] font-bold text-[10px] tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                  style={{
                    background: cabin.windowsUpFmMode
                      ? "rgba(0, 243, 255, 0.22)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: cabin.windowsUpFmMode ? "#00f3ff" : "#ffffffbb",
                    border: cabin.windowsUpFmMode
                      ? "1px solid #00f3ff"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                  title="Roll Up the Windows — Warm 950 Hz FM 88.6 Car Cabin Radio Filter [R]"
                >
                  <span>🪟</span>
                  <span>
                    {cabin.windowsUpFmMode ? "FM 88.6 CABIN ON" : "WINDOWS DOWN"}
                  </span>
                  <span className="text-[8px] px-1 rounded bg-black/50">[R]</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCabinDrawer(true)}
                  className="px-2.5 py-1 rounded-lg font-[family-name:var(--font-display)] font-black text-[10px] tracking-wider uppercase flex items-center gap-1.5 bg-[#ff007f]/20 hover:bg-[#ff007f]/35 text-[#ff007f] border border-[#ff007f]/50 transition-all cursor-pointer"
                >
                  <span>📻</span>
                  <span>
                    {cabin.cabinUnlocked && cabin.cabinCode
                      ? `CREW: ${cabin.cabinCode}`
                      : "UNLOCK CABIN"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR COLUMN: CRT CHAT TERMINAL & DYNAMIC AFFILIATE GEAR ── */}
        <aside className="flex flex-col gap-2.5 min-h-[480px] lg:min-h-0 lg:h-full overflow-hidden">
          <ChatTerminal
            messages={displayMessages}
            onSendMessage={handleSendMessage}
            presenceCount={totalLotCars}
            isConnected={room.isSynced || chatConnected}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            isAuthenticated={isAuthenticated}
            inputError={inputError}
            onOpenAuth={() => setShowAuthModal(true)}
            onSignOut={() => signOut()}
            onOpenProfile={() => setShowProfileModal(true)}
            onInputFocusChange={setInputFocused}
          />

          <AffiliateWidget
            activeCategory={currentVideoItem?.category}
            activeClipTitle={currentVideoItem?.title}
          />
        </aside>
      </main>
    </div>
  );
}
