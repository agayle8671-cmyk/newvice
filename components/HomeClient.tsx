"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth/context";
import { useGuestProfile } from "@/lib/profile/guest";
import AuthModal from "@/components/auth/AuthModal";
import ProfileModal from "@/components/profile/ProfileModal";
import SubmitClipModal from "@/components/drive-in/SubmitClipModal";
import VideoEngine from "@/components/video-engine/VideoEngine";
import type { PlayerTelemetryState } from "@/components/video-engine/HTML5Player";
import UrbanObserverLayout from "@/components/newspaper/UrbanObserverLayout";
import { filterMessage } from "@/lib/moderation/filter";
import { useDriveInRoom } from "@/lib/realtime/useDriveInRoom";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";
import type { ChatMessage } from "@/lib/realtime/chat";
import type { VideoItem } from "@/lib/video/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface HomeClientProps {
  roomSlug?: string;
  roomTitle?: string;
  videoId?: string;
}

export default function HomeClient({ roomSlug = "main-theater" }: HomeClientProps) {
  const { user, profile, showAuthModal, setShowAuthModal, signOut } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Real presence arrives from Supabase / PartyServer; 24 is the pre-connect placeholder.
  const [presenceCount, setPresenceCount] = useState(24);
  const guest = useGuestProfile();
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [currentVideoItem, setCurrentVideoItem] = useState<VideoItem | null>(null);
  const [playerTelemetry, setPlayerTelemetry] = useState<PlayerTelemetryState | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const currentUserId = user ? user.id : guest?.id ?? "guest_pending";
  const currentUsername = profile?.username ?? guest?.username ?? "Citizen";
  const currentBadge = profile?.vehicle_badge ?? guest?.vehicle_badge ?? "muscle_car";
  const currentBadgeColor = profile?.badge_color ?? guest?.badge_color ?? "#e04040";
  const isAuthenticated = !!user;

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
    onHornTrigger: (_seatId, hornId, panX, zDepth) => {
      getDriveInAudioGraph().playSpatialHorn(hornId, panX, zDepth);
    },
    onEncoreSurge: (bonusSec, highBeams) => {
      appendUniqueMessage({
        id: `encore_${Date.now()}`,
        userId: "system",
        username: "NEWSROOM",
        vehicleBadge: "vice_pd",
        badgeColor: "#e04040",
        content: `🔴 BROADCAST ENCORE! ${highBeams} viewers boosted this clip — +${bonusSec}s replay extension!`,
        isAnnouncement: true,
        createdAt: new Date().toISOString(),
      });
    },
    onClipTransition: (reason, nextClip) => {
      if (reason === "emp_skip") {
        appendUniqueMessage({
          id: `emp_${Date.now()}`,
          userId: "system",
          username: "NEWSROOM",
          vehicleBadge: "vice_pd",
          badgeColor: "#e04040",
          content: `⚡ BROADCAST FEED SWITCH — Cutting live to "${nextClip.title}"!`,
          isAnnouncement: true,
          createdAt: new Date().toISOString(),
        });
      }
    },
  });

  // Merge local/Supabase messages with Edge Durable Object authoritative room chat
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

  const sendSyncedChat = room.sendSyncedChat;
  const displayedPresenceCount =
    room.syncMode === "partyserver" && room.vehicles.length > 0
      ? room.vehicles.length
      : presenceCount;
  const anyModalOpen = showAuthModal || showProfileModal || showSubmitModal;

  useEffect(() => {
    if (autoScroll && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [displayMessages, autoScroll]);

  const handleChatScroll = useCallback(() => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  }, []);

  const isDemoMode = useRef(true);

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

      // Primary path: Cloudflare PartyServer Edge WebSocket
      if (sendSyncedChat(message.id, content)) {
        return;
      }

      // Demo mode: local state
      if (isDemoMode.current || !channelRef.current) {
        appendUniqueMessage(message);
        return;
      }

      // Live mode fallback: Supabase Realtime broadcast + persist
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

  const handleInputSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      handleSendMessage(trimmed);
      setInputValue("");
    },
    [inputValue, handleSendMessage]
  );

  const sharedVideoScreen = (
    <VideoEngine
      onItemChange={setCurrentVideoItem}
      onTelemetryChange={setPlayerTelemetry}
      modalOpen={anyModalOpen}
      syncMode={room.syncMode}
      syncedCurrent={room.current}
      syncedNext={room.next}
      clipStartTimestamp={room.clipStartTimestamp}
      getSyncedOffsetSec={room.getSyncedOffsetSec}
      onReportDuration={room.reportClipDuration}
      onRefreshSync={room.refreshSync}
    />
  );

  return (
    <>
      <AuthModal />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
      <SubmitClipModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        defaultCreatorName={currentUsername}
        onClipSubmitted={(clipTitle, creator) => {
          handleSendMessage(
            `🎬 New community clip submitted: "${clipTitle}" by ${creator}! Queued for live broadcast.`
          );
        }}
      />
      <UrbanObserverLayout
        screenNode={sharedVideoScreen}
        currentVideoItem={currentVideoItem}
        playerTelemetry={playerTelemetry}
        presenceCount={displayedPresenceCount}
        messages={displayMessages}
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputError={inputError}
        setInputError={setInputError}
        handleSendMessage={handleInputSubmit}
        chatScrollRef={chatScrollRef}
        handleChatScroll={handleChatScroll}
        isAuthenticated={isAuthenticated}
        currentUsername={currentUsername}
        currentBadgeColor={currentBadgeColor}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenSubmitClip={() => setShowSubmitModal(true)}
        onSignOut={signOut}
      />
    </>
  );
}
