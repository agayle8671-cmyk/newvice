"use client";

import { motion } from "framer-motion";
import GlassPanel from "@/components/ui/GlassPanel";

interface AffiliateLink {
  title: string;
  description: string;
  icon: string;
  url: string;
  tag: string;
}

const AFFILIATE_LINKS: AffiliateLink[] = [
  {
    title: "GTA VI",
    description: "Pre-Order Now",
    icon: "🎮",
    url: "#",
    tag: "HOT",
  },
  {
    title: "PS5 Pro",
    description: "Best GTA VI Experience",
    icon: "🕹️",
    url: "#",
    tag: "POPULAR",
  },
  {
    title: "RTX 5080",
    description: "4K Ultra Gaming",
    icon: "💻",
    url: "#",
    tag: "NEW",
  },
  {
    title: "Gaming Monitor",
    description: "4K 144Hz HDR",
    icon: "🖥️",
    url: "#",
    tag: "",
  },
];

export default function AffiliateWidget() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 1 }}
    >
      <GlassPanel className="p-3">
        <h3 className="text-xs font-[family-name:var(--font-display)] text-vice-cyan tracking-widest mb-3">
          🔥 POPULAR GEAR
        </h3>
        <div className="space-y-2">
          {AFFILIATE_LINKS.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-2.5 p-2 rounded-md hover:bg-vice-purple/30 transition-colors group"
            >
              <span className="text-lg">{link.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-[family-name:var(--font-display)] text-gray-200 group-hover:text-vice-pink transition-colors">
                    {link.title}
                  </span>
                  {link.tag && (
                    <span className="text-[8px] font-[family-name:var(--font-display)] bg-vice-pink/20 text-vice-pink px-1.5 py-0.5 rounded-full">
                      {link.tag}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-vice-cyan/40 font-[family-name:var(--font-chat)]">
                  {link.description}
                </span>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="text-vice-cyan/20 group-hover:text-vice-pink transition-colors shrink-0"
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
    </motion.div>
  );
}
