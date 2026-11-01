"use client";

import { motion, AnimatePresence } from "framer-motion";

interface PresenceCounterProps {
  count: number;
}

export default function PresenceCounter({ count }: PresenceCounterProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vice-cyan/10">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={count}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="text-xs font-[family-name:var(--font-chat)] text-neon-green"
          >
            {count}
          </motion.span>
        </AnimatePresence>
        <span className="text-[10px] font-[family-name:var(--font-chat)] text-vice-cyan/40 tracking-wider">
          CARS PARKED
        </span>
      </div>
    </div>
  );
}
