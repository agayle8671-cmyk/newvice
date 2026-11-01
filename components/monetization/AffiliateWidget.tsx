"use client";

import { useMemo } from "react";
import GlassPanel from "@/components/ui/GlassPanel";

interface AffiliateLink {
  title: string;
  description: string;
  icon: string;
  url: string;
  tag: string;
  categoryMode: "pc" | "console" | "all";
}

const AFFILIATE_CATALOG: AffiliateLink[] = [
  {
    title: "GTA VI Collector's Reserve",
    description: "Official Launch Day Notification & Pre-Order",
    icon: "🎮",
    url: "https://www.rockstargames.com/VI",
    tag: "HOT",
    categoryMode: "console",
  },
  {
    title: "PS5 Pro 2TB Vice Bundle",
    description: "60 FPS Ray-Traced Leonida Console Target",
    icon: "🕹️",
    url: "https://direct.playstations.com",
    tag: "LAUNCH SPEC",
    categoryMode: "console",
  },
  {
    title: "RTX 5080 16GB Founders",
    description: "4K Ultra Path-Tracing & Mod Showcase GPU",
    icon: "💻",
    url: "https://www.nvidia.com",
    tag: "4K ULTRA",
    categoryMode: "pc",
  },
  {
    title: "4K 240Hz QD-OLED Monitor",
    description: "True-Black HDR1000 Vice Neon Display",
    icon: "🖥️",
    url: "https://www.amazon.com",
    tag: "HDR1000",
    categoryMode: "pc",
  },
  {
    title: "4TB Gen5 NVMe DirectStorage",
    description: "Zero-Pop-In Vice City Streaming SSD",
    icon: "⚡",
    url: "https://www.amazon.com",
    tag: "7,400 MB/S",
    categoryMode: "pc",
  },
  {
    title: "3D Spatial Wireless Headset",
    description: "Tuned for FM 88.6 & Car Crew Spatial Cabins",
    icon: "🎧",
    url: "https://www.amazon.com",
    tag: "SPATIAL 3D",
    categoryMode: "all",
  },
];

interface AffiliateWidgetProps {
  activeCategory?: string | null;
  activeClipTitle?: string | null;
}

export default function AffiliateWidget({
  activeCategory,
  activeClipTitle,
}: AffiliateWidgetProps) {
  // Dynamically prioritize PC Modding/GPU benchmarks during Analysis/Mod clips,
  // and Console/Game bundles during Trailers/Gameplay/Stunts (as specified in the Word Doc).
  const isPcFocused = useMemo(() => {
    const text = `${activeCategory ?? ""} ${activeClipTitle ?? ""}`.toLowerCase();
    return (
      text.includes("analysis") ||
      text.includes("mod") ||
      text.includes("pc") ||
      text.includes("rtx") ||
      text.includes("shader") ||
      text.includes("benchmark")
    );
  }, [activeCategory, activeClipTitle]);

  const prioritizedLinks = useMemo(() => {
    const preferredMode = isPcFocused ? "pc" : "console";
    return [...AFFILIATE_CATALOG]
      .sort((a, b) => {
        const aScore = a.categoryMode === preferredMode ? 2 : a.categoryMode === "all" ? 1 : 0;
        const bScore = b.categoryMode === preferredMode ? 2 : b.categoryMode === "all" ? 1 : 0;
        return bScore - aScore;
      })
      .slice(0, 4);
  }, [isPcFocused]);

  return (
    <GlassPanel
      neonBorder="pink"
      className="p-2.5 bg-[#09051d]/90 shrink-0"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-[family-name:var(--font-display)] font-black text-[#00f3ff] tracking-widest uppercase">
            🔥 {isPcFocused ? "MOD & 4K RIG SPEC" : "LEONIDA LAUNCH GEAR"}
          </span>
        </div>
        <span className="text-[8px] font-[family-name:var(--font-chat)] px-1.5 py-0.5 rounded bg-[#ff007f]/15 text-[#ff007f] border border-[#ff007f]/35 uppercase">
          {activeCategory ? `SYNCED: ${activeCategory}` : "CURATED"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
        {prioritizedLinks.map((link) => (
          <a
            key={link.title}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/40 hover:bg-[#ff007f]/15 border border-white/5 hover:border-[#ff007f]/40 transition-all group"
          >
            <span className="text-base shrink-0">{link.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-[family-name:var(--font-display)] font-bold text-gray-100 group-hover:text-[#00f3ff] transition-colors truncate">
                  {link.title}
                </span>
                {link.tag && (
                  <span className="text-[8px] font-[family-name:var(--font-display)] font-bold bg-[#ff007f]/25 text-[#ffdd00] border border-[#ff007f]/40 px-1.5 py-0.2 rounded-full shrink-0">
                    {link.tag}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-[#00f3ff]/55 font-[family-name:var(--font-chat)] truncate">
                {link.description}
              </p>
            </div>
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              className="text-[#00f3ff]/35 group-hover:text-[#ff007f] transition-colors shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 2L8 6L4 10" />
            </svg>
          </a>
        ))}
      </div>
    </GlassPanel>
  );
}
