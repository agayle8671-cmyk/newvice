interface NeonTextProps {
  children: React.ReactNode;
  color?: "pink" | "cyan" | "yellow";
  as?: "h1" | "h2" | "h3" | "span" | "p";
  className?: string;
}

export default function NeonText({
  children,
  color = "pink",
  as: Tag = "span",
  className = "",
}: NeonTextProps) {
  const colorMap = {
    pink: "text-vice-pink neon-text-pink",
    cyan: "text-vice-cyan neon-text-cyan",
    yellow: "text-vice-yellow neon-text-yellow",
  };

  return (
    <Tag
      className={`font-[family-name:var(--font-display)] ${colorMap[color]} ${className}`}
    >
      {children}
    </Tag>
  );
}
