import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  vehicleBadge: string;
  badgeColor: string;
  content: string;
  isAnnouncement: boolean;
  createdAt: string;
}

export interface ChatCallbacks {
  onMessage: (message: ChatMessage) => void;
  onPresenceUpdate: (count: number) => void;
}

export function subscribeToChatRoom(
  roomId: string,
  userId: string,
  callbacks: ChatCallbacks
): RealtimeChannel {
  const supabase = createClient();
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: userId },
      broadcast: { self: true },
    },
  });

  channel
    .on("broadcast", { event: "new_message" }, ({ payload }) => {
      callbacks.onMessage(payload as ChatMessage);
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const count = Object.keys(state).length;
      callbacks.onPresenceUpdate(count);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          online_at: new Date().toISOString(),
          user_id: userId,
        });
      }
    });

  return channel;
}

export async function sendChatMessage(
  channel: RealtimeChannel,
  message: ChatMessage
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: "new_message",
    payload: message,
  });
}

const roomIdCache = new Map<string, string | null>();

/** messages.room_id is a UUID FK to rooms(id); callers only know the room slug. */
async function resolveRoomId(slugOrId: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
    return slugOrId;
  }
  if (roomIdCache.has(slugOrId)) return roomIdCache.get(slugOrId) ?? null;
  const supabase = createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id")
    .eq("slug", slugOrId)
    .maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  if (id) roomIdCache.set(slugOrId, id);
  return id;
}

export async function persistMessage(
  roomSlug: string,
  userId: string,
  content: string
): Promise<void> {
  const roomId = await resolveRoomId(roomSlug);
  if (!roomId) return; // room not provisioned — chat still works over realtime
  const supabase = createClient();
  await supabase.from("messages").insert({
    room_id: roomId,
    user_id: userId,
    content,
  });
}
