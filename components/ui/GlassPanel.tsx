interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  neonBorder?: "cyan" | "pink" | "none";
}

export default function GlassPanel({
  children,
  className = "",
  neonBorder = "none",
}: GlassPanelProps) {
  const borderClass =
    neonBorder === "cyan"
      ? "neon-border-cyan"
      : neonBorder === "pink"
      ? "neon-border-pink"
      : "";

  return (
    <div className={`glass-panel rounded-lg ${borderClass} ${className}`}>
      {children}
    </div>
  );
}
