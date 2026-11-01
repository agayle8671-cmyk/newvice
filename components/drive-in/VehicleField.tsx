"use client";

import { motion } from "framer-motion";

export default function VehicleField() {
  const vehicles = [
    { x: "8%", scale: 1.1, type: "muscle", delay: 0.5 },
    { x: "22%", scale: 1.0, type: "sports", delay: 0.7 },
    { x: "38%", scale: 0.95, type: "truck", delay: 0.6 },
    { x: "55%", scale: 1.05, type: "muscle", delay: 0.8 },
    { x: "70%", scale: 0.9, type: "sports", delay: 0.9 },
    { x: "85%", scale: 1.0, type: "truck", delay: 0.7 },
  ];

  return (
    <div className="relative w-full h-16 sm:h-24 mt-2 overflow-hidden">
      {/* Ground/Lot surface */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-dark via-vice-deep-purple/80 to-transparent" />

      {/* Vehicle silhouettes */}
      {vehicles.map((v, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: v.delay }}
          className="absolute bottom-1 sm:bottom-2"
          style={{ left: v.x, transform: `scale(${v.scale})` }}
        >
          {v.type === "muscle" && <MuscleCar />}
          {v.type === "sports" && <SportsCar />}
          {v.type === "truck" && <Truck />}
        </motion.div>
      ))}

      {/* Ground reflection line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-vice-pink/30 to-transparent" />
    </div>
  );
}

function MuscleCar() {
  return (
    <svg width="60" height="24" viewBox="0 0 60 24" fill="none">
      <rect x="8" y="8" width="44" height="12" rx="3" fill="#0d001a" />
      <rect x="12" y="4" width="28" height="10" rx="2" fill="#0d001a" />
      <rect x="14" y="5" width="10" height="6" rx="1" fill="#1a0033" opacity="0.5" />
      <rect x="28" y="5" width="10" height="6" rx="1" fill="#1a0033" opacity="0.5" />
      <circle cx="16" cy="21" r="3" fill="#0d001a" />
      <circle cx="44" cy="21" r="3" fill="#0d001a" />
      {/* Tail lights */}
      <rect x="52" y="11" width="2" height="3" rx="0.5" fill="#ff007f" opacity="0.8" />
      <rect x="52" y="15" width="2" height="2" rx="0.5" fill="#ff007f" opacity="0.5" />
    </svg>
  );
}

function SportsCar() {
  return (
    <svg width="55" height="22" viewBox="0 0 55 22" fill="none">
      <rect x="5" y="10" width="45" height="9" rx="4" fill="#0d001a" />
      <rect x="14" y="5" width="24" height="9" rx="3" fill="#0d001a" />
      <rect x="16" y="6" width="8" height="5" rx="1" fill="#1a0033" opacity="0.5" />
      <rect x="27" y="6" width="8" height="5" rx="1" fill="#1a0033" opacity="0.5" />
      <circle cx="14" cy="19" r="2.5" fill="#0d001a" />
      <circle cx="41" cy="19" r="2.5" fill="#0d001a" />
      {/* Tail lights */}
      <rect x="50" y="12" width="2" height="2" rx="0.5" fill="#ff007f" opacity="0.8" />
      <rect x="50" y="15" width="2" height="2" rx="0.5" fill="#ff6b00" opacity="0.6" />
    </svg>
  );
}

function Truck() {
  return (
    <svg width="65" height="26" viewBox="0 0 65 26" fill="none">
      <rect x="5" y="10" width="55" height="12" rx="2" fill="#0d001a" />
      <rect x="35" y="4" width="20" height="12" rx="2" fill="#0d001a" />
      <rect x="37" y="5" width="7" height="6" rx="1" fill="#1a0033" opacity="0.5" />
      <rect x="47" y="5" width="7" height="6" rx="1" fill="#1a0033" opacity="0.5" />
      <circle cx="16" cy="23" r="3" fill="#0d001a" />
      <circle cx="50" cy="23" r="3" fill="#0d001a" />
      {/* Tail lights */}
      <rect x="3" y="13" width="2" height="3" rx="0.5" fill="#ff007f" opacity="0.8" />
    </svg>
  );
}
