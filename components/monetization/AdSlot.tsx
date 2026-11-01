interface AdSlotProps {
  position: "sidebar" | "banner" | "inline";
  className?: string;
}

export default function AdSlot({ position, className = "" }: AdSlotProps) {
  // Placeholder for ad integration (AdSense, Mediavine, etc.)
  // Replace the inner content with your ad script when ready
  const sizes = {
    sidebar: "w-full h-[250px]",
    banner: "w-full h-[90px]",
    inline: "w-full h-[120px]",
  };

  return (
    <div
      className={`${sizes[position]} ${className} glass-panel rounded-lg flex items-center justify-center overflow-hidden`}
      data-ad-slot={position}
    >
      <div className="text-center opacity-20">
        <p className="text-[10px] font-[family-name:var(--font-chat)] text-vice-cyan/50">
          AD SPACE
        </p>
      </div>
    </div>
  );
}
