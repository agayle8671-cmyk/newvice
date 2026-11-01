"use client";

import { useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/newspaper/types";
import {
  articleHref,
  categoryHref,
  categoryName,
  formatDate,
} from "@/lib/newspaper/content";
import { getAuthor } from "@/lib/newspaper/categories";

export function CategoryPipe({ slug, size = 14 }: { slug: string; size?: number }) {
  return (
    <Link
      href={categoryHref(slug)}
      className="np-pipe"
      style={{ fontSize: size }}
    >
      {categoryName(slug)}
    </Link>
  );
}

export function TopFiveWidget({
  articles,
  title = "TOP 5 THIS WEEK",
}: {
  articles: Article[];
  title?: string;
}) {
  return (
    <div>
      <div className="np-redbar mb-6">{title}</div>
      <div>
        {articles.slice(0, 5).map((art, idx) => (
          <div
            key={art.slug}
            className="relative flex items-start gap-3.5 pb-5 mb-5 border-b border-black last:border-b-0 last:mb-0 last:pb-0"
          >
            <Link
              href={articleHref(art)}
              className="np-imgwrap w-[86px] h-[86px] shrink-0 border border-black/15"
            >
              <img src={art.image} alt={art.title} loading="lazy" />
            </Link>
            <div className="min-w-0 flex-1 pr-5">
              <h3 className="np-head text-[19px] leading-[1.14] font-bold">
                <Link href={articleHref(art)} className="np-link">
                  {art.title}
                </Link>
              </h3>
              <div className="mt-2">
                <CategoryPipe slug={art.category} size={13} />
              </div>
            </div>
            <span className="np-num">{idx + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CutoutCard({
  article,
  aspect = "aspect-[4/3]",
  titleSize = "text-[26px]",
  lined = false,
  align = "center",
  showExcerpt = false,
  showDate = false,
}: {
  article: Article;
  aspect?: string;
  titleSize?: string;
  lined?: boolean;
  align?: "center" | "left";
  showExcerpt?: boolean;
  showDate?: boolean;
}) {
  const author = getAuthor(article.author);
  return (
    <article className="flex flex-col">
      <Link href={articleHref(article)} className={`np-imgwrap w-full ${aspect}`}>
        <img src={article.image} alt={article.title} loading="lazy" />
      </Link>
      <div
        className={`np-cutout-box ${align === "left" ? "left" : ""} ${
          lined ? "np-cutout-lined" : ""
        }`}
      >
        <h3 className={`np-head font-bold ${titleSize} leading-[1.38]`}>
          <Link href={articleHref(article)} className="np-cutout hover:text-[#e04040] transition-colors">
            {article.title}
          </Link>
        </h3>
      </div>
      <div
        className={`mt-3 flex items-center gap-2.5 flex-wrap ${
          align === "center" ? "justify-center text-center" : "justify-start"
        }`}
      >
        <CategoryPipe slug={article.category} size={14} />
        <Link
          href={`/author/${author.slug}`}
          className="np-meta hover:text-[#e04040] transition-colors"
        >
          {author.name}
        </Link>
        {showDate && (
          <span className="np-meta text-black/75">- {formatDate(article.date)}</span>
        )}
      </div>
      {showExcerpt && (
        <p
          className={`mt-3 text-[14.5px] leading-[1.6] text-[#111] np-slab ${
            align === "center" ? "text-center px-2" : ""
          }`}
        >
          {article.excerpt}
        </p>
      )}
    </article>
  );
}

export function HorizontalStoryCard({
  article,
  imageWidth = "w-[44%] sm:w-[240px]",
  imageAspect = "aspect-[4/3]",
  titleSize = "text-[25px] sm:text-[28px]",
}: {
  article: Article;
  imageWidth?: string;
  imageAspect?: string;
  titleSize?: string;
}) {
  return (
    <article className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
      <Link
        href={articleHref(article)}
        className={`np-imgwrap w-full ${imageWidth} ${imageAspect} shrink-0`}
      >
        <img src={article.image} alt={article.title} loading="lazy" />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className={`np-head font-bold ${titleSize} leading-[1.14]`}>
          <Link href={articleHref(article)} className="np-link">
            {article.title}
          </Link>
        </h3>
        <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
          <CategoryPipe slug={article.category} size={14} />
          <span className="np-meta">{formatDate(article.date)}</span>
        </div>
      </div>
    </article>
  );
}

export function CompactRightThumbRow({ article }: { article: Article }) {
  return (
    <article className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-black last:border-b-0 last:mb-0 last:pb-0">
      <h4 className="np-head font-bold text-[20px] leading-[1.16] flex-1 min-w-0">
        <Link href={articleHref(article)} className="np-link">
          {article.title}
        </Link>
      </h4>
      <Link
        href={articleHref(article)}
        className="np-imgwrap w-[108px] h-[68px] shrink-0"
      >
        <img src={article.image} alt={article.title} loading="lazy" />
      </Link>
    </article>
  );
}

export function NewsletterBox({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(true);
  const [status, setStatus] = useState<"idle" | "err" | "ok">("idle");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@") || !accepted) {
      setStatus("err");
      return;
    }
    try {
      const list = JSON.parse(localStorage.getItem("lv_newsletter_subs") || "[]");
      if (!list.includes(email.trim())) {
        list.push(email.trim());
        localStorage.setItem("lv_newsletter_subs", JSON.stringify(list));
      }
    } catch {
      // ignore storage errors
    }
    setStatus("ok");
    setEmail("");
  };

  return (
    <form onSubmit={onSubmit} className="w-full">
      {status === "ok" ? (
        <div className="border border-black border-b-[3px] bg-[#f8f8f8] p-3.5 text-xs np-ui font-semibold text-black">
          ✓ Subscribed to the Leonida Vice Dispatch! You’re on the list for GTA VI launch alerts.
        </div>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "err") setStatus("idle");
            }}
            placeholder="Email address"
            className="np-input"
          />
          <button
            type="submit"
            className="mt-2.5 w-full bg-[#e04040] hover:bg-black text-white py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] transition-colors cursor-pointer np-ui flex items-center justify-center gap-2"
          >
            <span>I WANT IN</span>
            <span>→</span>
          </button>
          <label className="mt-2.5 flex items-start gap-2 text-xs text-black/85 cursor-pointer select-none np-slab">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 accent-[#e04040]"
            />
            <span>
              I&apos;ve read and accept the{" "}
              <Link href="/privacy-policy" className="text-[#e04040] hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {status === "err" && (
            <p className="mt-1.5 text-[11px] text-[#e04040] font-semibold np-ui">
              Enter a valid email and accept the Privacy Policy.
            </p>
          )}
        </>
      )}
      {!compact && <div className="hidden" />}
    </form>
  );
}
