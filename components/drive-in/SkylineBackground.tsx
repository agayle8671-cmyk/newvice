export default function SkylineBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* Night Sky Gradient */}
      <div className="absolute inset-0 sky-gradient" />

      {/* Stars */}
      <div className="absolute inset-0 stars" />

      {/* City Skyline Silhouette */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        style={{ height: "35%" }}
      >
        {/* Distant buildings glow */}
        <defs>
          <linearGradient id="skylineGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff007f" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2d004d" stopOpacity="0.8" />
          </linearGradient>
          <filter id="buildingGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Skyline buildings */}
        <g fill="#0d0015" filter="url(#buildingGlow)">
          {/* Left cluster */}
          <rect x="40" y="100" width="30" height="100" rx="1" />
          <rect x="75" y="70" width="25" height="130" rx="1" />
          <rect x="105" y="90" width="35" height="110" rx="1" />
          <rect x="145" y="50" width="20" height="150" rx="1" />
          <rect x="170" y="80" width="40" height="120" rx="1" />

          {/* Center cluster (taller) */}
          <rect x="340" y="60" width="25" height="140" rx="1" />
          <rect x="370" y="30" width="30" height="170" rx="1" />
          <rect x="405" y="45" width="35" height="155" rx="1" />
          <rect x="445" y="70" width="20" height="130" rx="1" />

          {/* Right of center */}
          <rect x="600" y="55" width="28" height="145" rx="1" />
          <rect x="635" y="75" width="22" height="125" rx="1" />
          <rect x="662" y="40" width="35" height="160" rx="1" />
          <rect x="702" y="65" width="25" height="135" rx="1" />

          {/* Right cluster */}
          <rect x="900" y="80" width="30" height="120" rx="1" />
          <rect x="935" y="50" width="25" height="150" rx="1" />
          <rect x="965" y="70" width="40" height="130" rx="1" />
          <rect x="1010" y="90" width="20" height="110" rx="1" />

          {/* Far right */}
          <rect x="1200" y="75" width="30" height="125" rx="1" />
          <rect x="1235" y="55" width="25" height="145" rx="1" />
          <rect x="1265" y="85" width="35" height="115" rx="1" />
          <rect x="1340" y="95" width="28" height="105" rx="1" />
          <rect x="1380" y="70" width="22" height="130" rx="1" />
        </g>

        {/* Building window lights */}
        <g fill="#ff007f" opacity="0.4">
          <rect x="80" y="80" width="3" height="3" />
          <rect x="80" y="90" width="3" height="3" />
          <rect x="87" y="75" width="3" height="3" />
          <rect x="375" y="40" width="3" height="3" />
          <rect x="375" y="50" width="3" height="3" />
          <rect x="385" y="45" width="3" height="3" />
          <rect x="385" y="60" width="3" height="3" />
          <rect x="670" y="50" width="3" height="3" />
          <rect x="670" y="65" width="3" height="3" />
          <rect x="680" y="55" width="3" height="3" />
          <rect x="940" y="60" width="3" height="3" />
          <rect x="940" y="75" width="3" height="3" />
          <rect x="1240" y="65" width="3" height="3" />
          <rect x="1240" y="80" width="3" height="3" />
        </g>

        {/* Ambient glow at horizon */}
        <rect x="0" y="160" width="1440" height="40" fill="url(#skylineGlow)" />
      </svg>

      {/* Palm Trees */}
      <svg
        className="absolute bottom-0 left-[5%] z-10"
        width="80"
        height="180"
        viewBox="0 0 80 180"
        fill="none"
      >
        <path d="M40 180V60" stroke="#1a0033" strokeWidth="5" strokeLinecap="round" />
        <path d="M40 60C30 40 10 35 0 40C12 30 30 30 40 45C50 30 68 30 80 40C70 35 50 40 40 60Z" fill="#0d001a" />
        <path d="M30 70C20 60 5 62 0 68C10 58 22 60 30 68" stroke="#1a0033" strokeWidth="2" />
        <path d="M50 70C60 60 75 62 80 68C70 58 58 60 50 68" stroke="#1a0033" strokeWidth="2" />
      </svg>
      <svg
        className="absolute bottom-0 right-[8%] z-10"
        width="70"
        height="160"
        viewBox="0 0 80 180"
        fill="none"
      >
        <path d="M40 180V65" stroke="#1a0033" strokeWidth="4" strokeLinecap="round" />
        <path d="M40 65C30 45 10 40 0 45C12 35 30 35 40 50C50 35 68 35 80 45C70 40 50 45 40 65Z" fill="#0d001a" />
        <path d="M30 75C20 65 5 67 0 73C10 63 22 65 30 73" stroke="#1a0033" strokeWidth="2" />
        <path d="M50 75C60 65 75 67 80 73C70 63 58 65 50 73" stroke="#1a0033" strokeWidth="2" />
      </svg>

      {/* Horizon glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/3"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255,0,127,0.15) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
