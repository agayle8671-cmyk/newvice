import type { Metadata } from "next";
import { allTags, slugify } from "@/lib/newspaper/content";
import { TagArchiveView } from "@/components/newspaper/StaticPagesView";

export const instant = false;

export function generateStaticParams() {
  return allTags().map((tag) => ({ slug: slugify(tag) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tags = allTags();
  const label =
    tags.find((t) => slugify(t) === slug) ?? slug.replace(/-/g, " ");
  return {
    title: `#${label} — Leonida Vice`,
    description: `All Grand Theft Auto VI articles tagged with ${label} on Leonida Vice.`,
  };
}

export default async function TagRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tags = allTags();
  const label =
    tags.find((t) => slugify(t) === slug) ?? slug.replace(/-/g, " ");
  return <TagArchiveView tagSlug={slug} tagLabel={label} />;
}
