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

export async function persistMessage(
  roomId: string,
  userId: string,
  content: string
): Promise<void> {
  const supabase = createClient();
  await supabase.from("messages").insert({
    room_id: roomId,
    user_id: userId,
    content,
  });
}
