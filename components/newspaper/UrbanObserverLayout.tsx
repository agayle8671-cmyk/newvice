"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/lib/realtime/chat";
import type { VideoItem } from "@/lib/video/types";
import type { PlayerTelemetryState } from "@/components/video-engine/HTML5Player";
import { SITE, getAuthor } from "@/lib/newspaper/categories";
import {
  articleHref,
  byCategory,
  categoryHref,
  formatDate,
  getAllArticles,
  popular,
} from "@/lib/newspaper/content";
import { useArticlesVersion } from "@/lib/newspaper/useArticles";
import NewspaperShell from "./NewspaperShell";
import HouseAdBanner from "./HouseAdBanner";
import XRayTelemetryDeck from "./XRayTelemetryDeck";
import DetachableCommandCenter from "./DetachableCommandCenter";
import {
  CategoryPipe,
  CompactRightThumbRow,
  CutoutCard,
  HorizontalStoryCard,
  NewsletterBox,
  TopFiveWidget,
} from "./ArticleWidgets";

export interface UrbanObserverLayoutProps {
  screenNode: React.ReactNode;
  currentVideoItem: VideoItem | null;
  playerTelemetry?: PlayerTelemetryState | null;
  presenceCount: number;
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  inputError: string | null;
  setInputError: React.Dispatch<React.SetStateAction<string | null>>;
  handleSendMessage: (e?: React.FormEvent) => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  handleChatScroll: () => void;
  isAuthenticated: boolean;
  currentUsername: string;
  currentBadgeColor: string;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenSubmitClip: () => void;
  onSignOut: () => void;
}

export default function UrbanObserverLayout({
  screenNode,
  currentVideoItem,
  playerTelemetry = null,
  presenceCount,
  messages,
  inputValue,
  setInputValue,
  inputError,
  setInputError,
  handleSendMessage,
  chatScrollRef,
  handleChatScroll,
  currentUsername,
  onOpenAuth,
  onOpenProfile,
  onOpenSubmitClip,
}: UrbanObserverLayoutProps) {
  const [theaterWide, setTheaterWide] = useState(false);
  const [charSlide, setCharSlide] = useState(0);
  const [techSlide, setTechSlide] = useState(0);
  const [latestCount, setLatestCount] = useState(6);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const heroSlotRef = useRef<HTMLDivElement | null>(null);
  const videoStageNodeRef = useRef<HTMLDivElement | null>(null);
  const articlesVersion = useArticlesVersion();

  const allArticles = useMemo(() => {
    void articlesVersion;
    return getAllArticles();
  }, [articlesVersion]);

  // Curated slices across all published GTA VI articles (live-updated on admin publish)
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);
  const heroThree = useMemo(() => allArticles.slice(0, 3), [allArticles]);
  const subHeroFour = useMemo(() => allArticles.slice(3, 7), [allArticles]);
  const editorsFive = useMemo(() => {
    void articlesVersion;
    return byCategory("leonida").slice(0, 5);
  }, [articlesVersion]);
  const midSpotlight = useMemo(
    () =>
      allArticles.find(
        (a) => a.slug === "trailer-1-to-trailer-2-frame-by-frame-visual-leap"
      ) ?? allArticles[7] ?? allArticles[0],
    [allArticles]
  );
  const rightWireSeven = useMemo(() => {
    void articlesVersion;
    return byCategory("trailers-media").slice(1, 8);
  }, [articlesVersion]);
  const dontMissFour = useMemo(() => {
    void articlesVersion;
    return [
      byCategory("characters")[1],
      byCategory("story")[1],
      byCategory("leaks-rumors")[1],
      byCategory("vehicles-weapons")[1],
    ].filter(Boolean);
  }, [articlesVersion]);
  const dontMissRightThree = useMemo(() => {
    void articlesVersion;
    return [
      byCategory("leonida")[1],
      byCategory("tech-rage")[1],
      byCategory("trailers-media")[5],
    ].filter(Boolean);
  }, [articlesVersion]);

  const characterList = useMemo(() => {
    void articlesVersion;
    return byCategory("characters");
  }, [articlesVersion]);
  const storyList = useMemo(() => {
    void articlesVersion;
    return byCategory("story");
  }, [articlesVersion]);
  const leaksList = useMemo(() => {
    void articlesVersion;
    return byCategory("leaks-rumors");
  }, [articlesVersion]);
  const techList = useMemo(() => {
    void articlesVersion;
    return byCategory("tech-rage");
  }, [articlesVersion]);
  const vehiclesList = useMemo(() => {
    void articlesVersion;
    return byCategory("vehicles-weapons");
  }, [articlesVersion]);

  const latestFeedPool = useMemo(() => allArticles.slice(6), [allArticles]);
  const middleCutoutFour = useMemo(() => {
    void articlesVersion;
    return [
      byCategory("leonida")[2],
      byCategory("leonida")[3],
      byCategory("leonida")[4],
      byCategory("vehicles-weapons")[3],
    ].filter(Boolean);
  }, [articlesVersion]);

  const activeChar = characterList[charSlide % Math.max(1, characterList.length)] ?? allArticles[0];
  const activeCharAuthor = getAuthor(activeChar.author);
  const activeTech = techList[techSlide % Math.max(1, techList.length)] ?? allArticles[0];
  const activeTechAuthor = getAuthor(activeTech.author);

  const liveHeadline =
    currentVideoItem?.title ||
    "Leonida Live Broadcast: Synchronized GTA VI Community Feed";
  const liveAuthor =
    currentVideoItem?.creatorName || "Leonida Vice Broadcast Desk";

  return (
    <NewspaperShell
      presenceCount={presenceCount}
      embeddedModals
      onOpenAuth={onOpenAuth}
      onOpenProfile={onOpenProfile}
      onOpenSubmitClip={onOpenSubmitClip}
    >
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 0: HERO LIVE BROADCAST STAGE (Directly under Sticky Nav)
          [ TOP 5 THIS WEEK  |  CENTER SYNCHRONIZED SCREEN  |  LIVE CHAT ]
      ══════════════════════════════════════════════════════════════════ */}
      <section className="border-b border-black bg-white">
        <div className="np-wrap py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
            {/* LEFT COLUMN: TOP 5 THIS WEEK */}
            {!theaterWide && (
              <div className="lg:col-span-3 lg:pr-6 np-vr order-2 lg:order-1">
                <TopFiveWidget articles={top5} title="TOP 5 THIS WEEK" />
              </div>
            )}

            {/* CENTER COLUMN: LIVE SYNCHRONIZED GTA VI VIDEO PLAYER */}
            <div
              className={`${
                theaterWide ? "lg:col-span-9" : "lg:col-span-6"
              } lg:pr-6 np-vr order-1 lg:order-2`}
            >
              {/* Broadcast Header Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3.5 border-b border-black">
                <div className="flex items-center gap-2.5">
                  <span
                    className="bg-[#e04040] text-white px-2.5 py-0.5 uppercase italic font-extrabold tracking-wide text-[16px]"
                    style={{ fontFamily: "var(--f-head)" }}
                  >
                    LIVE BROADCAST
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-black/80 np-ui">
                    SYNCHRONIZED FEED • EVERYONE WATCHES TOGETHER
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("lv:toggle-forensic-loupe"))
                    }
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-black bg-black text-white hover:bg-[#e04040] hover:border-[#e04040] transition-colors cursor-pointer np-ui"
                    title="Open Frame-Accurate Forensic Loupe (-1f/+1f Stepper, 800% Zoom & Storyboard Export)"
                  >
                    🔬 8× LOUPE
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("lv:toggle-document-pip"))
                    }
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-black hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                    title="Detach live broadcast + Citizen Wire into an always-on-top Document PiP Command Center"
                  >
                    {isPiPActive ? "↩ DOCK PiP" : "⧉ PiP COMMAND"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheaterWide((w) => !w)}
                    className="hidden lg:inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-black hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                  >
                    {theaterWide ? "⤡ STANDARD GRID" : "⤢ EXPAND PLAYER"}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSubmitClip}
                    className="text-[13px] font-bold uppercase text-[#e04040] hover:text-black cursor-pointer np-head tracking-wide"
                  >
                    | + SUBMIT CLIP |
                  </button>
                </div>
              </div>

              {/* 16:9 Cinema Frame wrapping the existing synchronized VideoEngine */}
              <div
                ref={heroSlotRef}
                className="relative w-full aspect-video bg-black border-2 border-black overflow-hidden shadow-[4px_4px_0_#000]"
              >
                {/* Persistent video node that seamlessly moves to Sticky Mini-Player or Document PiP */}
                <div ref={videoStageNodeRef} className="relative z-10 w-full h-full">
                  {screenNode}
                </div>

                {/* Shown underneath when the live video node is floating in Sticky Mini-Player or OS PiP */}
                <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-[#0d0e14] text-white p-6 text-center select-none">
                  <span className="bg-[#e04040] text-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest mb-2">
                    FLOATING COMMAND CENTER ACTIVE
                  </span>
                  <p className="text-xs font-mono text-white/80 max-w-md">
                    The live synchronized broadcast is currently running in your detached{" "}
                    {isPiPActive ? "OS Picture-in-Picture Command Window" : "Sticky Corner Mini-Deck"}.
                  </p>
                  {isPiPActive && (
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("lv:toggle-document-pip"))
                      }
                      className="mt-3 px-3 py-1 bg-white text-black hover:bg-[#e04040] hover:text-white text-[11px] font-extrabold uppercase tracking-wider cursor-pointer"
                    >
                      ↩ DOCK BACK TO HERO STAGE
                    </button>
                  )}
                </div>
              </div>

              {/* Signature Overlapping White Cutout Broadcast Card */}
              <div className="relative z-20 mx-3 sm:mx-7 -mt-7 bg-white border border-black border-b-[4px] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <span className="np-pipe text-[14px]">
                    NOW PLAYING ON LEONIDA TV
                  </span>
                  <span className="np-meta text-[12px] text-black/75">
                    Source: @{liveAuthor}
                  </span>
                </div>
                <h1 className="np-head font-extrabold text-[26px] sm:text-[34px] leading-[1.08] text-black">
                  {liveHeadline}
                </h1>
              </div>

              {/* Layer 3: Bi-Directional X-Ray Telemetry Drawer & Leonida Radar Sync */}
              <XRayTelemetryDeck
                currentVideoItem={currentVideoItem}
                telemetry={playerTelemetry}
                onOpenForensicLoupe={() =>
                  window.dispatchEvent(new CustomEvent("lv:toggle-forensic-loupe"))
                }
                onDetachPiP={() =>
                  window.dispatchEvent(new CustomEvent("lv:toggle-document-pip"))
                }
                isPiPActive={isPiPActive}
              />

              {/* Editorial Broadcast Sub-Deck + Quick Story Links */}
              <p className="mt-4 px-1 text-[14.5px] leading-[1.6] text-black/90 np-slab">
                Every citizen tuned into <strong>Leonida Vice</strong> watches
                the exact same curated GTA VI clip at the exact same second.
                Click the broadcast screen to toggle audio, or file your live
                reaction in the Citizen Wire.
              </p>

              <div className="mt-5 pt-4 border-t border-black grid grid-cols-1 sm:grid-cols-2 gap-4">
                {allArticles.slice(7, 9).map((spot, i) => (
                  <div
                    key={spot.slug}
                    className={
                      i === 0 ? "sm:pr-4 sm:border-r sm:border-black" : ""
                    }
                  >
                    <CategoryPipe slug={spot.category} size={12} />
                    <h3 className="np-head font-bold text-[19px] leading-[1.15] mt-1">
                      <Link href={articleHref(spot)} className="np-link">
                        {spot.title}
                      </Link>
                    </h3>
                    <div className="np-meta text-[11.5px] text-black/65 mt-1">
                      {formatDate(spot.date)} • {spot.readMins} min read
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: LIVE CITIZEN WIRE (Real-Time Chat) */}
            <div className="lg:col-span-3 flex flex-col order-3">
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b-2 border-black">
                <h2
                  className="uppercase italic font-extrabold text-[25px] leading-none"
                  style={{ fontFamily: "var(--f-head)" }}
                >
                  LIVE CITIZEN WIRE
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#e04040] np-ui">
                  <span className="np-live-dot" />
                  {presenceCount} LIVE
                </span>
              </div>

              {/* Quick topic chips */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {["#ViceCity ", "#Lucia ", "#Trailer ", "#RAGE "].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setInputValue((v) => `${v}${tag}`)}
                    className="text-[11px] font-bold uppercase px-2 py-0.5 border border-black/30 hover:border-black hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                  >
                    {tag.trim()}
                  </button>
                ))}
              </div>

              {/* Messages Scroll Box */}
              <div
                ref={chatScrollRef}
                onScroll={handleChatScroll}
                className="overflow-y-auto pr-1.5 space-y-2.5 border-b border-black pb-3"
                style={{ height: theaterWide ? 470 : 415 }}
              >
                {messages.length === 0 ? (
                  <div className="py-12 text-center px-3">
                    <p className="text-[13.5px] italic text-black/60 np-slab">
                      Citizen Wire is open. File the first live dispatch while
                      watching the broadcast...
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`pb-2.5 border-b border-black/15 text-[13px] leading-snug ${
                        msg.isAnnouncement
                          ? "bg-[#fff4f4] border-l-[3px] border-l-[#e04040] pl-2.5 py-1.5"
                          : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold uppercase tracking-wide text-[11.5px] text-black np-ui">
                          {msg.isAnnouncement
                            ? "★ NEWSROOM WIRE"
                            : `@${msg.username}`}
                        </span>
                        <span className="text-[10px] text-black/45 np-ui">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-black/90 break-words np-ui">
                        {msg.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Dispatch Input */}
              <form onSubmit={handleSendMessage} className="mt-3">
                {inputError && (
                  <div className="mb-1.5 text-[11px] font-semibold text-[#e04040] np-ui">
                    {inputError}
                  </div>
                )}
                <div className="flex border border-black border-b-[3px] bg-white">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      if (inputError) setInputError(null);
                    }}
                    maxLength={280}
                    placeholder={`Dispatch as @${currentUsername}...`}
                    className="flex-1 min-w-0 px-3 py-2.5 text-[13px] text-black placeholder-black/50 bg-transparent outline-none np-ui"
                  />
                  <button
                    type="submit"
                    className="px-4 bg-[#e04040] hover:bg-black text-white font-bold uppercase tracking-wider text-[15px] transition-colors cursor-pointer"
                    style={{ fontFamily: "var(--f-head)" }}
                  >
                    SEND
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1: 980×90 HOUSE AD BAND (matches urban_top.png)
      ══════════════════════════════════════════════════════════════════ */}
      <HouseAdBanner variant="leaderboard-band" />

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2: 3 BIG HERO STORIES + 4 SUB-HERO CUTOUT CARDS
          (exact match to urban_top.png & urban_mid.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap pt-10 pb-8">
        {/* Top Row: 3 Large Lined-Cutout Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-black">
          {heroThree.map((art, i) => (
            <div
              key={art.slug}
              className={i < 2 ? "md:pr-8 np-vr" : ""}
            >
              <CutoutCard
                article={art}
                aspect="aspect-[4/3]"
                titleSize="text-[30px] sm:text-[34px]"
                lined
                align="center"
                showExcerpt
              />
            </div>
          ))}
        </div>

        {/* Bottom Row: 4 Medium Cutout Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7 pt-8">
          {subHeroFour.map((art, i) => (
            <div
              key={art.slug}
              className={i < 3 ? "lg:pr-7 np-vr" : ""}
            >
              <CutoutCard
                article={art}
                aspect="aspect-[16/10]"
                titleSize="text-[23px]"
                lined={false}
                align="center"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3: BORDERED MEMBERSHIP / SUBSCRIBE CALLOUT BOX
          (exact match to urban_mid.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap my-8">
        <div className="border border-black border-b-[4px] bg-white px-6 sm:px-12 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div
              className="np-logo"
              style={{ fontSize: "clamp(34px, 3.6vw, 48px)" }}
            >
              {SITE.name}
            </div>
            <div className="w-20 h-[3px] bg-[#e04040] mt-2 mb-3.5" />
            <p className="text-[16px] sm:text-[18px] leading-[1.55] text-black np-slab">
              Every investigation, county map dossier, and RAGE engine breakdown
              in our growing Leonida archive is open to the community. Check our
              upcoming insider tiers and dispatch alerts!
            </p>
          </div>
          <div className="md:pl-10 md:border-l md:border-black self-stretch flex items-center">
            <Link
              href="/pricing-plans"
              className="np-btn-red inline-block whitespace-nowrap"
            >
              SUBSCRIBE NOW
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4: 3-COLUMN EDITORIAL FEATURE
          [ LEONIDA TOP 5  |  BIG FEATURED STORY  |  QUICK DISPATCH LIST ]
          (exact match to home_1250.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 3: LEONIDA REGIONAL TOP 5 */}
          <div className="lg:col-span-3 lg:pr-6 np-vr">
            <TopFiveWidget articles={editorsFive} title="LEONIDA DOSSIER" />
          </div>

          {/* Center 6: Big Featured Story with Left-Aligned Lined Cutout */}
          <div className="lg:col-span-6 lg:pr-6 np-vr">
            <CutoutCard
              article={midSpotlight}
              aspect="aspect-[16/11]"
              titleSize="text-[36px] sm:text-[44px]"
              lined
              align="left"
              showDate
              showExcerpt
            />
          </div>

          {/* Right 3: 7 Stacked Wire Stories */}
          <div className="lg:col-span-3">
            {rightWireSeven.map((art) => (
              <article
                key={art.slug}
                className="pb-4 mb-4 border-b border-black last:border-b-0 last:mb-0 last:pb-0"
              >
                <h3 className="np-head font-bold text-[22px] leading-[1.14]">
                  <Link href={articleHref(art)} className="np-link">
                    {art.title}
                  </Link>
                </h3>
                <div className="mt-2 flex items-center gap-2.5 flex-wrap">
                  <CategoryPipe slug={art.category} size={13} />
                  <span className="np-meta text-[12.5px]">
                    {formatDate(art.date)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5: "DON'T MISS" PINSTRIPE BANNER + 2×2 LEFT / 3 RIGHT
          (exact match to urban_bot1.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap pt-6 pb-10">
        <div className="np-pinstripe">
          <span>DON&apos;T MISS</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 6: 2×2 Grid of Cutout Cards */}
          <div className="lg:col-span-6 lg:pr-8 np-vr grid grid-cols-1 sm:grid-cols-2 gap-7">
            {dontMissFour.map((art) => (
              <div
                key={art.slug}
                className="pb-6 border-b border-black/25 sm:last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
              >
                <CutoutCard
                  article={art}
                  aspect="aspect-[4/3]"
                  titleSize="text-[23px]"
                  align="center"
                />
              </div>
            ))}
          </div>

          {/* Right 6: 3 Large Horizontal Cards */}
          <div className="lg:col-span-6 space-y-7">
            {dontMissRightThree.map((art, idx) => (
              <div
                key={art.slug}
                className={
                  idx < dontMissRightThree.length - 1
                    ? "pb-7 border-b border-black"
                    : ""
                }
              >
                <HorizontalStoryCard
                  article={art}
                  imageWidth="w-full sm:w-[270px]"
                  imageAspect="aspect-[16/10]"
                  titleSize="text-[28px] sm:text-[31px]"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6: SECOND 980×90 HOUSE AD BAND (matches home_2500.png)
      ══════════════════════════════════════════════════════════════════ */}
      <HouseAdBanner variant="leaderboard-band" />

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7: 3-COLUMN CATEGORY SHOWCASE
          [ CHARACTERS (boxed carousel)  |  STORY (7)  |  LEAKS & RUMORS (7) ]
          (exact match to urban_bot2.png — CELEBRITIES | DRAMA | SCANDALS)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 4: Boxed CHARACTERS Spotlight Carousel */}
          <div className="lg:col-span-4 border border-black border-b-[4px] p-6 bg-white">
            <h2
              className="text-center uppercase italic font-extrabold text-[36px] leading-none text-[#e04040] pb-4 mb-6 border-b border-black"
              style={{ fontFamily: "var(--f-head)" }}
            >
              <Link
                href={categoryHref("characters")}
                className="hover:text-black transition-colors"
              >
                CHARACTERS
              </Link>
            </h2>

            <Link
              href={articleHref(activeChar)}
              className="np-imgwrap block aspect-[4/3] w-full"
            >
              <img src={activeChar.image} alt={activeChar.title} />
            </Link>

            <div className="np-cutout-box np-cutout-lined">
              <h3 className="np-head font-extrabold text-[31px] leading-[1.38]">
                <Link
                  href={articleHref(activeChar)}
                  className="np-cutout hover:text-[#e04040] transition-colors"
                >
                  {activeChar.title}
                </Link>
              </h3>
            </div>

            <div className="mt-4 text-center np-meta">
              <Link
                href={`/author/${activeCharAuthor.slug}`}
                className="hover:text-[#e04040]"
              >
                {activeCharAuthor.name}
              </Link>{" "}
              - {formatDate(activeChar.date)}
            </div>

            <p className="mt-3 text-center text-[14.5px] leading-[1.6] text-black/90 np-slab px-2">
              {activeChar.excerpt}
            </p>

            {/* Working < > Carousel Controls */}
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="Previous character story"
                onClick={() =>
                  setCharSlide(
                    (s) => (s - 1 + characterList.length) % characterList.length
                  )
                }
                className="w-8 h-8 border border-black/40 hover:border-black hover:bg-black hover:text-white flex items-center justify-center text-sm cursor-pointer transition-colors"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next character story"
                onClick={() =>
                  setCharSlide((s) => (s + 1) % characterList.length)
                }
                className="w-8 h-8 border border-black border-b-[2px] hover:bg-black hover:text-white flex items-center justify-center text-sm cursor-pointer transition-colors"
              >
                ›
              </button>
            </div>
          </div>

          {/* Middle 4: STORY */}
          <div className="lg:col-span-4 lg:pr-7 np-vr">
            <h2 className="np-blocktitle">
              <Link
                href={categoryHref("story")}
                className="hover:text-[#e04040] transition-colors"
              >
                STORY
              </Link>
            </h2>
            <div>
              {storyList.slice(0, 6).map((art) => (
                <CompactRightThumbRow key={art.slug} article={art} />
              ))}
            </div>
          </div>

          {/* Right 4: LEAKS & RUMORS */}
          <div className="lg:col-span-4">
            <h2 className="np-blocktitle">
              <Link
                href={categoryHref("leaks-rumors")}
                className="hover:text-[#e04040] transition-colors"
              >
                LEAKS &amp; RUMORS
              </Link>
            </h2>
            <div>
              {leaksList.slice(0, 6).map((art) => (
                <CompactRightThumbRow key={art.slug} article={art} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8: "LATEST POSTS" CRIMSON PINSTRIPE + 3-COLUMN FEED
          (exact match to home_3750.png & home_5000.png)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="np-wrap pt-4 pb-8">
        <div className="np-pinstripe">
          <span style={{ color: "#e04040" }}>LATEST POSTS</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 6: Large Horizontal Article Feed + Load More */}
          <div className="lg:col-span-6 lg:pr-8 np-vr">
            <div className="space-y-7">
              {latestFeedPool.slice(0, latestCount).map((art, idx, arr) => (
                <div
                  key={art.slug}
                  className={
                    idx < arr.length - 1 ? "pb-7 border-b border-black" : ""
                  }
                >
                  <HorizontalStoryCard
                    article={art}
                    imageWidth="w-full sm:w-[250px]"
                    imageAspect="aspect-[4/3]"
                    titleSize="text-[27px] sm:text-[30px]"
                  />
                </div>
              ))}
            </div>

            {latestCount < latestFeedPool.length && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => setLatestCount((c) => c + 6)}
                  className="border border-black border-b-[3px] px-6 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                >
                  LOAD MORE ›
                </button>
              </div>
            )}
          </div>

          {/* Center 3: Vertical Cutout Cards */}
          <div className="lg:col-span-3 lg:pr-6 np-vr space-y-7">
            {middleCutoutFour.map((art, idx) => (
              <div
                key={art.slug}
                className={
                  idx < middleCutoutFour.length - 1
                    ? "pb-7 border-b border-black"
                    : ""
                }
              >
                <CutoutCard
                  article={art}
                  aspect="aspect-[4/3]"
                  titleSize="text-[22px]"
                  align="center"
                />
              </div>
            ))}
          </div>

          {/* Right 3: Square Ad + Newsletter + Tech Slider + Vehicles Red Box */}
          <div className="lg:col-span-3 space-y-8">
            <HouseAdBanner variant="square" />

            <div className="pt-2">
              <NewsletterBox />
            </div>

            {/* TECH & RAGE Dark Overlay Slider (matches TECHNOLOGY card in home_5000.png) */}
            <div>
              <h3 className="text-center uppercase font-extrabold text-[20px] tracking-wider mb-3 np-ui">
                <Link
                  href={categoryHref("tech-rage")}
                  className="hover:text-[#e04040] transition-colors"
                >
                  TECH &amp; RAGE
                </Link>
              </h3>
              <div className="relative aspect-[3/4] w-full overflow-hidden border border-black group">
                <img
                  src={activeTech.image}
                  alt={activeTech.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.88) 100%)",
                  }}
                />
                <div className="absolute top-3 right-3 z-10 flex gap-1">
                  <button
                    type="button"
                    aria-label="Previous tech article"
                    onClick={() =>
                      setTechSlide(
                        (s) => (s - 1 + techList.length) % techList.length
                      )
                    }
                    className="w-7 h-7 bg-black/75 hover:bg-[#e04040] text-white text-sm flex items-center justify-center cursor-pointer transition-colors"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next tech article"
                    onClick={() =>
                      setTechSlide((s) => (s + 1) % techList.length)
                    }
                    className="w-7 h-7 bg-black/75 hover:bg-[#e04040] text-white text-sm flex items-center justify-center cursor-pointer transition-colors"
                  >
                    ›
                  </button>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5 z-10 text-white">
                  <h4 className="font-bold text-[22px] leading-[1.18] np-ui">
                    <Link
                      href={articleHref(activeTech)}
                      className="hover:underline"
                    >
                      {activeTech.title}
                    </Link>
                  </h4>
                  <div className="mt-2 text-xs text-white/80 np-ui">
                    {activeTechAuthor.name} - {formatDate(activeTech.date)}
                  </div>
                </div>
              </div>
            </div>

            {/* VEHICLES & WEAPONS Red Bar + 5 Text Stories (matches HEALTH in home_5000.png) */}
            <div>
              <Link
                href={categoryHref("vehicles-weapons")}
                className="block np-redbar mb-5 hover:bg-black transition-colors"
              >
                VEHICLES &amp; WEAPONS
              </Link>
              <div>
                {vehiclesList.slice(0, 5).map((art) => (
                  <article
                    key={art.slug}
                    className="pb-4 mb-4 border-b border-black last:border-b-0 last:mb-0 last:pb-0"
                  >
                    <h4 className="np-head font-bold text-[21px] leading-[1.15]">
                      <Link href={articleHref(art)} className="np-link">
                        {art.title}
                      </Link>
                    </h4>
                    <div className="mt-1.5 np-meta text-[12px] text-black/75">
                      {formatDate(art.date)}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stage 3: Detachable Document PiP & Scroll-Triggered Sticky Mini-Command Center */}
      <DetachableCommandCenter
        videoStageNodeRef={videoStageNodeRef}
        heroSlotRef={heroSlotRef}
        currentVideoItem={currentVideoItem}
        telemetry={playerTelemetry}
        presenceCount={presenceCount}
        messages={messages}
        inputValue={inputValue}
        setInputValue={setInputValue}
        handleSendMessage={handleSendMessage}
        currentUsername={currentUsername}
        onPiPStateChange={setIsPiPActive}
      />
    </NewspaperShell>
  );
}
