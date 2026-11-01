import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle } from "@/lib/newspaper/content";
import { getArticleBySlugServer } from "@/lib/newspaper/store.server";
import ArticlePageView from "@/components/newspaper/ArticlePageView";

// Allow dynamic rendering for newly admin-published article slugs under Next.js 16 cacheComponents
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const art = (await getArticleBySlugServer(slug)) ?? getArticle(slug);
  if (!art) return { title: "Article Not Found — Leonida Vice" };
  return {
    title: `${art.title} — Leonida Vice`,
    description: art.excerpt,
  };
}

async function ArticleContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const article = await getArticleBySlugServer(slug);
  if (!article) notFound();
  return <ArticlePageView article={article} />;
}

export default function ArticleRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ArticleContent params={params} />
    </Suspense>
  );
}
