"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SearchPageView } from "@/components/newspaper/StaticPagesView";

function SearchInner() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  return <SearchPageView key={q} initialQuery={q} />;
}

export default function SearchRoute() {
  return (
    <Suspense fallback={<SearchPageView initialQuery="" />}>
      <SearchInner />
    </Suspense>
  );
}
