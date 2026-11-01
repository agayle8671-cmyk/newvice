import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Admin-only: force a room's current video / seek position.
// Authenticates the caller's Supabase access token from the Authorization header
// (previously the header was only checked for a "Bearer " prefix and never verified).

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const roomSlug = typeof body?.roomSlug === "string" ? body.roomSlug.slice(0, 64) : "";
    const videoId = typeof body?.videoId === "string" ? body.videoId.slice(0, 120) : "";
    const seekTo = body?.seekTo;

    if (!roomSlug) {
      return NextResponse.json({ error: "Missing roomSlug" }, { status: 400 });
    }
    if (!videoId && (typeof seekTo !== "number" || !Number.isFinite(seekTo) || seekTo < 0)) {
      return NextResponse.json({ error: "Must provide videoId or a valid seekTo" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Server not configured for admin operations" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the JWT with Supabase Auth (signature + expiry), then check the admin role.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    if (videoId) {
      await supabase.from("rooms").update({ current_video_id: videoId }).eq("slug", roomSlug);
    }

    const channel = supabase.channel(`room-media-sync:${roomSlug}`);
    if (videoId) {
      await channel.send({
        type: "broadcast",
        event: "video_change",
        payload: { videoId, timestamp: Date.now() },
      });
    }
    if (typeof seekTo === "number") {
      await channel.send({
        type: "broadcast",
        event: "video_seek",
        payload: { videoId, seekTo, timestamp: Date.now() },
      });
    }
    await supabase.removeChannel(channel);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
