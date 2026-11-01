import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { slugify } from "@/lib/newspaper/content";
import { getPublishedArticlesServer } from "@/lib/newspaper/store.server";
import { TagArchiveView } from "@/components/newspaper/StaticPagesView";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const published = await getPublishedArticlesServer();
  const tags = Array.from(new Set(published.flatMap((a) => a.tags)));
  const label =
    tags.find((t) => slugify(t) === slug) ?? slug.replace(/-/g, " ");
  return {
    title: `#${label} — Leonida Vice`,
    description: `All Grand Theft Auto VI articles tagged with ${label} on Leonida Vice.`,
  };
}

async function TagContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const published = await getPublishedArticlesServer();
  const matches = published.filter((a) =>
    a.tags.some((t) => slugify(t) === slug)
  );
  if (matches.length === 0) notFound();
  const tags = Array.from(new Set(published.flatMap((a) => a.tags)));
  const label =
    tags.find((t) => slugify(t) === slug) ?? slug.replace(/-/g, " ");
  return <TagArchiveView tagSlug={slug} tagLabel={label} />;
}

export default function TagRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <TagContent params={params} />
    </Suspense>
  );
}
