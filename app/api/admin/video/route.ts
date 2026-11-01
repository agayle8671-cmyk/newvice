import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomSlug, videoId, seekTo } = body;

    if (!roomSlug) {
      return NextResponse.json(
        { error: "Missing roomSlug" },
        { status: 400 }
      );
    }

    if (!videoId && seekTo === undefined) {
      return NextResponse.json(
        { error: "Must provide videoId or seekTo" },
        { status: 400 }
      );
    }

    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server not configured for admin operations" },
        { status: 503 }
      );
    }

    // Verify admin auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { createServerSupabaseClient } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin access required" },
        { status: 403 }
      );
    }

    // Update the room's current video if videoId provided
    if (videoId) {
      await supabase
        .from("rooms")
        .update({ current_video_id: videoId })
        .eq("slug", roomSlug);
    }

    // Broadcast via Supabase Realtime (server-side)
    const channelName = `room-media-sync:${roomSlug}`;
    const channel = supabase.channel(channelName);

    if (videoId) {
      await channel.send({
        type: "broadcast",
        event: "video_change",
        payload: { videoId, timestamp: Date.now() },
      });
    }

    if (seekTo !== undefined) {
      await channel.send({
        type: "broadcast",
        event: "video_seek",
        payload: { videoId: videoId || "", seekTo, timestamp: Date.now() },
      });
    }

    await supabase.removeChannel(channel);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
