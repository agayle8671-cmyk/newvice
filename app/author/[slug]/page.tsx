import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AUTHORS } from "@/lib/newspaper/categories";
import { AuthorArchiveView } from "@/components/newspaper/StaticPagesView";

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

async function AuthorContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const author = AUTHORS.find((a) => a.slug === slug);
  if (!author) notFound();
  return <AuthorArchiveView author={author} />;
}

export default function AuthorRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AuthorContent params={params} />
    </Suspense>
  );
}
