import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AUTHORS } from "@/lib/newspaper/categories";
import { AuthorArchiveView } from "@/components/newspaper/StaticPagesView";

export const instant = false;

export function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = AUTHORS.find((a) => a.slug === slug);
  if (!author) return { title: "Author Not Found — Leonida Vice" };
  return {
    title: `${author.name} — Leonida Vice`,
    description: author.bio,
  };
}

export default async function AuthorRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const author = AUTHORS.find((a) => a.slug === slug);
  if (!author) notFound();
  return <AuthorArchiveView author={author} />;
}
