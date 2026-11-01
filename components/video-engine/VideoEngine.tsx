"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import NowPlaying from "./NowPlaying";
import type { VideoItem } from "@/lib/video/types";

const HTML5Player = dynamic(
  () => import("./HTML5Player"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00f3ff] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

interface VideoEngineProps {
  /** Called whenever the currently-playing video changes */
  onItemChange?: (item: VideoItem | null) => void;
  /** Show the NowPlaying strip inside this component */
  showNowPlaying?: boolean;
}

export default function VideoEngine({ onItemChange, showNowPlaying = false }: VideoEngineProps) {
  const [currentItem, setCurrentItem] = useState<VideoItem | null>(null);

  const handleItemChange = useCallback(
    (item: VideoItem | null) => {
      setCurrentItem(item);
      onItemChange?.(item);
    },
    [onItemChange]
  );

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className={showNowPlaying ? "flex-1 relative overflow-hidden" : "w-full h-full relative overflow-hidden"}>
        <HTML5Player onItemChange={handleItemChange} />
      </div>
      {showNowPlaying && (
        <div style={{ height: "22px", flexShrink: 0 }}>
          <NowPlaying item={currentItem} />
        </div>
      )}
    </div>
  );
}
