"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Category } from "@/lib/newspaper/types";
import {
  NAV_CATEGORIES,
  getCategory,
  getChildren,
} from "@/lib/newspaper/categories";
import {
  byCategory,
  categoryHref,
  categoryName,
  getAllArticles,
  popular,
} from "@/lib/newspaper/content";
import { useArticlesVersion } from "@/lib/newspaper/useArticles";
import NewspaperShell from "./NewspaperShell";
import HouseAdBanner from "./HouseAdBanner";
import {
  CutoutCard,
  HorizontalStoryCard,
  TopFiveWidget,
} from "./ArticleWidgets";

export default function CategoryPageView({ category }: { category: Category }) {
  const [visibleCount, setVisibleCount] = useState(8);
  const articlesVersion = useArticlesVersion();

  const catArticles = useMemo(() => {
    void articlesVersion;
    return byCategory(category.slug);
  }, [category.slug, articlesVersion]);
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);

  // Build sub-navigation pills matching cat_0.png & catent_0.png
  const subPills = useMemo(() => {
    const directChildren = getChildren(category.slug);
    if (directChildren.length > 0) {
      return directChildren;
    }
    if (category.parent) {
      const parentCat = getCategory(category.parent);
      const siblings = getChildren(category.parent);
      return parentCat ? [parentCat, ...siblings] : siblings;
    }
    // Top-level without children: show sibling top-level categories (exact demo behavior on SCANDALS)
    return NAV_CATEGORIES.filter((s) => s !== category.slug)
      .slice(0, 5)
      .map((s) => getCategory(s)!)
      .filter(Boolean);
  }, [category]);

  const heroFour = catArticles.slice(0, 4);
  // Lower feed starts after the 4 hero cards, supplemented by other recent stories so LOAD MORE works smoothly like the demo
  const lowerPool = useMemo(() => {
    void articlesVersion;
    const all = getAllArticles();
    const restInCat = catArticles.slice(4);
    const otherStories = all.filter(
      (a) => !catArticles.some((c) => c.slug === a.slug)
    );
    return [...restInCat, ...otherStories];
  }, [catArticles, articlesVersion]);

  return (
    <NewspaperShell activeCategory={category.slug}>
      {/* ══════════════════════════════════════════════════════════════════
          GREY CATEGORY HEADER BAND (exact match to cat_0.png & catent_0.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap">
          <h1
            className="np-head font-extrabold uppercase text-black leading-none"
            style={{ fontSize: "clamp(42px, 5vw, 62px)" }}
          >
            {category.name}
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-[15px] text-black/75 np-slab">
            {category.description}
          </p>

          {/* Subcategory / Sibling Links Row */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5">
            {subPills.map((pill) => {
              const active = pill.slug === category.slug;
              return (
                <Link
                  key={pill.slug}
                  href={categoryHref(pill.slug)}
                  className={`uppercase font-bold text-[19px] transition-colors ${
                    active
                      ? "text-[#e04040]"
                      : "text-black hover:text-[#e04040]"
                  }`}
                  style={{ fontFamily: "var(--f-head)" }}
                >
                  {categoryName(pill.slug)}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TOP 4 FEATURED CUTOUT CARDS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap pt-10 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
          {heroFour.map((art, idx) => (
            <div
              key={art.slug}
              className={idx < heroFour.length - 1 ? "lg:pr-7 np-vr" : ""}
            >
              <CutoutCard
                article={art}
                aspect="aspect-[4/3]"
                titleSize="text-[24px]"
                align="center"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 980×90 Ad Slot */}
      <div className="np-wrap my-4">
        <HouseAdBanner variant="leaderboard" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LOWER 2-COLUMN ARCHIVE GRID + TOP 5 SIDEBAR (matches cat_1250.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap pt-6 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left 8: 2-Column Horizontal Story Cards */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
              {lowerPool.slice(0, visibleCount).map((art) => (
                <div key={art.slug} className="pb-7 border-b border-black">
                  <HorizontalStoryCard
                    article={art}
                    imageWidth="w-full sm:w-[175px]"
                    imageAspect="aspect-[4/3]"
                    titleSize="text-[22px]"
                  />
                </div>
              ))}
            </div>

            {visibleCount < lowerPool.length && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + 6)}
                  className="border border-black border-b-[3px] px-7 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                >
                  LOAD MORE ›
                </button>
              </div>
            )}
          </div>

          {/* Right 4: TOP 5 THIS WEEK Sidebar */}
          <aside className="lg:col-span-4">
            <TopFiveWidget articles={top5} title="TOP 5 THIS WEEK" />
          </aside>
        </div>
      </section>
    </NewspaperShell>
  );
}
