interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
}

export default function GlassPanel({ children, className = "" }: GlassPanelProps) {
  return (
    <div className={`glass-panel rounded-lg ${className}`}>
      {children}
    </div>
  );
}
