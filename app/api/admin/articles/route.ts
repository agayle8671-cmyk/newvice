import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";
import {
  getAdminArticlesWithHealth,
  removeOrArchiveArticleHybrid,
  saveArticleHybrid,
} from "@/lib/newspaper/store.server";
import { CATEGORIES, AUTHORS } from "@/lib/newspaper/categories";
import {
  computeReadMins,
  deriveExcerpt,
  slugifyTitle,
} from "@/lib/newspaper/auto-layout";
import type {
  Article,
  ArticlePreset,
  ArticleStatus,
  Block,
  CategorySlug,
} from "@/lib/newspaper/types";

const VALID_CATEGORIES = new Set(CATEGORIES.map((c) => c.slug));
const VALID_AUTHORS = new Set(AUTHORS.map((a) => a.slug));
const VALID_PRESETS = new Set<ArticlePreset>([
  "standard-feature",
  "police-blotter",
  "utility-guide",
  "breaking-brief",
]);
const VALID_STATUSES = new Set<ArticleStatus>(["published", "draft", "archived"]);

function sanitizeBlocks(rawBlocks: unknown): Block[] {
  if (!Array.isArray(rawBlocks)) return [];
  const clean: Block[] = [];
  for (const item of rawBlocks) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    if (b.type === "h2" && typeof b.text === "string" && b.text.trim()) {
      clean.push({ type: "h2", text: b.text.trim() });
    } else if (b.type === "p" && typeof b.text === "string" && b.text.trim()) {
      clean.push({ type: "p", text: b.text.trim() });
    } else if (b.type === "img" && typeof b.src === "string" && b.src.trim()) {
      clean.push({
        type: "img",
        src: b.src.trim(),
        caption:
          typeof b.caption === "string" && b.caption.trim()
            ? b.caption.trim()
            : undefined,
      });
    } else if (b.type === "quote" && typeof b.text === "string" && b.text.trim()) {
      clean.push({
        type: "quote",
        text: b.text.trim(),
        cite:
          typeof b.cite === "string" && b.cite.trim() ? b.cite.trim() : undefined,
      });
    } else if (b.type === "list" && Array.isArray(b.items)) {
      const items = b.items
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      if (items.length > 0) clean.push({ type: "list", items });
    } else if (
      b.type === "table" &&
      Array.isArray(b.head) &&
      Array.isArray(b.rows)
    ) {
      const head = b.head.map((h) => String(h ?? "").trim()).filter(Boolean);
      const rows = b.rows
        .filter(Array.isArray)
        .map((r: unknown[]) => r.map((c) => String(c ?? "").trim()));
      if (head.length > 0 && rows.length > 0) {
        clean.push({ type: "table", head, rows });
      }
    }
  }
  return clean;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { articles, health } = await getAdminArticlesWithHealth();
  return NextResponse.json(
    { ok: true, articles, health },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request payload." }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Article headline must be at least 4 characters." },
      { status: 400 }
    );
  }

  const rawSlug =
    typeof payload.slug === "string" && payload.slug.trim()
      ? slugifyTitle(payload.slug)
      : slugifyTitle(title);

  if (!rawSlug) {
    return NextResponse.json(
      { ok: false, error: "Could not generate a valid URL slug." },
      { status: 400 }
    );
  }

  const category: CategorySlug = VALID_CATEGORIES.has(payload.category)
    ? payload.category
    : "leonida";
  const author = VALID_AUTHORS.has(payload.author)
    ? payload.author
    : "marco-reyes";
  const date =
    typeof payload.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : new Date().toISOString().slice(0, 10);
  const image =
    typeof payload.image === "string" && payload.image.trim()
      ? payload.image.trim()
      : "/images/gta/official_cover_art_landscape.jpg";

  const body = sanitizeBlocks(payload.body);
  if (body.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Article body cannot be empty." },
      { status: 400 }
    );
  }

  const excerpt =
    typeof payload.excerpt === "string" && payload.excerpt.trim()
      ? payload.excerpt.trim()
      : deriveExcerpt(body, title);

  const readMins =
    typeof payload.readMins === "number" && payload.readMins >= 1
      ? Math.round(payload.readMins)
      : computeReadMins(body, excerpt);

  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const preset: ArticlePreset = VALID_PRESETS.has(payload.preset)
    ? payload.preset
    : "standard-feature";
  const status: ArticleStatus = VALID_STATUSES.has(payload.status)
    ? payload.status
    : "published";

  const rankNum = Number(payload.featuredRank);
  const featuredRank =
    Number.isInteger(rankNum) && rankNum >= 1 && rankNum <= 5
      ? rankNum
      : undefined;

  const kicker =
    typeof payload.kicker === "string" && payload.kicker.trim()
      ? payload.kicker.trim().slice(0, 60)
      : undefined;

  const article: Article = {
    slug: rawSlug,
    title,
    category,
    author,
    date,
    image,
    excerpt,
    readMins,
    tags: tags.length > 0 ? tags : ["Leonida", "GTA VI"],
    body,
    preset,
    status,
    featuredRank,
    kicker,
  };

  const result = await saveArticleHybrid(article);
  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get("slug") ?? "").trim();
  const actionParam = searchParams.get("action");
  const action: "delete" | "archive" | "restore" =
    actionParam === "archive" || actionParam === "restore"
      ? actionParam
      : "delete";

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing article slug." }, { status: 400 });
  }

  await removeOrArchiveArticleHybrid(slug, action);
  return NextResponse.json({ ok: true });
}
