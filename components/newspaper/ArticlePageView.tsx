"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/newspaper/types";
import { getAuthor } from "@/lib/newspaper/categories";
import {
  articleHref,
  categoryHref,
  categoryName,
  formatDate,
  popular,
  prevNext,
  related,
  slugify,
  topLevel,
} from "@/lib/newspaper/content";
import { useArticlesVersion } from "@/lib/newspaper/useArticles";
import {
  formatShortTimecode,
  generateXRayCuesForVideo,
} from "@/lib/video/xray-telemetry";
import NewspaperShell from "./NewspaperShell";
import HouseAdBanner from "./HouseAdBanner";
import { CategoryPipe, TopFiveWidget } from "./ArticleWidgets";

interface StoredComment {
  id: string;
  name: string;
  website?: string;
  date: string;
  text: string;
}

const SEED_COMMENTS: StoredComment[] = [
  {
    id: "seed-1",
    name: "ViceBeachCruiser",
    date: "October 31, 2026",
    text: "The level of environmental detail Rockstar squeezed out of base PS5 hardware is still wild to me. Counting down every day to November 19.",
  },
  {
    id: "seed-2",
    name: "KeyLentoSmuggler",
    date: "November 1, 2026",
    text: "Great breakdown — appreciate that you separate confirmed Rockstar info from the 2022 debug leaks and fan theories.",
  },
];

export default function ArticlePageView({ article }: { article: Article }) {
  const articlesVersion = useArticlesVersion();
  const author = getAuthor(article.author);
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);
  const relatedSix = useMemo(() => {
    void articlesVersion;
    return related(article, 6);
  }, [article, articlesVersion]);
  const { prev, next } = useMemo(() => {
    void articlesVersion;
    return prevNext(article);
  }, [article, articlesVersion]);

  // Derive linked X-Ray video telemetry & 4-Block GEO metadata for this article
  const linkedCues = useMemo(
    () =>
      generateXRayCuesForVideo({
        id: article.slug,
        source: "archive",
        title: `${article.title} ${article.tags.join(" ")}`,
        creatorName: author.name,
        creatorUrl: "",
        platform: "Leonida Vice",
        sourceUrl: `/${article.slug}`,
        category: article.category === "leaks-rumors" ? "leak" : "analysis",
        fetchedAt: article.date,
        playCount: 1,
      }),
    [article, author.name]
  );
  const primaryCue = linkedCues[0];

  const geoJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "NewsArticle",
          headline: article.title,
          description: article.excerpt,
          image: [article.image],
          datePublished: article.date,
          author: [
            {
              "@type": "Person",
              name: author.name,
            },
          ],
          publisher: {
            "@type": "Organization",
            name: "Leonida Vice",
          },
        },
        {
          "@type": "VideoObject",
          name: `${article.title} — Synchronized Broadcast Telemetry`,
          description: primaryCue.forensicNote,
          thumbnailUrl: [article.image],
          uploadDate: `${article.date}T00:00:00Z`,
          duration: "PT1M15S",
        },
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `Where in Leonida does "${article.title}" take place?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${primaryCue.location.regionName} (${primaryCue.location.subdistrict} — ${primaryCue.location.landmark}, ${primaryCue.location.latLngLabel}).`,
              },
            },
            {
              "@type": "Question",
              name: "What vehicles and tactical mechanics are verified in this scene?",
              acceptedAnswer: {
                "@type": "Answer",
                text: `Vehicle: ${primaryCue.vehicle.name} (${primaryCue.vehicle.trunkLockerSlots} trunk gun-locker slots). Tactical Gear: ${primaryCue.weaponOrGear.name} — ${primaryCue.weaponOrGear.tacticalEffect}.`,
              },
            },
          ],
        },
      ],
    }),
    [article, author.name, primaryCue]
  );

  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<StoredComment[]>(SEED_COMMENTS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [saveInfo, setSaveInfo] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [commentErr, setCommentErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem("lv_commenter_info");
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed.name) setName(parsed.name);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.website) setWebsite(parsed.website);
      }
      const raw = localStorage.getItem(`lv_comments_${article.slug}`);
      if (raw) {
        const userList: StoredComment[] = JSON.parse(raw);
        setComments([...SEED_COMMENTS, ...userList]);
      } else {
        setComments(SEED_COMMENTS);
      }
    } catch {
      setComments(SEED_COMMENTS);
    }
  }, [article.slug]);

  const handleShare = (platform: string) => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (platform === "copy" || !url) {
      navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      return;
    }
    const text = encodeURIComponent(article.title);
    const encUrl = encodeURIComponent(url);
    const shareUrls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encUrl}`,
      fb: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
      pin: `https://pinterest.com/pin/create/button/?url=${encUrl}&description=${text}`,
      wa: `https://api.whatsapp.com/send?text=${text}%20${encUrl}`,
    };
    if (shareUrls[platform]) {
      window.open(shareUrls[platform], "_blank", "noopener,noreferrer");
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !commentText.trim()) {
      setCommentErr("Please fill in Name, Email, and Comment.");
      return;
    }
    const newItem: StoredComment = {
      id: `c_${Date.now()}`,
      name: name.trim(),
      website: website.trim() || undefined,
      date: formatDate("2026-11-01"),
      text: commentText.trim(),
    };
    try {
      if (saveInfo) {
        localStorage.setItem(
          "lv_commenter_info",
          JSON.stringify({ name: name.trim(), email: email.trim(), website: website.trim() })
        );
      }
      const existingRaw = localStorage.getItem(`lv_comments_${article.slug}`);
      const existing: StoredComment[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [...existing, newItem];
      localStorage.setItem(`lv_comments_${article.slug}`, JSON.stringify(updated));
    } catch {
      // ignore storage quota errors
    }
    setComments((prevList) => [...prevList, newItem]);
    setCommentText("");
    setCommentErr(null);
  };

  return (
    <NewspaperShell activeCategory={topLevel(article.category)}>
      {/* Top 980×90 Ad Band directly under Sticky Nav (matches post_0.png) */}
      <HouseAdBanner variant="leaderboard-band" />

      {/* ══════════════════════════════════════════════════════════════════
          MAIN 2-COLUMN POST LAYOUT (Left Sidebar 3 | Main Article 9)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="np-wrap pt-10 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* LEFT SIDEBAR: TOP 5 + SQUARE AD + RELATED POSTS */}
          <aside className="lg:col-span-3 space-y-10 order-2 lg:order-1">
            <TopFiveWidget articles={top5} title="TOP 5 THIS WEEK" />

            <HouseAdBanner variant="square" />

            {/* RELATED POSTS (matches post_1250.png) */}
            <div>
              <h3
                className="uppercase italic font-extrabold text-[30px] leading-none text-[#e04040] pb-3 mb-5 border-b border-black"
                style={{ fontFamily: "var(--f-head)" }}
              >
                RELATED POSTS
              </h3>
              <div className="space-y-4">
                {relatedSix.map((rel) => (
                  <article key={rel.slug}>
                    <h4 className="np-head font-bold text-[20px] leading-[1.15]">
                      <Link href={articleHref(rel)} className="np-link">
                        {rel.title}
                      </Link>
                    </h4>
                    <div className="mt-1">
                      <Link
                        href={categoryHref(rel.category)}
                        className="text-[11px] font-bold uppercase tracking-wider text-[#e04040] hover:text-black np-ui"
                      >
                        {categoryName(rel.category)}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </aside>

          {/* RIGHT MAIN ARTICLE CONTENT (span-9) */}
          <article className="lg:col-span-9 order-1 lg:order-2">
            {/* Optional Editorial Kicker Eyebrow */}
            {article.kicker && (
              <div className="mb-3">
                <span className="inline-block bg-[#e04040] text-white px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest np-ui">
                  {article.kicker}
                </span>
              </div>
            )}

            {/* Title */}
            <h1
              className="np-head font-extrabold text-black leading-[1.06]"
              style={{ fontSize: "clamp(38px, 4.4vw, 60px)" }}
            >
              {article.title}
            </h1>

            {/* Red Category Pipe */}
            <div className="mt-4">
              <CategoryPipe slug={article.category} size={17} />
            </div>

            {/* Author Meta + Black Square Share Buttons */}
            <div className="mt-5 pb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap text-[13px] np-ui">
                <Link
                  href={`/author/${author.slug}`}
                  className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs shrink-0"
                >
                  {author.initials}
                </Link>
                <span>
                  <span className="uppercase text-black/70 mr-1">AUTHOR:</span>
                  <Link
                    href={`/author/${author.slug}`}
                    className="font-bold hover:text-[#e04040] transition-colors"
                  >
                    {author.name}
                  </Link>
                </span>
                <span className="text-black/40">|</span>
                <span>{formatDate(article.date)}</span>
                <span className="text-black/40">|</span>
                <span>{article.readMins} min. read</span>
              </div>

              <div className="flex items-center gap-1.5">
                {[
                  { id: "fb", label: "f", title: "Share on Facebook" },
                  { id: "x", label: "𝕏", title: "Share on X" },
                  { id: "pin", label: "P", title: "Pin article" },
                  { id: "wa", label: "WA", title: "Share via WhatsApp" },
                  { id: "copy", label: copied ? "✓" : "🔗", title: "Copy link" },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    title={btn.title}
                    onClick={() => handleShare(btn.id)}
                    className="w-9 h-9 bg-black hover:bg-[#e04040] text-white text-xs font-bold flex items-center justify-center transition-colors cursor-pointer np-ui"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero Image */}
            <div className="w-full overflow-hidden border border-black/15 mb-8">
              <img
                src={article.image}
                alt={article.title}
                className="w-full max-h-[560px] object-cover"
              />
            </div>

            {/* Lead Excerpt Callout */}
            <p className="text-[19px] leading-[1.6] font-medium text-black mb-7 pb-6 border-b border-black/20 np-slab">
              {article.excerpt}
            </p>

            {/* Layer 5: Unified @graph JSON-LD (NewsArticle + VideoObject + FAQPage) */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(geoJsonLd) }}
            />

            {/* Layer 3 & 5: Bi-Directional Video Telemetry & 4-Block GEO Dossier Box */}
            <div className="mb-8 border border-black border-b-[4px] bg-[#fafafa] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-black">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-black text-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest np-ui">
                    X-RAY TELEMETRY &amp; GEO BRIEF
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui ${
                      article.category === "leaks-rumors"
                        ? "bg-[#e04040] text-white"
                        : "bg-emerald-800 text-white"
                    }`}
                  >
                    {article.category === "leaks-rumors"
                      ? "⚠ LEAK / ANALYST ARCHIVE"
                      : "✓ CONFIRMED RAGE 9 TELEMETRY"}
                  </span>
                </div>
                <Link
                  href={`/?seek=${Math.round(primaryCue.startTime)}&region=${primaryCue.location.regionId}`}
                  className="bg-[#e04040] hover:bg-black text-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider transition-colors np-ui"
                >
                  ▶ WATCH IN LIVE BROADCAST [{formatShortTimecode(primaryCue.startTime)}]
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs np-ui">
                <div className="border border-black/25 bg-white p-3">
                  <div className="text-[10px] font-extrabold uppercase text-[#e04040]">
                    📍 LEONIDA RADAR COORDS
                  </div>
                  <div className="font-bold text-black mt-0.5">
                    {primaryCue.location.regionName} ({primaryCue.location.subdistrict})
                  </div>
                  <div className="font-mono text-[11px] text-black/65 mt-0.5">
                    {primaryCue.location.latLngLabel}
                  </div>
                </div>
                <div className="border border-black/25 bg-white p-3">
                  <div className="text-[10px] font-extrabold uppercase text-[#e04040]">
                    🚘 LINKED VEHICLE ASSET
                  </div>
                  <div className="font-bold text-black mt-0.5">
                    {primaryCue.vehicle.name}
                  </div>
                  <div className="text-[11px] text-black/65 mt-0.5">
                    Trunk Gun Locker: {primaryCue.vehicle.trunkLockerSlots}/6 Slots
                  </div>
                </div>
                <div className="border border-black/25 bg-white p-3">
                  <div className="text-[10px] font-extrabold uppercase text-[#e04040]">
                    🛠️ TACTICAL LOADOUT
                  </div>
                  <div className="font-bold text-black mt-0.5">
                    {primaryCue.weaponOrGear.name}
                  </div>
                  <div className="text-[11px] text-black/65 mt-0.5">
                    {primaryCue.character.name} ({primaryCue.character.relationshipSyncPct}% Sync)
                  </div>
                </div>
              </div>
            </div>

            {/* Structured Body Blocks */}
            <div className="np-article">
              {article.body.map((block, i) => {
                if (block.type === "h2") {
                  return <h2 key={i}>{block.text}</h2>;
                }
                if (block.type === "p") {
                  return <p key={i}>{block.text}</p>;
                }
                if (block.type === "img") {
                  return (
                    <figure key={i}>
                      <img
                        src={block.src}
                        alt={block.caption || article.title}
                        className="w-full max-h-[520px] object-cover border border-black/15"
                        loading="lazy"
                      />
                      {block.caption && <figcaption>{block.caption}</figcaption>}
                    </figure>
                  );
                }
                if (block.type === "quote") {
                  return (
                    <blockquote key={i}>
                      &ldquo;{block.text}&rdquo;
                      {block.cite && <cite>— {block.cite}</cite>}
                    </blockquote>
                  );
                }
                if (block.type === "list") {
                  return (
                    <ul key={i}>
                      {block.items.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  );
                }
                if (block.type === "table") {
                  return (
                    <div key={i} className="overflow-x-auto my-6">
                      <table>
                        <thead>
                          <tr>
                            {block.head.map((h, j) => (
                              <th key={j}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={cIdx === 0 ? "font-bold" : ""}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* TAGS Bar (matches post_3750.png) */}
            <div className="mt-10 pt-6 border-t border-black flex flex-wrap items-center gap-2">
              <span className="bg-black text-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider np-ui">
                TAGS
              </span>
              {article.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tag/${slugify(tag)}`}
                  className="border border-black px-3 py-1 text-[11px] font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors np-ui"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </article>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            LOWER POST FOOTER GRID (Prev/Next + Author Box + Comments | Popular)
            (exact match to post_5000.png & post_6250.png)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="mt-14 pt-10 border-t border-black grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-9 space-y-10">
            {/* PREVIOUS / NEXT ARTICLE Grey Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {prev && (
                <Link
                  href={articleHref(prev)}
                  className="bg-[#f2f2f2] p-6 block group text-center"
                >
                  <div className="text-[12px] font-bold uppercase tracking-widest text-[#e04040] mb-3 np-ui">
                    PREVIOUS ARTICLE
                  </div>
                  <div className="np-imgwrap aspect-[16/10] w-full mb-4">
                    <img src={prev.image} alt={prev.title} loading="lazy" />
                  </div>
                  <h4 className="np-head font-bold text-[23px] leading-[1.16] group-hover:text-[#e04040] transition-colors">
                    {prev.title}
                  </h4>
                </Link>
              )}
              {next && (
                <Link
                  href={articleHref(next)}
                  className="bg-[#f2f2f2] p-6 block group text-center"
                >
                  <div className="text-[12px] font-bold uppercase tracking-widest text-[#e04040] mb-3 np-ui">
                    NEXT ARTICLE
                  </div>
                  <div className="np-imgwrap aspect-[16/10] w-full mb-4">
                    <img src={next.image} alt={next.title} loading="lazy" />
                  </div>
                  <h4 className="np-head font-bold text-[23px] leading-[1.16] group-hover:text-[#e04040] transition-colors">
                    {next.title}
                  </h4>
                </Link>
              )}
            </div>

            {/* AUTHOR BIO BOX (border 1px + 4px bottom) */}
            <div className="border border-black border-b-[4px] p-7 flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-white">
              <Link
                href={`/author/${author.slug}`}
                className="w-24 h-24 rounded-full bg-black text-white flex items-center justify-center text-2xl font-extrabold shrink-0 np-head"
              >
                {author.initials}
              </Link>
              <div className="text-center sm:text-left">
                <h3 className="np-head font-extrabold uppercase text-[30px] leading-none">
                  <Link
                    href={`/author/${author.slug}`}
                    className="hover:text-[#e04040] transition-colors"
                  >
                    {author.name}
                  </Link>
                </h3>
                <div className="mt-1 text-xs italic text-[#e04040] np-ui">
                  {author.role} — leonidavice.local/author/{author.slug}
                </div>
                <p className="mt-3 text-[14.5px] leading-[1.6] text-black/90 np-ui">
                  {author.bio}
                </p>
              </div>
            </div>

            {/* READER COMMENTS + LEAVE A REPLY */}
            <div>
              <h3 className="np-head font-extrabold uppercase text-[26px] mb-5">
                {comments.length} CITIZEN RESPONSES
              </h3>
              <div className="space-y-4 mb-8">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="border border-black/20 p-4 bg-[#fafafa]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-sm np-ui">
                        {c.name}
                      </span>
                      <span className="text-xs text-black/55 np-ui">
                        {c.date}
                      </span>
                    </div>
                    <p className="text-[14.5px] leading-relaxed np-slab text-black/90">
                      {c.text}
                    </p>
                  </div>
                ))}
              </div>

              <h3 className="font-extrabold uppercase text-[16px] tracking-wider mb-4 np-ui">
                LEAVE A REPLY
              </h3>
              <form onSubmit={handleCommentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Name:*"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="np-input"
                  />
                  <input
                    type="email"
                    placeholder="Email:*"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="np-input"
                  />
                  <input
                    type="text"
                    placeholder="Website:"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="np-input"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-black/85 cursor-pointer select-none np-slab">
                  <input
                    type="checkbox"
                    checked={saveInfo}
                    onChange={(e) => setSaveInfo(e.target.checked)}
                    className="accent-[#e04040]"
                  />
                  <span>
                    Save my name, email, and website in this browser for the
                    next time I comment.
                  </span>
                </label>

                <textarea
                  rows={5}
                  placeholder="Comment:"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="np-input resize-y"
                />

                {commentErr && (
                  <p className="text-xs font-semibold text-[#e04040] np-ui">
                    {commentErr}
                  </p>
                )}

                <button
                  type="submit"
                  className="bg-[#e04040] hover:bg-black text-white px-6 py-3 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer np-ui"
                >
                  POST COMMENT
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT BLACK "POPULAR ARTICLES" CARD (exact match to post_5000.png) */}
          <aside className="lg:col-span-3 bg-black text-white p-6">
            <h3
              className="uppercase font-extrabold text-[26px] leading-none pb-3 mb-5 border-b border-white/25"
              style={{ fontFamily: "var(--f-head)" }}
            >
              POPULAR ARTICLES
            </h3>
            <div className="space-y-4">
              {top5.map((pop) => (
                <div
                  key={pop.slug}
                  className="pb-4 border-b border-white/15 last:border-b-0 last:pb-0"
                >
                  <h4
                    className="font-bold text-[19px] leading-[1.18]"
                    style={{ fontFamily: "var(--f-head)" }}
                  >
                    <Link
                      href={articleHref(pop)}
                      className="hover:text-[#e04040] transition-colors"
                    >
                      {pop.title}
                    </Link>
                  </h4>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </NewspaperShell>
  );
}
