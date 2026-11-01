import type { RealtimeChannel } from "@supabase/supabase-js";

export interface VideoSyncPayload {
  videoId: string;
  seekTo?: number;
  timestamp: number;
}

export interface VideoSyncCallbacks {
  onVideoChange: (videoId: string) => void;
  onSeek: (seekTo: number) => void;
}

/**
 * Subscribe to video sync broadcasts for a room.
 * Returns the channel for cleanup.
 */
export async function subscribeToVideoSync(
  roomSlug: string,
  callbacks: VideoSyncCallbacks
): Promise<RealtimeChannel | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const channel = supabase.channel(`room-media-sync:${roomSlug}`, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on("broadcast", { event: "video_change" }, ({ payload }) => {
      const data = payload as VideoSyncPayload;
      callbacks.onVideoChange(data.videoId);
    })
    .on("broadcast", { event: "video_seek" }, ({ payload }) => {
      const data = payload as VideoSyncPayload;
      if (data.seekTo !== undefined) {
        callbacks.onSeek(data.seekTo);
      }
    })
    .subscribe();

  return channel;
}

/**
 * Broadcast a video change to all viewers in a room.
 * Typically called by admin-role users.
 */
export async function broadcastVideoChange(
  channel: RealtimeChannel,
  videoId: string
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: "video_change",
    payload: {
      videoId,
      timestamp: Date.now(),
    } as VideoSyncPayload,
  });
}

/**
 * Broadcast a seek position to all viewers.
 */
export async function broadcastSeek(
  channel: RealtimeChannel,
  seekTo: number
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: "video_seek",
    payload: {
      videoId: "",
      seekTo,
      timestamp: Date.now(),
    } as VideoSyncPayload,
  });
}
