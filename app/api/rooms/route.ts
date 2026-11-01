import { NextResponse } from "next/server";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Demo mode — return hardcoded rooms
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json([
      {
        slug: "main-theater",
        title: "Main Theater",
        description: "The main GTA VI live broadcast & community newsroom",
        current_video_id: "QdBZY2fkU-0",
        current_video_title: "GTA VI — Welcome to Leonida",
        is_active: true,
      },
    ]);
  }

  try {
    const { createServerSupabaseClient } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("slug, title, description, current_video_id, current_video_title, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch {
    // Fallback to demo data
    return NextResponse.json([
      {
        slug: "main-theater",
        title: "Main Theater",
        description: "The main GTA VI live broadcast & community newsroom",
        current_video_id: "QdBZY2fkU-0",
        current_video_title: "GTA VI — Welcome to Leonida",
        is_active: true,
      },
    ]);
  }
}
