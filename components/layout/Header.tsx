"use client";

import { motion } from "framer-motion";

export default function Header() {
  return (
    <header className="relative z-30 w-full py-3 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center gap-3"
        >
          {/* Palm Tree Icon */}
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            className="drop-shadow-[0_0_8px_#ff007f]"
          >
            <path
              d="M18 34V16M18 16C14 10 8 8 4 10C8 6 14 6 18 10C22 6 28 6 32 10C28 8 22 10 18 16Z"
              stroke="#ff007f"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 18C10 16 6 18 4 22C8 18 12 18 14 20"
              stroke="#00f3ff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M22 18C26 16 30 18 32 22C28 18 24 18 22 20"
              stroke="#00f3ff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>

          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-black tracking-wider">
              <span className="neon-text-pink text-vice-pink">LEONIDA</span>
              <span className="neon-text-cyan text-vice-cyan">VICE</span>
              <span className="text-vice-pink text-sm">.COM</span>
            </h1>
            <p className="text-[10px] sm:text-xs tracking-[0.3em] text-vice-cyan/60 uppercase">
              The Ultimate GTA VI Discussion Hub
            </p>
          </div>
        </motion.div>

        {/* Right side — Online count */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex items-center gap-2"
        >
          <div className="hidden sm:flex items-center gap-2 glass-panel rounded-full px-4 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
            </span>
            <span className="text-xs font-[family-name:var(--font-chat)] text-neon-green">
              LIVE
            </span>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
