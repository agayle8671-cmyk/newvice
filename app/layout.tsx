import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeonidaVice.com — The Ultimate GTA VI Discussion Hub",
  description:
    "Join the drive-in theatre experience. Watch GTA VI content together, chat in real-time, and connect with the community. The ultimate Leonida State fan hub.",
  keywords: [
    "GTA VI",
    "GTA 6",
    "Grand Theft Auto VI",
    "Leonida",
    "Vice City",
    "GTA VI community",
    "GTA VI chat",
    "GTA VI news",
    "GTA VI trailers",
    "Rockstar Games",
  ],
  openGraph: {
    title: "LeonidaVice.com — The Ultimate GTA VI Discussion Hub",
    description:
      "Watch GTA VI content together on the big screen. Real-time chat, live community, Vice City vibes.",
    url: "https://leonidavice.com",
    siteName: "LeonidaVice.com",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeonidaVice.com — GTA VI Drive-In Theatre",
    description:
      "The ultimate GTA VI discussion hub. Watch together. Chat live. Vice City vibes.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Share+Tech+Mono&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-surface-dark overflow-x-hidden">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
