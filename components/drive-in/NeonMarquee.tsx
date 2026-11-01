"use client";

import { motion } from "framer-motion";

interface NeonMarqueeProps {
  children: React.ReactNode;
}

export default function NeonMarquee({ children }: NeonMarqueeProps) {
  return (
    <div className="drive-in-stage w-full max-w-5xl mx-auto px-2 sm:px-4">
      {/* Festoon string lights above the screen */}
      <div className="festoon-lights w-[110%] -ml-[5%] mb-2" />

      {/* Screen Assembly */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
        className="relative"
      >
        {/* Outer glow frame */}
        <div className="absolute -inset-1 sm:-inset-2 rounded-xl bg-gradient-to-b from-vice-pink/20 via-transparent to-vice-cyan/10 blur-sm" />

        {/* Marquee border */}
        <div className="relative neon-border-pink rounded-lg overflow-hidden">
          {/* Top marquee bar */}
          <div className="relative bg-gradient-to-r from-vice-deep-purple via-vice-purple to-vice-deep-purple py-1.5 sm:py-2 px-3 sm:px-4 border-b border-vice-pink/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-vice-pink text-[10px] sm:text-xs font-[family-name:var(--font-display)] tracking-widest">
                  ★ DRIVE-IN SCREEN ★
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-vice-cyan/60 text-[10px] sm:text-xs font-[family-name:var(--font-chat)]">
                  NOW SHOWING
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-vice-pink animate-pulse" />
              </div>
            </div>
          </div>

          {/* Screen content */}
          <div className="relative aspect-video bg-black">
            {children}
          </div>
        </div>

        {/* Screen support pillars */}
        <div className="flex justify-between px-8 sm:px-16">
          <div className="w-3 h-8 bg-gradient-to-b from-vice-purple/50 to-transparent" />
          <div className="w-3 h-8 bg-gradient-to-b from-vice-purple/50 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
