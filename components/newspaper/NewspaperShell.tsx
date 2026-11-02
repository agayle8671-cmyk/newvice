"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./paper.css";
import { useAuth } from "@/lib/auth/context";
import { useGuestProfile } from "@/lib/profile/guest";
import AuthModal from "@/components/auth/AuthModal";
import ProfileModal from "@/components/profile/ProfileModal";
import SubmitClipModal from "@/components/drive-in/SubmitClipModal";
import {
  CATEGORIES,
  NAV_CATEGORIES,
  SITE,
  getChildren,
} from "@/lib/newspaper/categories";
import type { CategorySlug } from "@/lib/newspaper/types";
import {
  articleHref,
  byCategory,
  categoryHref,
  categoryName,
  formatDate,
  latest,
  popular,
  search,
  topLevel,
} from "@/lib/newspaper/content";
import { useArticlesVersion } from "@/lib/newspaper/useArticles";
import { CategoryPipe, NewsletterBox } from "./ArticleWidgets";

export interface NewspaperShellProps {
  children: React.ReactNode;
  activeCategory?: CategorySlug | string;
  presenceCount?: number;
  /** When hosted inside HomeClient, HomeClient already renders modals */
  embeddedModals?: boolean;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  onOpenSubmitClip?: () => void;
}

export default function NewspaperShell({
  children,
  activeCategory,
  presenceCount,
  embeddedModals = false,
  onOpenAuth,
  onOpenProfile,
  onOpenSubmitClip,
}: NewspaperShellProps) {
  const router = useRouter();
  const articlesVersion = useArticlesVersion();
  const { user, profile, setShowAuthModal, signOut } = useAuth();
  const guest = useGuestProfile();

  const [localProfileOpen, setLocalProfileOpen] = useState(false);
  const [localSubmitOpen, setLocalSubmitOpen] = useState(false);
  const [allDrawerOpen, setAllDrawerOpen] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<CategorySlug | null>(null);
  const [megaSubFilter, setMegaSubFilter] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [todayFormatted, setTodayFormatted] = useState("Leonida Daily Edition");
  const [edition, setEdition] = useState<"day" | "night">("day");

  const isAuthenticated = !!user;
  const currentUsername = profile?.username ?? guest?.username ?? "Citizen";

  const applyEdition = (next: "day" | "night") => {
    setEdition(next);
    try {
      localStorage.setItem("lv_paper_edition", next);
      window.dispatchEvent(new CustomEvent("lv:edition-change", { detail: next }));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    try {
      const urlEdition = new URLSearchParams(window.location.search).get("edition");
      const saved = (urlEdition === "night" || urlEdition === "day") ? urlEdition : localStorage.getItem("lv_paper_edition");
      if (saved === "night" || saved === "day") {
        setEdition(saved);
      }
    } catch {
      // ignore
    }
    const onEditionEvent = (e: Event) => {
      const detail = (e as CustomEvent<"day" | "night">).detail;
      if (detail === "day" || detail === "night") {
        setEdition(detail);
      }
    };
    window.addEventListener("lv:edition-change", onEditionEvent);

    setTodayFormatted(
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date())
    );
    const onScroll = () => {
      setScrolled(window.scrollY > 175);
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("lv:edition-change", onEditionEvent);
    };
  }, []);

  const activeTopCat = activeCategory
    ? topLevel(activeCategory as CategorySlug)
    : undefined;

  const openAuth = () => {
    if (onOpenAuth) onOpenAuth();
    else setShowAuthModal(true);
  };
  const openProfile = () => {
    if (onOpenProfile) onOpenProfile();
    else setLocalProfileOpen(true);
  };
  const openSubmitClip = () => {
    if (onOpenSubmitClip) onOpenSubmitClip();
    else setLocalSubmitOpen(true);
  };

  const instantSearchResults = useMemo(() => {
    void articlesVersion;
    if (searchQuery.trim().length < 2) return [];
    return search(searchQuery).slice(0, 5);
  }, [searchQuery, articlesVersion]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const megaArticles = useMemo(() => {
    void articlesVersion;
    if (!hoveredNav) return [];
    const targetSlug =
      megaSubFilter !== "all" ? megaSubFilter : hoveredNav;
    return byCategory(targetSlug).slice(0, 4);
  }, [hoveredNav, megaSubFilter, articlesVersion]);

  const latestThree = useMemo(() => {
    void articlesVersion;
    return latest(3);
  }, [articlesVersion]);
  const popularThree = useMemo(() => {
    void articlesVersion;
    return popular(3);
  }, [articlesVersion]);

  return (
    <div className="np-root" data-edition={edition}>
      {!embeddedModals && (
        <>
          <AuthModal />
          <ProfileModal
            isOpen={localProfileOpen}
            onClose={() => setLocalProfileOpen(false)}
          />
          <SubmitClipModal
            isOpen={localSubmitOpen}
            onClose={() => setLocalSubmitOpen(false)}
            defaultCreatorName={currentUsername}
          />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          1. TOP UTILITY BAR (Urban Observer PRO exact bar)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="border-b border-black bg-white">
        <div className="np-wrap py-2 flex flex-wrap items-center justify-between gap-3 text-[12px] np-ui font-semibold">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-black">{todayFormatted}</span>
            {typeof presenceCount === "number" ? (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[#e04040] uppercase tracking-wider text-[11px] font-bold"
              >
                <span className="np-live-dot" />
                <span>{presenceCount} WATCHING LIVE BROADCAST</span>
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[#e04040] hover:text-black uppercase tracking-wider text-[11px] font-bold transition-colors"
              >
                <span className="np-live-dot" />
                <span>WATCH LIVE BROADCAST</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4 sm:gap-5 uppercase tracking-wider text-[11.5px] font-bold">
            {/* Edition Switcher: Day Paper (Warm Newsprint) vs Night Wire (Dark Press Room) */}
            <div
              className="np-edition-toggle"
              role="group"
              aria-label="Broadsheet Edition Theme"
            >
              <button
                type="button"
                onClick={() => applyEdition("day")}
                className={`np-edition-pill ${
                  edition === "day" ? "active-day" : ""
                }`}
                title="Switch to Warm Sun-Bleached Newsprint Edition"
              >
                <span>☀️</span>
                <span>DAY PAPER</span>
              </button>
              <button
                type="button"
                onClick={() => applyEdition("night")}
                className={`np-edition-pill ${
                  edition === "night" ? "active-night" : ""
                }`}
                title="Switch to After-Hours Vice Night Wire Edition"
              >
                <span>🌙</span>
                <span>NIGHT WIRE</span>
              </button>
            </div>

            <button
              type="button"
              onClick={openSubmitClip}
              className="hidden sm:inline hover:text-[#e04040] transition-colors cursor-pointer uppercase"
            >
              SUBMIT CLIP
            </button>
            <Link href="/about" className="hover:text-[#e04040] transition-colors">
              ABOUT
            </Link>
            <Link href="/contact" className="hover:text-[#e04040] transition-colors">
              CONTACT
            </Link>

            {/* | MY ACCOUNT | */}
            <div className="relative">
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((o) => !o)}
                    className="text-[#e04040] hover:text-black transition-colors cursor-pointer uppercase font-bold"
                  >
                    | @{currentUsername} ▾ |
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-black border-b-[3px] shadow-lg z-50 py-1 text-left">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          openProfile();
                        }}
                        className="block w-full text-left px-3.5 py-2 text-xs hover:bg-[#f4f4f4] cursor-pointer"
                      >
                        Profile &amp; Garage Badge
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          openSubmitClip();
                        }}
                        className="block w-full text-left px-3.5 py-2 text-xs hover:bg-[#f4f4f4] cursor-pointer"
                      >
                        Submit Broadcast Clip
                      </button>
                      <Link
                        href="/pricing-plans"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-3.5 py-2 text-xs hover:bg-[#f4f4f4]"
                      >
                        Membership Plans
                      </Link>
                      <Link
                        href="/admin"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-3.5 py-2 text-xs font-bold hover:bg-[#f4f4f4]"
                      >
                        Newsroom Studio
                      </Link>
                      <div className="border-t border-black/15 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          signOut();
                        }}
                        className="block w-full text-left px-3.5 py-2 text-xs text-[#e04040] hover:bg-[#f4f4f4] cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={openAuth}
                  className="text-[#e04040] hover:text-black transition-colors cursor-pointer uppercase font-bold"
                >
                  | MY ACCOUNT |
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          2. MAIN MASTHEAD ROW (NEWSLETTER | LEONIDA VICE | PRICING PLANS)
      ═══════════════════════════════════════════════════════════════ */}
      <header className="border-b border-black bg-white">
        <div className="np-wrap py-6 sm:py-8 grid grid-cols-1 md:grid-cols-12 items-center gap-4">
          {/* Left: Envelope + NEWSLETTER */}
          <div className="hidden md:flex md:col-span-3 items-center justify-start">
            <Link
              href="/newsletter"
              className="group inline-flex flex-col items-center text-black hover:text-[#e04040] transition-colors"
            >
              <svg
                width="34"
                height="25"
                viewBox="0 0 34 25"
                fill="none"
                className="mb-1"
              >
                <rect
                  x="1"
                  y="1"
                  width="32"
                  height="23"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M2 2L17 14L32 2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <span
                className="uppercase font-bold tracking-wide"
                style={{ fontFamily: "var(--f-head)", fontSize: 21, lineHeight: 1 }}
              >
                NEWSLETTER
              </span>
            </Link>
          </div>

          {/* Center: LEONIDA VICE inline logo + red subtitle */}
          <div className="md:col-span-6 text-center">
            <Link href="/" className="inline-block group">
              <div
                className="np-logo select-none group-hover:opacity-85 transition-opacity"
                style={{ fontSize: "clamp(46px, 6vw, 78px)" }}
              >
                {SITE.name}
              </div>
              <p
                className="mt-1.5 text-[#e04040] tracking-wide"
                style={{
                  fontFamily: "var(--f-slab)",
                  fontSize: "clamp(13px, 1.15vw, 16px)",
                }}
              >
                {SITE.tagline}
              </p>
            </Link>
          </div>

          {/* Right: PRICING PLANS offset-shadow button */}
          <div className="hidden md:flex md:col-span-3 items-center justify-end">
            <Link href="/pricing-plans" className="np-btn-box">
              PRICING PLANS
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          3. STICKY NAVIGATION BAR ([ ☰ ALL ] + 7 CATEGORIES + SEARCH)
      ═══════════════════════════════════════════════════════════════ */}
      <nav
        onMouseLeave={() => {
          setHoveredNav(null);
          setMegaSubFilter("all");
        }}
        className={`sticky top-0 z-50 bg-white border-b-2 border-black transition-shadow ${
          scrolled ? "np-nav-stuck" : ""
        }`}
      >
        <div className="np-wrap min-h-[50px] flex items-center justify-center gap-3 sm:gap-6 flex-wrap py-1.5">
          {/* [ ☰ ALL ] button */}
          <button
            type="button"
            onClick={() => {
              setAllDrawerOpen((v) => !v);
              setHoveredNav(null);
              setSearchOpen(false);
            }}
            className={`px-3 py-1 text-[13px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors np-ui ${
              allDrawerOpen
                ? "bg-[#e04040] text-white"
                : "bg-black text-white hover:bg-[#e04040]"
            }`}
          >
            <span>{allDrawerOpen ? "✕" : "☰"}</span>
            <span>ALL</span>
          </button>

          {/* 7 Top-Level Categories */}
          {NAV_CATEGORIES.map((slug) => {
            const isActive = activeTopCat === slug;
            const isHovered = hoveredNav === slug;
            return (
              <Link
                key={slug}
                href={categoryHref(slug)}
                onMouseEnter={() => {
                  if (!allDrawerOpen && !searchOpen) {
                    setHoveredNav(slug);
                    setMegaSubFilter("all");
                  }
                }}
                onClick={() => {
                  setHoveredNav(null);
                  setAllDrawerOpen(false);
                }}
                className={`uppercase font-bold transition-colors ${
                  isActive || isHovered
                    ? "text-[#e04040]"
                    : "text-black hover:text-[#e04040]"
                }`}
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: "20px",
                  letterSpacing: "0.02em",
                }}
              >
                {categoryName(slug)}
              </Link>
            );
          })}

          {/* Search button */}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setAllDrawerOpen(false);
              setHoveredNav(null);
            }}
            aria-label="Search articles"
            className="p-1.5 text-black hover:text-[#e04040] transition-colors cursor-pointer"
          >
            <svg width="19" height="19" viewBox="0 0 22 22" fill="none">
              <circle
                cx="9.5"
                cy="9.5"
                r="7.5"
                stroke="currentColor"
                strokeWidth="2.2"
              />
              <path
                d="M15 15L20.5 20.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Quick Sticky Edition Toggle (visible when scrolling or anytime in nav) */}
          <button
            type="button"
            onClick={() => applyEdition(edition === "day" ? "night" : "day")}
            title={
              edition === "day"
                ? "Switch to Night Wire Edition"
                : "Switch to Warm Day Paper Edition"
            }
            className={`px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider border border-black flex items-center gap-1.5 cursor-pointer transition-colors np-ui ${
              edition === "night"
                ? "bg-[#e04040] text-white border-[#e04040]"
                : "bg-white text-black hover:bg-[#e04040] hover:text-white"
            }`}
          >
            <span>{edition === "day" ? "🌙" : "☀️"}</span>
            <span className="hidden sm:inline">
              {edition === "day" ? "NIGHT WIRE" : "DAY PAPER"}
            </span>
          </button>
        </div>

        {/* ── HOVER CATEGORY MEGA-MENU (tagDiv style) ── */}
        {hoveredNav && !allDrawerOpen && !searchOpen && (
          <div className="np-mega hidden lg:block">
            <div className="np-wrap py-6">
              {getChildren(hoveredNav).length > 0 ? (
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-2 border-r border-black pr-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onMouseEnter={() => setMegaSubFilter("all")}
                      onClick={() => router.push(categoryHref(hoveredNav))}
                      className={`text-left uppercase font-bold text-[18px] cursor-pointer transition-colors ${
                        megaSubFilter === "all"
                          ? "text-[#e04040]"
                          : "text-black hover:text-[#e04040]"
                      }`}
                      style={{ fontFamily: "var(--f-head)" }}
                    >
                      All {categoryName(hoveredNav)}
                    </button>
                    {getChildren(hoveredNav).map((sub) => (
                      <Link
                        key={sub.slug}
                        href={categoryHref(sub.slug)}
                        onMouseEnter={() => setMegaSubFilter(sub.slug)}
                        onClick={() => setHoveredNav(null)}
                        className={`uppercase font-bold text-[18px] transition-colors ${
                          megaSubFilter === sub.slug
                            ? "text-[#e04040]"
                            : "text-black hover:text-[#e04040]"
                        }`}
                        style={{ fontFamily: "var(--f-head)" }}
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                  <div className="col-span-10 grid grid-cols-4 gap-5">
                    {megaArticles.map((art) => (
                      <article key={art.slug}>
                        <Link
                          href={articleHref(art)}
                          onClick={() => setHoveredNav(null)}
                          className="np-imgwrap block aspect-[16/10] mb-2.5"
                        >
                          <img src={art.image} alt={art.title} loading="lazy" />
                        </Link>
                        <CategoryPipe slug={art.category} size={12} />
                        <h4 className="np-head font-bold text-[18px] leading-[1.16] mt-1.5">
                          <Link
                            href={articleHref(art)}
                            onClick={() => setHoveredNav(null)}
                            className="np-link"
                          >
                            {art.title}
                          </Link>
                        </h4>
                        <div className="np-meta text-[11.5px] mt-1 text-black/70">
                          {formatDate(art.date)}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-6">
                  {megaArticles.map((art) => (
                    <article key={art.slug}>
                      <Link
                        href={articleHref(art)}
                        onClick={() => setHoveredNav(null)}
                        className="np-imgwrap block aspect-[16/10] mb-2.5"
                      >
                        <img src={art.image} alt={art.title} loading="lazy" />
                      </Link>
                      <CategoryPipe slug={art.category} size={12} />
                      <h4 className="np-head font-bold text-[19px] leading-[1.16] mt-1.5">
                        <Link
                          href={articleHref(art)}
                          onClick={() => setHoveredNav(null)}
                          className="np-link"
                        >
                          {art.title}
                        </Link>
                      </h4>
                      <div className="np-meta text-[11.5px] mt-1 text-black/70">
                        {formatDate(art.date)}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── [ ☰ ALL ] FULL-WIDTH DIRECTORY DRAWER (exact demo 4-column index) ── */}
        {allDrawerOpen && (
          <div className="np-mega max-h-[82vh] overflow-y-auto">
            <div className="np-wrap py-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {CATEGORIES.filter(
                  (c) => c.slug !== "trailers-media"
                ).map((cat) => {
                  const catStories = byCategory(cat.slug).slice(0, 4);
                  return (
                    <div
                      key={cat.slug}
                      className="pb-6 border-b border-black/20"
                    >
                      <h3 className="np-head font-extrabold uppercase italic text-[24px] pb-2 mb-3 border-b border-black flex items-center justify-between">
                        <Link
                          href={categoryHref(cat.slug)}
                          onClick={() => setAllDrawerOpen(false)}
                          className="hover:text-[#e04040] transition-colors"
                        >
                          {cat.name}
                        </Link>
                        <span className="text-xs not-italic text-[#e04040] np-ui">
                          {byCategory(cat.slug).length}
                        </span>
                      </h3>
                      <ul className="space-y-2.5">
                        {catStories.map((st) => (
                          <li key={st.slug}>
                            <Link
                              href={articleHref(st)}
                              onClick={() => setAllDrawerOpen(false)}
                              className="np-head font-semibold text-[17px] leading-[1.18] hover:text-[#e04040] transition-colors block"
                            >
                              {st.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {/* Company / Hub Column (matches demo's "Company" section in ALL drawer) */}
                <div className="pb-6 border-b border-black/20">
                  <h3 className="np-head font-extrabold uppercase italic text-[24px] pb-2 mb-3 border-b border-black">
                    Publication &amp; Hub
                  </h3>
                  <ul className="space-y-2.5 np-head font-semibold text-[18px]">
                    <li>
                      <Link
                        href="/"
                        onClick={() => setAllDrawerOpen(false)}
                        className="text-[#e04040] hover:underline"
                      >
                        ▶ Live Broadcast &amp; Front Page
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/pricing-plans"
                        onClick={() => setAllDrawerOpen(false)}
                        className="hover:text-[#e04040]"
                      >
                        Pricing &amp; Membership Plans
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/newsletter"
                        onClick={() => setAllDrawerOpen(false)}
                        className="hover:text-[#e04040]"
                      >
                        Leonida Vice Newsletter
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/about"
                        onClick={() => setAllDrawerOpen(false)}
                        className="hover:text-[#e04040]"
                      >
                        About the Editorial Desk
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/contact"
                        onClick={() => setAllDrawerOpen(false)}
                        className="hover:text-[#e04040]"
                      >
                        Contact, Tips &amp; Advertising
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/privacy-policy"
                        onClick={() => setAllDrawerOpen(false)}
                        className="hover:text-[#e04040]"
                      >
                        Privacy &amp; Rockstar Fan Policy
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SEARCH DROPDOWN ── */}
        {searchOpen && (
          <div className="np-mega">
            <div className="np-wrap py-6 max-w-3xl">
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 48+ GTA VI articles, characters, districts, vehicles, leaks..."
                  className="np-input flex-1 text-base"
                />
                <button
                  type="submit"
                  className="bg-[#e04040] hover:bg-black text-white px-6 font-bold uppercase tracking-wider text-sm cursor-pointer transition-colors np-ui"
                >
                  SEARCH
                </button>
              </form>
              {instantSearchResults.length > 0 && (
                <div className="mt-4 divide-y divide-black/15 border-t border-black pt-3">
                  {instantSearchResults.map((art) => (
                    <Link
                      key={art.slug}
                      href={articleHref(art)}
                      onClick={() => setSearchOpen(false)}
                      className="py-2.5 flex items-center gap-3.5 hover:bg-[#f7f7f7] px-2 transition-colors"
                    >
                      <img
                        src={art.image}
                        alt={art.title}
                        className="w-14 h-10 object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="np-head font-bold text-[18px] truncate">
                          {art.title}
                        </div>
                        <div className="text-xs text-[#e04040] uppercase font-bold np-head">
                          | {categoryName(art.category)} |{" "}
                          <span className="text-black/65 np-ui font-normal">
                            {formatDate(art.date)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                  <div className="pt-2.5 text-right">
                    <Link
                      href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                      onClick={() => setSearchOpen(false)}
                      className="text-xs font-bold uppercase tracking-wider text-[#e04040] hover:underline np-ui"
                    >
                      View all results for &ldquo;{searchQuery.trim()}&rdquo; →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ═══════════════════════════════════════════════════════════════
          4. PAGE CONTENT
      ═══════════════════════════════════════════════════════════════ */}
      <main>{children}</main>

      {/* ═══════════════════════════════════════════════════════════════
          5. URBAN OBSERVER PRO 2-STAGE FOOTER (exact match to demo)
      ═══════════════════════════════════════════════════════════════ */}
      <footer className="mt-16">
        {/* Stage 1: Grey Masthead & Two-Row Navigation Band */}
        <div className="bg-[#eeeeee] border-t border-b border-black py-8">
          <div className="np-wrap flex flex-col lg:flex-row items-center justify-between gap-6">
            <Link
              href="/"
              className="np-logo shrink-0"
              style={{ fontSize: "clamp(36px, 4vw, 52px)" }}
            >
              {SITE.name}
            </Link>

            <div className="flex-1 w-full lg:max-w-4xl">
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 sm:gap-6 pb-3 border-b border-black/35">
                {NAV_CATEGORIES.map((slug) => (
                  <Link
                    key={slug}
                    href={categoryHref(slug)}
                    className={`uppercase font-bold text-[18px] transition-colors ${
                      activeTopCat === slug
                        ? "text-[#e04040]"
                        : "text-black hover:text-[#e04040]"
                    }`}
                    style={{ fontFamily: "var(--f-head)" }}
                  >
                    {categoryName(slug)}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-5 pt-3 text-[12px] font-semibold uppercase tracking-wider np-ui">
                <Link href="/about" className="hover:text-[#e04040]">
                  ABOUT
                </Link>
                <Link href="/contact" className="hover:text-[#e04040]">
                  CONTACT
                </Link>
                <Link href="/privacy-policy" className="hover:text-[#e04040]">
                  PRIVACY POLICY
                </Link>
                <Link href="/newsletter" className="hover:text-[#e04040]">
                  NEWSLETTER
                </Link>
                <Link href="/pricing-plans" className="hover:text-[#e04040]">
                  PRICING PLANS
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stage 2: 4-Column White Editorial Footer */}
        <div className="bg-white py-12">
          <div className="np-wrap grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Col 1: ABOUT US */}
            <div>
              <h3 className="np-head font-extrabold uppercase text-[24px] mb-4">
                ABOUT US
              </h3>
              <p className="text-[14px] leading-[1.65] text-black/85 np-slab mb-6">
                {SITE.about}
              </p>
              <div className="flex items-center gap-2.5">
                {[
                  { label: "f", href: "/contact" },
                  { label: "IG", href: "/contact" },
                  { label: "𝕏", href: "/contact" },
                  { label: "▶", href: "/" },
                ].map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className="w-9 h-9 bg-[#e04040] hover:bg-black text-white flex items-center justify-center font-bold text-sm transition-colors np-ui"
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Col 2: LATEST ARTICLES */}
            <div>
              <h3 className="np-head font-extrabold uppercase text-[24px] mb-4">
                LATEST ARTICLES
              </h3>
              <div className="space-y-4">
                {latestThree.map((art) => (
                  <div key={art.slug}>
                    <h4 className="np-head font-bold text-[19px] leading-[1.16]">
                      <Link href={articleHref(art)} className="np-link">
                        {art.title}
                      </Link>
                    </h4>
                    <div className="mt-1 text-[11.5px] np-ui">
                      <Link
                        href={categoryHref(art.category)}
                        className="font-bold uppercase mr-2 hover:text-[#e04040]"
                      >
                        {categoryName(art.category)}
                      </Link>
                      <span className="text-black/70">{formatDate(art.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 3: MOST POPULAR */}
            <div>
              <h3 className="np-head font-extrabold uppercase text-[24px] mb-4">
                MOST POPULAR
              </h3>
              <div className="space-y-4">
                {popularThree.map((art) => (
                  <div key={art.slug}>
                    <h4 className="np-head font-bold text-[19px] leading-[1.16]">
                      <Link href={articleHref(art)} className="np-link">
                        {art.title}
                      </Link>
                    </h4>
                    <div className="mt-1 text-[11.5px] np-ui">
                      <Link
                        href={categoryHref(art.category)}
                        className="font-bold uppercase mr-2 hover:text-[#e04040]"
                      >
                        {categoryName(art.category)}
                      </Link>
                      <span className="text-black/70">{formatDate(art.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 4: SUBSCRIBE */}
            <div>
              <h3 className="np-head font-extrabold uppercase text-[24px] mb-4">
                SUBSCRIBE
              </h3>
              <NewsletterBox compact />
            </div>
          </div>
        </div>

        {/* Stage 3: Bottom Copyright Rule */}
        <div className="border-t border-black bg-white py-5">
          <div className="np-wrap text-center text-[13px] np-slab text-black/85">
            © 2026 Leonida Vice. Independent Non-Commercial Fan Site — Not
            affiliated with or endorsed by Rockstar Games or Take-Two
            Interactive.
          </div>
        </div>
      </footer>

      {/* Floating Crimson Scroll-to-Top Button (matches demo bottom-right) */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className="fixed bottom-5 right-5 z-40 w-10 h-10 bg-[#e04040] hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
        >
          ▲
        </button>
      )}
    </div>
  );
}
