// ─── Leonida Vice Newspaper — content model ──────────────────────────────────
// Mirrors the WordPress post/category/author structure of the tagDiv
// "Urban Observer PRO" demo so every template maps 1:1.

export type CategorySlug =
  | "trailers-media"
  | "trailers"
  | "radio-music"
  | "in-game-media"
  | "characters"
  | "leaks-rumors"
  | "story"
  | "leonida"
  | "tech-rage"
  | "vehicles-weapons";

export interface Category {
  slug: CategorySlug;
  name: string;
  /** Parent category (sub-categories, like the demo's Entertainment → Movies) */
  parent?: CategorySlug;
  description: string;
}

export interface Author {
  slug: string;
  name: string;
  role: string;
  bio: string;
  /** Initials rendered in the round avatar */
  initials: string;
}

export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "img"; src: string; caption?: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export type ArticlePreset =
  | "standard-feature"
  | "police-blotter"
  | "utility-guide"
  | "breaking-brief";

export type ArticleStatus = "published" | "draft" | "archived";

export interface Article {
  slug: string;
  title: string;
  category: CategorySlug;
  author: string; // Author.slug
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Path under /public or full HTTPS image URL */
  image: string;
  excerpt: string;
  readMins: number;
  tags: string[];
  body: Block[];
  // ── Optional Editorial / Admin Metadata ──
  preset?: ArticlePreset;
  status?: ArticleStatus;
  /** 1..5 pins this article into the TOP 5 / Front-Page Hero slots */
  featuredRank?: number;
  /** Optional crimson eyebrow badge above headline (e.g. "POLICE BLOTTER • VICE BEACH") */
  kicker?: string;
  /** ISO timestamp used to sort same-day dispatches newest-first */
  updatedAt?: string;
  /** Origin marker populated by the hybrid store */
  source?: "builtin" | "custom";
}
