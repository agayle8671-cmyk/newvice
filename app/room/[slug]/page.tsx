import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import HomeClient from "@/components/HomeClient";

// Allow blocking prerender for this dynamic route
export const instant = false;

interface RoomPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    title: `${title} — LeonidaVice.com`,
    description: `Watch GTA VI content together in the ${title}. Real-time chat, live community, Vice City vibes.`,
  };
}

async function RoomLoader({ slug }: { slug: string }) {
  await connection();

  let roomTitle = slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  let videoId = "QdBZY2fkU-0";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createServerSupabaseClient } = await import(
        "@/lib/supabase/server"
      );
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase
        .from("rooms")
        .select("title, current_video_id, is_active")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (data) {
        roomTitle = data.title;
        videoId = data.current_video_id || videoId;
      }
    } catch {
      // Use defaults
    }
  }

  return (
    <HomeClient roomSlug={slug} roomTitle={roomTitle} videoId={videoId} />
  );
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-white text-black flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#e04040] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs uppercase tracking-widest font-bold text-black/70">
              Loading Live Broadcast...
            </p>
          </div>
        </div>
      }
    >
      <RoomLoader slug={slug} />
    </Suspense>
  );
}
