import fs from "fs/promises";
import path from "path";
import { cache } from "react";
import type { Article, ArticlePreset, ArticleStatus, Block, CategorySlug } from "./types";
import { TRAILERS_MEDIA_ARTICLES } from "./articles/trailers-media";
import { CHARACTERS_STORY_ARTICLES } from "./articles/characters-story";
import { LEAKS_TECH_ARTICLES } from "./articles/leaks-tech";
import { LEONIDA_VEHICLES_ARTICLES } from "./articles/leonida-vehicles";
import { getSupabaseAdmin, getSupabaseReader } from "@/lib/supabase/admin";

const BUILTIN_ARTICLES: Article[] = [
  ...TRAILERS_MEDIA_ARTICLES,
  ...CHARACTERS_STORY_ARTICLES,
  ...LEAKS_TECH_ARTICLES,
  ...LEONIDA_VEHICLES_ARTICLES,
].map((a) => ({
  ...a,
  status: "published" as const,
  source: "builtin" as const,
}));

interface LocalStorePayload {
  customArticles: Article[];
  archivedBuiltinSlugs: string[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_STORE_PATH = path.join(DATA_DIR, "newspaper-store.json");

export interface StorageHealth {
  localWritable: boolean;
  localArticleCount: number;
  supabaseConfigured: boolean;
  supabaseTableReady: boolean;
  supabaseArticleCount: number;
  supabaseNote?: string;
}

async function readLocalStore(): Promise<LocalStorePayload> {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      customArticles: Array.isArray(parsed.customArticles)
        ? parsed.customArticles
        : [],
      archivedBuiltinSlugs: Array.isArray(parsed.archivedBuiltinSlugs)
        ? parsed.archivedBuiltinSlugs
        : [],
    };
  } catch {
    return { customArticles: [], archivedBuiltinSlugs: [] };
  }
}

async function writeLocalStore(payload: LocalStorePayload): Promise<boolean> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      LOCAL_STORE_PATH,
      JSON.stringify(payload, null, 2),
      "utf8"
    );
    return true;
  } catch {
    // Read-only filesystem (e.g., Vercel serverless runtime)
    return false;
  }
}

interface SupabaseArticleRow {
  slug: string;
  title: string;
  category: string;
  author: string;
  date: string;
  image: string;
  excerpt: string;
  read_mins: number;
  tags: string[];
  body: Block[];
  preset: string | null;
  status: string | null;
  featured_rank: number | null;
  kicker: string | null;
  updated_at: string | null;
}

function rowToArticle(row: SupabaseArticleRow): Article {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category as CategorySlug,
    author: row.author || "marco-reyes",
    date: row.date,
    image: row.image,
    excerpt: row.excerpt,
    readMins: Number(row.read_mins) || 4,
    tags: Array.isArray(row.tags) ? row.tags : [],
    body: Array.isArray(row.body) ? row.body : [],
    preset: (row.preset as ArticlePreset) || "standard-feature",
    status: (row.status as ArticleStatus) || "published",
    featuredRank:
      typeof row.featured_rank === "number" ? row.featured_rank : undefined,
    kicker: row.kicker || undefined,
    updatedAt: row.updated_at || undefined,
    source: "custom",
  };
}

function articleToRow(art: Article) {
  return {
    slug: art.slug,
    title: art.title,
    category: art.category,
    author: art.author,
    date: art.date,
    image: art.image,
    excerpt: art.excerpt,
    read_mins: art.readMins,
    tags: art.tags,
    body: art.body,
    preset: art.preset ?? "standard-feature",
    status: art.status ?? "published",
    featured_rank:
      typeof art.featuredRank === "number" ? art.featuredRank : null,
    kicker: art.kicker ?? null,
    updated_at: art.updatedAt ?? new Date().toISOString(),
  };
}

async function fetchSupabaseArticles(): Promise<{
  articles: Article[];
  tableReady: boolean;
  note?: string;
}> {
  const client = getSupabaseReader();
  if (!client) {
    return { articles: [], tableReady: false, note: "Supabase keys not configured" };
  }
  try {
    const { data, error } = await client
      .from("newspaper_articles")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      return {
        articles: [],
        tableReady: false,
        note: error.message,
      };
    }
    return {
      articles: ((data as SupabaseArticleRow[]) ?? []).map(rowToArticle),
      tableReady: true,
    };
  } catch (e: unknown) {
    return {
      articles: [],
      tableReady: false,
      note: e instanceof Error ? e.message : "Supabase query error",
    };
  }
}

export function sortArticlesNewestFirst(list: Article[]): Article[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ua = a.updatedAt ?? "";
    const ub = b.updatedAt ?? "";
    if (ua !== ub) return ua < ub ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

interface CachedHealthPayload {
  articles: Article[];
  health: StorageHealth;
}

let articlesCache: CachedHealthPayload | null = null;

export function invalidateArticlesServerCache(): void {
  articlesCache = null;
}

/**
 * Returns ALL articles (built-in + custom, including drafts & archived) for /admin,
 * plus detailed hybrid storage health.
 */
export async function getAdminArticlesWithHealth(forceFresh = false): Promise<{
  articles: Article[];
  health: StorageHealth;
}> {
  if (!forceFresh && articlesCache) {
    return articlesCache;
  }

  const [local, supa] = await Promise.all([
    readLocalStore(),
    fetchSupabaseArticles(),
  ]);

  // Merge custom articles by slug, preferring the most recent updatedAt timestamp
  const customBySlug = new Map<string, Article>();
  for (const a of local.customArticles) {
    customBySlug.set(a.slug, { ...a, source: "custom" });
  }
  for (const a of supa.articles) {
    const existing = customBySlug.get(a.slug);
    if (!existing || (a.updatedAt ?? "") >= (existing.updatedAt ?? "")) {
      customBySlug.set(a.slug, { ...a, source: "custom" });
    }
  }

  const archivedSet = new Set(local.archivedBuiltinSlugs);
  const merged = new Map<string, Article>();

  for (const b of BUILTIN_ARTICLES) {
    merged.set(b.slug, {
      ...b,
      status: archivedSet.has(b.slug) ? "archived" : "published",
      source: "builtin",
    });
  }

  for (const [slug, custom] of customBySlug.entries()) {
    merged.set(slug, custom);
  }

  let localWritable = true;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    localWritable = false;
  }

  const result = {
    articles: sortArticlesNewestFirst([...merged.values()]),
    health: {
      localWritable,
      localArticleCount: local.customArticles.length,
      supabaseConfigured: Boolean(getSupabaseAdmin()),
      supabaseTableReady: supa.tableReady,
      supabaseArticleCount: supa.articles.length,
      supabaseNote: supa.note,
    },
  };

  articlesCache = result;
  return result;
}

/** Returns ONLY published articles for public readers across the site (instant edge cached) */
export async function getPublishedArticlesServer(): Promise<Article[]> {
  const { articles } = await getAdminArticlesWithHealth();
  return articles.filter((a) => (a.status ?? "published") === "published");
}

/**
 * Single-request deduplicated article resolver via React.cache
 * Resolves in 0ms without redundant Supabase queries.
 */
export const getArticleBySlugServer = cache(async function getArticleBySlugServer(
  slug: string
): Promise<Article | undefined> {
  const published = await getPublishedArticlesServer();
  const found = published.find((a) => a.slug === slug);
  if (found) return found;

  // Cache-miss fallback: force fresh lookup in case article was just published
  const fresh = await getAdminArticlesWithHealth(true);
  return fresh.articles.find(
    (a) => a.slug === slug && (a.status ?? "published") === "published"
  );
});

/** Upsert a custom article (or customized override of a built-in article) to BOTH local JSON and Supabase */
export async function saveArticleHybrid(input: Article): Promise<{
  article: Article;
  savedLocal: boolean;
  savedSupabase: boolean;
  supabaseError?: string;
}> {
  const nowIso = new Date().toISOString();
  const normalized: Article = {
    ...input,
    status: input.status ?? "published",
    preset: input.preset ?? "standard-feature",
    updatedAt: nowIso,
    source: "custom",
  };

  // 1. Save to local JSON store
  const local = await readLocalStore();
  const filtered = local.customArticles.filter((a) => a.slug !== normalized.slug);
  // If user specifies a featuredRank (1..5), clear that exact rank from other custom posts so ranks don't collide
  const deduplicatedRanks =
    typeof normalized.featuredRank === "number"
      ? filtered.map((a) =>
          a.featuredRank === normalized.featuredRank
            ? { ...a, featuredRank: undefined }
            : a
        )
      : filtered;

  local.customArticles = [normalized, ...deduplicatedRanks];
  if (normalized.status === "published") {
    local.archivedBuiltinSlugs = local.archivedBuiltinSlugs.filter(
      (s) => s !== normalized.slug
    );
  }
  const savedLocal = await writeLocalStore(local);

  // 2. Sync to Supabase if configured & table exists
  let savedSupabase = false;
  let supabaseError: string | undefined;
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      if (typeof normalized.featuredRank === "number") {
        await admin
          .from("newspaper_articles")
          .update({ featured_rank: null })
          .eq("featured_rank", normalized.featuredRank)
          .neq("slug", normalized.slug);
      }
      const { error } = await admin
        .from("newspaper_articles")
        .upsert(articleToRow(normalized), { onConflict: "slug" });
      if (error) {
        supabaseError = error.message;
      } else {
        savedSupabase = true;
      }
    } catch (e: unknown) {
      supabaseError = e instanceof Error ? e.message : "Supabase upsert error";
    }
  }

  invalidateArticlesServerCache();
  return {
    article: normalized,
    savedLocal,
    savedSupabase,
    supabaseError,
  };
}

/** Delete a custom article OR archive/restore a built-in article */
export async function removeOrArchiveArticleHybrid(
  slug: string,
  action: "delete" | "archive" | "restore" = "delete"
): Promise<{ ok: boolean }> {
  const isBuiltin = BUILTIN_ARTICLES.some((b) => b.slug === slug);
  const local = await readLocalStore();
  const admin = getSupabaseAdmin();

  if (action === "restore") {
    local.archivedBuiltinSlugs = local.archivedBuiltinSlugs.filter((s) => s !== slug);
    local.customArticles = local.customArticles.map((a) =>
      a.slug === slug ? { ...a, status: "published", updatedAt: new Date().toISOString() } : a
    );
    await writeLocalStore(local);
    if (admin) {
      try {
        await admin
          .from("newspaper_articles")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .eq("slug", slug);
      } catch {
        // Ignore if table not yet initialized
      }
    }
    return { ok: true };
  }

  if (action === "archive" || (action === "delete" && isBuiltin)) {
    const hasCustom = local.customArticles.some((a) => a.slug === slug);
    if (hasCustom && action === "delete" && isBuiltin) {
      // Remove custom override & archive built-in if requested, or if only archiving keep override archived
      local.customArticles = local.customArticles.filter((a) => a.slug !== slug);
    } else if (hasCustom) {
      local.customArticles = local.customArticles.map((a) =>
        a.slug === slug ? { ...a, status: "archived", updatedAt: new Date().toISOString() } : a
      );
    }
    if (isBuiltin && !local.archivedBuiltinSlugs.includes(slug)) {
      local.archivedBuiltinSlugs.push(slug);
    }
    await writeLocalStore(local);

    if (admin) {
      try {
        const builtinBase = BUILTIN_ARTICLES.find((b) => b.slug === slug);
        if (builtinBase) {
          await admin.from("newspaper_articles").upsert(
            articleToRow({
              ...builtinBase,
              status: "archived",
              updatedAt: new Date().toISOString(),
            }),
            { onConflict: "slug" }
          );
        } else {
          await admin
            .from("newspaper_articles")
            .update({ status: "archived", updated_at: new Date().toISOString() })
            .eq("slug", slug);
        }
      } catch {
        // Ignore if table not yet initialized
      }
    }
    return { ok: true };
  }

  // Hard delete custom article
  local.customArticles = local.customArticles.filter((a) => a.slug !== slug);
  await writeLocalStore(local);

  if (admin) {
    try {
      await admin.from("newspaper_articles").delete().eq("slug", slug);
    } catch {
      // Ignore if table not yet initialized
    }
  }
  invalidateArticlesServerCache();
  return { ok: true };
}
