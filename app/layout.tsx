import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth/context";
import RouteProgressBar from "@/components/RouteProgressBar";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://newvice.vercel.app"
  ),
  title: "Leonida Vice — GTA VI News, Leaks & Live Broadcast Magazine",
  description:
    "Independent Grand Theft Auto VI investigative magazine and live synchronized community broadcast covering Vice City, the State of Leonida, characters, trailers, RAGE 9 tech, and vehicles.",
  keywords: [
    "GTA VI",
    "GTA 6",
    "Grand Theft Auto VI",
    "Leonida",
    "Vice City",
    "Leonida Vice",
    "GTA VI news",
    "GTA VI leaks",
    "GTA VI trailers",
    "Rockstar Games",
  ],
  openGraph: {
    title: "Leonida Vice — GTA VI News, Leaks & Live Broadcast Magazine",
    description:
      "Read 52+ investigative dispatches and watch the synchronized GTA VI live community broadcast with 800% Forensic Loupe, X-Ray Telemetry, and real-time Citizen Wire chat.",
    url: "https://newvice.vercel.app",
    siteName: "Leonida Vice",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/images/gta/jason_lucia_lock_and_load_landscape.jpg",
        width: 1920,
        height: 1080,
        alt: "Leonida Vice — GTA VI News, Leaks & Live Broadcast Magazine",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Leonida Vice — GTA VI News & Live Broadcast Magazine",
    description:
      "The State of Leonida's independent GTA VI newspaper & synchronized live broadcast hub.",
    images: ["/images/gta/jason_lucia_lock_and_load_landscape.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const THEME_INIT_SCRIPT = `try{var e=localStorage.getItem("lv_paper_edition");if(e==="night"||e==="day"){document.documentElement.setAttribute("data-edition",e);}}catch(_){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-edition="day" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Inline+Text:wght@700;800;900&family=Big+Shoulders+Text:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800;1,900&family=Orbitron:wght@400;500;600;700;800;900&family=Roboto+Slab:wght@300;400;500;600&family=Share+Tech+Mono&family=VT323&family=Work+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased min-h-screen overflow-x-hidden"
        style={{
          backgroundColor: "var(--np-bg, #F4EFE4)",
          color: "var(--np-ink, #111111)",
        }}
      >
        <AuthProvider>
          <Suspense fallback={null}>
            <RouteProgressBar />
          </Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
