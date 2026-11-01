import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface PresenceState {
  userId: string;
  username: string;
  vehicleBadge: string;
  onlineAt: string;
}

export function subscribeToPresence(
  roomId: string,
  userId: string,
  onUpdate: (users: PresenceState[]) => void
): RealtimeChannel {
  const supabase = createClient();
  const channel = supabase.channel(`presence:${roomId}`, {
    config: {
      presence: { key: userId },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceState>();
      const users = Object.values(state).flat();
      onUpdate(users);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId,
          onlineAt: new Date().toISOString(),
        });
      }
    });

  return channel;
}
