import type { Article, CategorySlug } from "./types";
import { CATEGORIES, getChildren } from "./categories";
import { TRAILERS_MEDIA_ARTICLES } from "./articles/trailers-media";
import { CHARACTERS_STORY_ARTICLES } from "./articles/characters-story";
import { LEAKS_TECH_ARTICLES } from "./articles/leaks-tech";
import { LEONIDA_VEHICLES_ARTICLES } from "./articles/leonida-vehicles";

/** Built-in static baseline articles, newest first. */
export const ARTICLES: Article[] = [
  ...TRAILERS_MEDIA_ARTICLES,
  ...CHARACTERS_STORY_ARTICLES,
  ...LEAKS_TECH_ARTICLES,
  ...LEONIDA_VEHICLES_ARTICLES,
].sort((a, b) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)
);

// ─── Live Reactive Store (hydrated from /api/articles on the client) ─────────
let liveArticles: Article[] = ARTICLES;
let liveVersion = 0;
let hydratedOnce = false;
let inflightPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function subscribeArticles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getArticlesVersion(): number {
  return liveVersion;
}

export function setLiveArticles(nextList: Article[]): void {
  if (!Array.isArray(nextList) || nextList.length === 0) return;
  liveArticles = nextList;
  liveVersion += 1;
  hydratedOnce = true;
  listeners.forEach((fn) => fn());
}

export async function refreshLiveArticles(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydratedOnce && !force) return;
  if (inflightPromise && !force) return inflightPromise;

  inflightPromise = fetch("/api/articles", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.ok && Array.isArray(data.articles) && data.articles.length > 0) {
        setLiveArticles(data.articles);
      } else {
        hydratedOnce = true;
      }
    })
    .catch(() => {
      // Keep static baseline seamlessly if offline
    })
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
}

/** Returns the active article list (merged live articles once hydrated, or built-in ARTICLES). */
export function getAllArticles(): Article[] {
  return liveArticles;
}

export function getArticle(slug: string): Article | undefined {
  return liveArticles.find((a) => a.slug === slug);
}

/** Articles in a category, including its sub-categories (WordPress behaviour). */
export function byCategory(slug: CategorySlug | string): Article[] {
  const kids = getChildren(slug as CategorySlug).map((c) => c.slug);
  const set = new Set<string>([slug, ...kids]);
  return liveArticles.filter((a) => set.has(a.category));
}

export function byAuthor(slug: string): Article[] {
  return liveArticles.filter((a) => a.author === slug);
}

export function byTag(tag: string): Article[] {
  const t = tag.toLowerCase();
  return liveArticles.filter((a) => a.tags.some((x) => slugify(x) === t));
}

export function allTags(): string[] {
  const s = new Set<string>();
  liveArticles.forEach((a) => a.tags.forEach((t) => s.add(t)));
  return Array.from(s);
}

export function search(q: string): Article[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return liveArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(needle) ||
      a.excerpt.toLowerCase().includes(needle) ||
      a.tags.some((t) => t.toLowerCase().includes(needle)) ||
      a.body.some((b) =>
        "text" in b ? b.text.toLowerCase().includes(needle) : false
      )
  );
}

/** Deterministic "most popular" ranking, topped by any admin-pinned featuredRank (1..5). */
const POPULAR_ORDER = [
  "lucia-caminos-first-female-protagonist-hd-universe",
  "gta-vi-release-date-november-19-2026-everything-confirmed",
  "vice-city-districts-mapped-vice-beach-to-port-vc",
  "jason-and-lucia-relationship-bar-explained",
  "the-september-2022-leak-what-it-really-revealed",
  "base-ps5-30fps-1440p-digital-foundry-verdict",
  "donks-airboats-and-the-confirmed-vehicle-list",
];

export function popular(n = 5): Article[] {
  const pinned = liveArticles
    .filter((a) => typeof a.featuredRank === "number" && a.featuredRank >= 1)
    .sort((a, b) => (a.featuredRank ?? 99) - (b.featuredRank ?? 99));

  const pinnedSlugs = new Set(pinned.map((a) => a.slug));
  const ranked = POPULAR_ORDER.map((s) => getArticle(s)).filter(
    (a): a is Article => Boolean(a) && !pinnedSlugs.has(a!.slug)
  );
  const included = new Set([...pinned, ...ranked].map((a) => a.slug));
  const rest = liveArticles.filter((a) => !included.has(a.slug));
  return [...pinned, ...ranked, ...rest].slice(0, n);
}

export function latest(n = 10, skip = 0): Article[] {
  return liveArticles.slice(skip, skip + n);
}

export function related(a: Article, n = 6): Article[] {
  const same = byCategory(topLevel(a.category)).filter((x) => x.slug !== a.slug);
  return same.slice(0, n);
}

export function prevNext(a: Article): { prev?: Article; next?: Article } {
  const i = liveArticles.findIndex((x) => x.slug === a.slug);
  if (i === -1) {
    return { prev: liveArticles[0], next: undefined };
  }
  return { prev: liveArticles[i + 1], next: liveArticles[i - 1] };
}

export function topLevel(slug: CategorySlug): CategorySlug {
  const c = CATEGORIES.find((x) => x.slug === slug);
  return (c?.parent ?? slug) as CategorySlug;
}

export function categoryName(slug: CategorySlug | string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? String(slug);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[(m || 1) - 1] ?? "November"} ${d || 1}, ${y || 2026}`;
}

export function articleHref(a: Article | string): string {
  return `/article/${typeof a === "string" ? a : a.slug}`;
}

export function categoryHref(slug: string): string {
  return `/category/${slug}`;
}
