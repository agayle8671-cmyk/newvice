"use client";

import Link from "next/link";

interface HouseAdBannerProps {
  variant?: "leaderboard" | "leaderboard-band" | "square";
}

export default function HouseAdBanner({ variant = "leaderboard-band" }: HouseAdBannerProps) {
  if (variant === "square") {
    return (
      <Link
        href="/contact?topic=advertising"
        className="block relative overflow-hidden border border-black group select-none"
        style={{ height: 250, background: "#111111" }}
      >
        <img
          src="/images/gta/vice_city_03.jpg"
          alt="Advertise with Leonida Vice"
          className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:scale-105 transition-transform duration-500"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.92) 0%, rgba(18,18,18,0.72) 55%, rgba(224,64,64,0.38) 100%)",
          }}
        />
        {/* Geometric tagDiv-style corner triangles */}
        <div
          className="absolute left-4 bottom-4 w-8 h-8 border-l-2 border-b-2 border-white/60 pointer-events-none"
        />
        <div
          className="absolute right-4 top-4 px-2 py-0.5 text-[10px] tracking-[0.2em] uppercase text-white/80 border border-white/30 np-ui"
        >
          300×250 AD SLOT
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-5">
          <div
            className="text-white tracking-wider uppercase"
            style={{
              fontFamily: "var(--f-logo)",
              fontWeight: 900,
              fontSize: 34,
              lineHeight: 1,
            }}
          >
            LEONIDA VICE
          </div>
          <div className="mt-1.5 text-[11px] tracking-[0.22em] uppercase text-[#e04040] font-bold np-ui">
            MEDIA &amp; BROADCAST NETWORK
          </div>
          <p className="mt-3 text-xs text-white/85 np-ui leading-relaxed">
            Reach thousands of daily GTA VI readers &amp; live broadcast viewers across Vice City.
          </p>
          <span className="mt-4 inline-block bg-[#e04040] group-hover:bg-white group-hover:text-black text-white text-xs font-bold tracking-[0.16em] uppercase px-4 py-2 transition-colors np-ui">
            ADVERTISE WITH US →
          </span>
        </div>
      </Link>
    );
  }

  const banner = (
    <Link
      href="/contact?topic=advertising"
      className="block relative mx-auto overflow-hidden border border-black group select-none"
      style={{ maxWidth: 980, height: 90, background: "#141414" }}
    >
      <img
        src="/images/gta/vice_city_11.jpg"
        alt="Advertise with Leonida Vice"
        className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:scale-105 transition-transform duration-700"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(20,20,20,0.82) 55%, rgba(10,10,10,0.94) 100%)",
        }}
      />
      <div className="relative z-10 h-full px-5 sm:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Geometric play-chevron emblem matching the demo 980x90 banner */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <span
              className="inline-block w-0 h-0"
              style={{
                borderTop: "14px solid transparent",
                borderBottom: "14px solid transparent",
                borderLeft: "20px solid #e04040",
              }}
            />
            <span
              className="inline-block w-0 h-0 opacity-40"
              style={{
                borderTop: "14px solid transparent",
                borderBottom: "14px solid transparent",
                borderLeft: "20px solid #ffffff",
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span
                className="text-white uppercase tracking-wide"
                style={{
                  fontFamily: "var(--f-logo)",
                  fontWeight: 900,
                  fontSize: "clamp(22px, 2.5vw, 32px)",
                  lineHeight: 1,
                }}
              >
                LEONIDA VICE
              </span>
              <span className="text-[10px] sm:text-[11px] tracking-[0.24em] uppercase text-[#e04040] font-bold np-ui">
                ADVERTISE ON LEONIDA VICE
              </span>
            </div>
            <div className="text-[11px] sm:text-xs text-white/75 truncate np-ui mt-1">
              Sponsor the #1 GTA VI Newspaper &amp; Synchronized Live Broadcast Hub • Launch Window Nov 19, 2026
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline-block text-[10px] tracking-[0.24em] uppercase text-white/60 np-ui">
            980×90 HOUSE AD
          </span>
          <span className="bg-[#e04040] group-hover:bg-white group-hover:text-black text-white text-[11px] font-bold tracking-[0.16em] uppercase px-3.5 py-2 transition-colors np-ui">
            BOOK SLOT →
          </span>
        </div>
      </div>
    </Link>
  );

  if (variant === "leaderboard") {
    return <div className="py-4">{banner}</div>;
  }

  return (
    <div className="w-full bg-[#eeeeee] border-b border-black py-7 px-4">
      {banner}
    </div>
  );
}
