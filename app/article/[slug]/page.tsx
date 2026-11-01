import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle } from "@/lib/newspaper/content";
import { getArticleBySlugServer } from "@/lib/newspaper/store.server";
import ArticlePageView from "@/components/newspaper/ArticlePageView";

// Allow clean blocking page transition under Next.js 16 cacheComponents
// (Keeps current page visible — zero white flash, zero blank screen)
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const art = (await getArticleBySlugServer(slug)) ?? getArticle(slug);
  if (!art) return { title: "Article Not Found — Leonida Vice" };
  return {
    title: `${art.title} — Leonida Vice`,
    description: art.excerpt,
  };
}

export default async function ArticleRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = (await getArticleBySlugServer(slug)) ?? getArticle(slug);
  if (!article) notFound();
  return <ArticlePageView article={article} />;
}
