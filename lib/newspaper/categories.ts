import type { Author, Category, CategorySlug } from "./types";

// Demo mapping (Urban Observer PRO → Leonida Vice):
//   Entertainment (Movies / TV Shows / Music) → Trailers & Media (Trailers / Radio & Music / In-Game Media)
//   Celebrity  → Characters
//   Scandals   → Leaks & Rumors
//   Drama      → Story
//   Lifestyle  → Leonida
//   Technology → Tech & RAGE
//   Health     → Vehicles & Weapons
export const CATEGORIES: Category[] = [
  {
    slug: "trailers-media",
    name: "Trailers & Media",
    description: "Every official trailer, soundtrack drop and in-game broadcast from the State of Leonida.",
  },
  { slug: "trailers", name: "Trailers", parent: "trailers-media", description: "Frame-by-frame breakdowns of every official GTA VI trailer." },
  { slug: "radio-music", name: "Radio & Music", parent: "trailers-media", description: "Radio stations, licensed tracks and the sound of Vice City." },
  { slug: "in-game-media", name: "In-Game Media", parent: "trailers-media", description: "Parody apps, fake websites, billboards and the satirical internet of Leonida." },
  { slug: "characters", name: "Characters", description: "Jason, Lucia and the cast of hustlers, moguls and influencers running Leonida." },
  { slug: "leaks-rumors", name: "Leaks & Rumors", description: "What's confirmed, what's rumored and what's pure Leonida Man fiction." },
  { slug: "story", name: "Story", description: "The criminal conspiracy stretching across the State of Leonida." },
  { slug: "leonida", name: "Leonida", description: "Vice City, the Keys, the Grassrivers and every county in between." },
  { slug: "tech-rage", name: "Tech & RAGE", description: "Engine, performance, ray tracing and the systems behind the simulation." },
  { slug: "vehicles-weapons", name: "Vehicles & Weapons", description: "Cars, boats, donks and the grounded new arsenal." },
];

/** Top-level nav order (matches the demo's 7 menu items). */
export const NAV_CATEGORIES: CategorySlug[] = [
  "trailers-media",
  "characters",
  "leaks-rumors",
  "story",
  "leonida",
  "tech-rage",
  "vehicles-weapons",
];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getChildren(slug: CategorySlug): Category[] {
  return CATEGORIES.filter((c) => c.parent === slug);
}

export const AUTHORS: Author[] = [
  {
    slug: "marco-reyes",
    name: "Marco Reyes",
    initials: "MR",
    role: "Editor-in-Chief",
    bio: "Marco is the editor-in-chief of Leonida Vice, with more than 10 years covering Rockstar Games and open-world design. Detail-obsessed, he has broken down every trailer frame by frame and never trusts a rumor without a source. Always chasing the next big Leonida story!",
  },
  {
    slug: "dani-flores",
    name: "Dani Flores",
    initials: "DF",
    role: "Senior Writer — Characters & Story",
    bio: "Dani covers the people of Leonida — from Jason and Lucia to every hustler, influencer and smuggler in the Keys. She has been writing about Grand Theft Auto narratives since the Vice City Stories days.",
  },
  {
    slug: "tyler-knox",
    name: "Tyler Knox",
    initials: "TK",
    role: "Tech & Vehicles Editor",
    bio: "Tyler handles engine analysis, performance targets and the garage. If it has an exhaust, a muzzle or a ray-traced reflection, he has an opinion on it.",
  },
];

export function getAuthor(slug: string): Author {
  return AUTHORS.find((a) => a.slug === slug) ?? AUTHORS[0];
}

export const SITE = {
  name: "LEONIDA VICE",
  logoLeft: "LEONIDA",
  logoRight: "VICE",
  tagline: "GTA VI News, Leaks & Live Broadcast Magazine",
  about:
    "Leonida Vice is an independent, non-commercial fan publication covering Grand Theft Auto VI — news, breakdowns, leaks analysis and a live synchronized community broadcast. Not affiliated with Rockstar Games or Take-Two Interactive.",
};
