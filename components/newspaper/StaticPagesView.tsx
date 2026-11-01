"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Author } from "@/lib/newspaper/types";
import { AUTHORS, SITE } from "@/lib/newspaper/categories";
import {
  allTags,
  byAuthor,
  byTag,
  getAllArticles,
  popular,
  search,
  slugify,
} from "@/lib/newspaper/content";
import { useArticlesVersion } from "@/lib/newspaper/useArticles";
import NewspaperShell from "./NewspaperShell";
import HouseAdBanner from "./HouseAdBanner";
import {
  HorizontalStoryCard,
  NewsletterBox,
  TopFiveWidget,
} from "./ArticleWidgets";

/* ════════════════════════════════════════════════════════════════════
   1. AUTHOR ARCHIVE VIEW (/author/[slug])
   ════════════════════════════════════════════════════════════════════ */
export function AuthorArchiveView({ author }: { author: Author }) {
  const articlesVersion = useArticlesVersion();
  const articles = useMemo(() => {
    void articlesVersion;
    return byAuthor(author.slug);
  }, [author.slug, articlesVersion]);
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);

  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4">
        <div className="np-wrap max-w-4xl flex flex-col sm:flex-row items-center gap-7">
          <div className="w-24 h-24 rounded-full bg-black text-white flex items-center justify-center text-3xl font-extrabold shrink-0 np-head">
            {author.initials}
          </div>
          <div className="text-center sm:text-left">
            <div className="text-xs font-bold uppercase tracking-widest text-[#e04040] np-ui">
              {author.role} • {articles.length} PUBLISHED DISPATCHES
            </div>
            <h1 className="np-head font-extrabold uppercase text-[48px] leading-none mt-1">
              {author.name}
            </h1>
            <p className="mt-3 text-[15px] leading-[1.6] text-black/85 np-slab">
              {author.bio}
            </p>
          </div>
        </div>
      </section>

      <div className="np-wrap py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-8 space-y-7">
          {articles.map((art) => (
            <div key={art.slug} className="pb-7 border-b border-black">
              <HorizontalStoryCard
                article={art}
                imageWidth="w-full sm:w-[240px]"
                imageAspect="aspect-[4/3]"
                titleSize="text-[28px]"
              />
            </div>
          ))}
        </div>
        <aside className="lg:col-span-4 space-y-8">
          <TopFiveWidget articles={top5} />
          <HouseAdBanner variant="square" />
        </aside>
      </div>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   2. TAG ARCHIVE VIEW (/tag/[slug])
   ════════════════════════════════════════════════════════════════════ */
export function TagArchiveView({
  tagSlug,
  tagLabel,
}: {
  tagSlug: string;
  tagLabel: string;
}) {
  const articlesVersion = useArticlesVersion();
  const articles = useMemo(() => {
    void articlesVersion;
    return byTag(tagSlug);
  }, [tagSlug, articlesVersion]);
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);
  const tags = useMemo(() => {
    void articlesVersion;
    return allTags().slice(0, 18);
  }, [articlesVersion]);

  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-11 px-4 text-center">
        <div className="np-wrap">
          <div className="text-xs font-bold uppercase tracking-widest text-[#e04040] np-ui">
            TOPIC DOSSIER • {articles.length} ARTICLES
          </div>
          <h1 className="np-head font-extrabold uppercase text-[52px] leading-none mt-1">
            #{tagLabel}
          </h1>
          <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {tags.map((t) => (
              <Link
                key={t}
                href={`/tag/${slugify(t)}`}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase border border-black np-ui transition-colors ${
                  slugify(t) === tagSlug
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-black hover:text-white"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="np-wrap py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-8 space-y-7">
          {articles.map((art) => (
            <div key={art.slug} className="pb-7 border-b border-black">
              <HorizontalStoryCard
                article={art}
                imageWidth="w-full sm:w-[240px]"
                imageAspect="aspect-[4/3]"
                titleSize="text-[28px]"
              />
            </div>
          ))}
        </div>
        <aside className="lg:col-span-4 space-y-8">
          <TopFiveWidget articles={top5} />
          <HouseAdBanner variant="square" />
        </aside>
      </div>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   3. SEARCH PAGE VIEW (/search?q=...)
   ════════════════════════════════════════════════════════════════════ */
export function SearchPageView({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const articlesVersion = useArticlesVersion();
  const results = useMemo(() => {
    void articlesVersion;
    return q.trim() ? search(q) : getAllArticles().slice(0, 12);
  }, [q, articlesVersion]);
  const top5 = useMemo(() => {
    void articlesVersion;
    return popular(5);
  }, [articlesVersion]);
  const tags = useMemo(() => {
    void articlesVersion;
    return allTags().slice(0, 14);
  }, [articlesVersion]);

  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-11 px-4">
        <div className="np-wrap max-w-3xl text-center">
          <h1 className="np-head font-extrabold uppercase text-[50px] leading-none">
            {q.trim() ? `SEARCH: “${q.trim()}”` : "SEARCH ARCHIVE"}
          </h1>
          <div className="mt-5 flex border border-black border-b-[3px] bg-white">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a character, county, car, radio station, or mechanic..."
              className="flex-1 px-4 py-3 text-base outline-none np-ui"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="px-4 text-xs font-bold uppercase text-black/60 hover:text-black cursor-pointer np-ui"
              >
                CLEAR
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQ(t)}
                className="px-2.5 py-0.5 text-[11px] font-bold uppercase border border-black bg-white hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="np-wrap py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-8">
          <div className="text-xs font-bold uppercase tracking-widest text-[#e04040] mb-6 np-ui">
            {q.trim()
              ? `${results.length} MATCHING ARTICLES FOUND`
              : "RECENT ARCHIVE HIGHLIGHTS"}
          </div>
          {results.length === 0 ? (
            <div className="border border-black border-b-[4px] p-8 text-center">
              <p className="text-lg np-slab">
                No dispatches matched &ldquo;{q}&rdquo;. Try searching for{" "}
                <strong>Lucia</strong>, <strong>Vice City</strong>,{" "}
                <strong>Donks</strong>, or <strong>RAGE</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {results.map((art) => (
                <div key={art.slug} className="pb-7 border-b border-black">
                  <HorizontalStoryCard
                    article={art}
                    imageWidth="w-full sm:w-[230px]"
                    imageAspect="aspect-[4/3]"
                    titleSize="text-[27px]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="lg:col-span-4 space-y-8">
          <TopFiveWidget articles={top5} />
          <HouseAdBanner variant="square" />
        </aside>
      </div>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   4. PRICING PLANS VIEW (/pricing-plans — Coming Soon per User A5)
   ════════════════════════════════════════════════════════════════════ */
export function PricingPlansView() {
  const [waitlistTier, setWaitlistTier] = useState<string | null>(null);

  const tiers = [
    {
      name: "CITIZEN PASS",
      price: "$0",
      period: "Open Pre-Launch Access",
      badge: "ACTIVE NOW",
      active: true,
      perks: [
        "Unlimited access to all 48+ Leonida Vice investigative articles",
        "24/7 Synchronized Live GTA VI Broadcast Screen & Citizen Wire chat",
        "Custom garage vehicle badge & callsign via My Account",
        "Community GTA VI clip submissions to the live broadcast queue",
      ],
    },
    {
      name: "VICE INSIDER",
      price: "$3.99",
      period: "per month • Coming Soon",
      badge: "COMING SOON",
      active: false,
      perks: [
        "Ad-free broadsheet reading experience across all devices",
        "Interactive State of Leonida coordinate pin & progress tracker",
        "Priority Citizen Wire callsign flair & custom garage plates",
        "Instant email & push alerts when Rockstar drops new footage",
      ],
    },
    {
      name: "LEONIDA PRESS PASS",
      price: "$29",
      period: "per year • Coming Soon",
      badge: "COMING SOON",
      active: false,
      perks: [
        "Everything in Vice Insider plus launch-week interactive map layers",
        "CrashPad & Leonida Online economy calculators at launch",
        "Creator Sharecode spotlight submissions for custom GTA VI modes",
        "Founding Member press badge in the Live Citizen Wire",
      ],
    },
  ];

  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap max-w-3xl">
          <span className="inline-block bg-[#e04040] text-white px-3 py-1 text-xs font-bold uppercase tracking-widest np-ui mb-3">
            PRE-LAUNCH OPEN ACCESS • PAYMENTS DISABLED
          </span>
          <h1 className="np-head font-extrabold uppercase text-[54px] leading-none">
            MEMBERSHIP &amp; PRICING PLANS
          </h1>
          <p className="mt-3 text-[16px] leading-[1.6] text-black/80 np-slab">
            Every story and live broadcast on <strong>{SITE.name}</strong> is
            100% free during the countdown to November 19, 2026. Paid supporter
            perks below are in preview and marked <em>Coming Soon</em>.
          </p>
        </div>
      </section>

      <section className="np-wrap py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="border border-black border-b-[4px] p-8 flex flex-col justify-between bg-white"
            >
              <div>
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-black">
                  <h2 className="np-head font-extrabold uppercase text-[30px] leading-none">
                    {tier.name}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider np-ui ${
                      tier.active
                        ? "bg-black text-white"
                        : "bg-[#e04040] text-white"
                    }`}
                  >
                    {tier.badge}
                  </span>
                </div>

                <div className="my-6">
                  <span className="np-head font-extrabold text-[54px] leading-none">
                    {tier.price}
                  </span>
                  <div className="text-xs uppercase tracking-wider text-black/65 font-semibold mt-1 np-ui">
                    {tier.period}
                  </div>
                </div>

                <ul className="space-y-3 text-[14.5px] leading-[1.55] np-slab mb-8">
                  {tier.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <span className="text-[#e04040] font-bold">■</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {tier.active ? (
                <Link
                  href="/"
                  className="block text-center bg-black hover:bg-[#e04040] text-white py-3.5 text-xs font-bold uppercase tracking-widest transition-colors np-ui"
                >
                  INCLUDED — WATCH &amp; READ NOW
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setWaitlistTier(tier.name)}
                  className="w-full np-btn-box py-3 text-center cursor-pointer"
                >
                  {waitlistTier === tier.name
                    ? "✓ ON WAITLIST (COMING SOON)"
                    : "JOIN WAITLIST — COMING SOON"}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Waitlist Email Box */}
        <div className="mt-12 max-w-xl mx-auto border border-black border-b-[4px] p-8 text-center bg-[#fafafa]">
          <h3 className="np-head font-extrabold uppercase text-[30px]">
            GET NOTIFIED WHEN SUPPORTER TIERS LAUNCH
          </h3>
          <p className="mt-2 mb-5 text-sm text-black/80 np-slab">
            No checkout or credit card required. Drop your email for launch-week
            rollout updates.
          </p>
          <NewsletterBox />
        </div>
      </section>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   5. NEWSLETTER PAGE VIEW (/newsletter)
   ════════════════════════════════════════════════════════════════════ */
export function NewsletterPageView() {
  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-[#e04040] np-ui">
            DAILY VICE CITY &amp; LEONIDA WIRE
          </div>
          <h1 className="np-head font-extrabold uppercase text-[54px] leading-none mt-1">
            SUBSCRIBE TO NEWSLETTER
          </h1>
          <p className="mt-3 text-[16px] leading-[1.6] text-black/80 np-slab">
            Trailer frame breakdowns, verified Rockstar updates, and regional
            Leonida dossiers delivered straight to your inbox — zero spam,
            strictly GTA VI.
          </p>
        </div>
      </section>

      <section className="np-wrap py-12 max-w-2xl">
        <div className="border border-black border-b-[4px] p-8 sm:p-10 bg-white">
          <h2 className="np-head font-extrabold uppercase text-[30px] mb-2">
            JOIN THE LEONIDA VICE DISPATCH
          </h2>
          <p className="text-sm text-black/75 np-slab mb-6">
            Coming soon to automated daily delivery — sign up below to lock in
            your reader address locally.
          </p>
          <NewsletterBox />
        </div>
      </section>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   6. ABOUT PAGE VIEW (/about)
   ════════════════════════════════════════════════════════════════════ */
export function AboutPageView() {
  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap max-w-3xl">
          <h1 className="np-head font-extrabold uppercase text-[54px] leading-none">
            ABOUT {SITE.name}
          </h1>
          <p className="mt-3 text-[16px] leading-[1.6] text-black/80 np-slab">
            {SITE.tagline}
          </p>
        </div>
      </section>

      <section className="np-wrap py-12 max-w-4xl space-y-10">
        <div className="np-article">
          <h2>An Independent Broadsheet Built for the State of Leonida</h2>
          <p>
            <strong>Leonida Vice</strong> pairs an editorial broadsheet magazine
            with a live, globally synchronized community video broadcast. While
            traditional feeds bury players under clickbait and recycled
            engagement farming, our desk separates officially confirmed Rockstar
            Games disclosures from clearly labeled leaks, coordinate mapping,
            and technical analysis.
          </p>
          <p>
            Whether you are watching curated GTA VI clips together on our front
            page screen or diving into 9th-Gen RAGE ray-tracing breakdowns,
            every page is built to celebrate the artistry and satire of Grand
            Theft Auto VI ahead of its November 19, 2026 release.
          </p>

          <h2>How Our Synchronized Broadcast &amp; Verification Engine Works</h2>
          <p>
            Unlike personal video libraries with individual skip buttons, the
            centerpiece screen on <strong>Leonida Vice</strong> operates like a
            true live television broadcast. Every viewer connected across the
            globe watches the exact same frame of the exact same curated clip at
            the exact same moment while reacting together in the Live Citizen
            Wire.
          </p>
          <div className="overflow-x-auto my-6">
            <table>
              <thead>
                <tr>
                  <th>Subsystem</th>
                  <th>Engineering Implementation</th>
                  <th>Viewer Benefit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Authoritative Clock Sync</td>
                  <td>
                    NTP-style server clock offset calculation with smooth 0.95×
                    to 1.05× micro-playback rate alignment before hard-seek
                    fallback
                  </td>
                  <td>
                    Eliminates stream drift so live Citizen Wire reactions stay
                    locked to the exact frame onscreen
                  </td>
                </tr>
                <tr>
                  <td>Gapless Dual-Buffer Engine</td>
                  <td>
                    Two alternating HTML5 video layers pre-buffering upcoming
                    HLS/MP4 segments 2.0 seconds ahead of clip handoff
                  </td>
                  <td>
                    Seamless broadcast transitions without black-screen tuning
                    stalls between community clips
                  </td>
                </tr>
                <tr>
                  <td>Multi-Source Clip Curation</td>
                  <td>
                    Indexes official Rockstar drops alongside open &amp;
                    federated video archives (Internet Archive, PeerTube,
                    Medal.tv, Odysee, Dailymotion, Rumble, Coub, Streamable)
                  </td>
                  <td>
                    Surfaces rare frame-rate analyses and clean gameplay studies
                    without relying on a single walled-garden host
                  </td>
                </tr>
                <tr>
                  <td>Anti-Clickbait Verification</td>
                  <td>
                    Automated metadata &amp; visual screening filters out modded
                    GTA V clickbait masquerading as GTA VI footage
                  </td>
                  <td>
                    Keeps the broadcast queue strictly focused on authentic
                    Leonida footage and verified community breakdowns
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="np-head font-extrabold uppercase italic text-[34px] pb-3 mb-6 border-b border-black">
            MEET THE EDITORIAL DESK
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AUTHORS.map((a) => (
              <Link
                key={a.slug}
                href={`/author/${a.slug}`}
                className="border border-black border-b-[4px] p-6 block hover:bg-[#fafafa] transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center font-extrabold text-lg np-head mb-4">
                  {a.initials}
                </div>
                <h3 className="np-head font-extrabold uppercase text-[26px] leading-none">
                  {a.name}
                </h3>
                <div className="text-xs font-bold uppercase text-[#e04040] mt-1 np-ui">
                  {a.role}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-black/85 np-slab">
                  {a.bio}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   7. CONTACT & ADVERTISING PAGE VIEW (/contact)
   ════════════════════════════════════════════════════════════════════ */
export function ContactPageView() {
  const [sent, setSent] = useState(false);
  const [sender, setSender] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Story Tip / Leak Verification");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("topic") === "advertising") {
      setSubject("Advertise with Leonida Vice (980×90 / 300×250 Slots)");
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sender.trim() || !email.trim() || !msg.trim()) return;
    setSent(true);
  };

  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap max-w-3xl">
          <h1 className="np-head font-extrabold uppercase text-[54px] leading-none">
            CONTACT &amp; ADVERTISING
          </h1>
          <p className="mt-3 text-[16px] leading-[1.6] text-black/80 np-slab">
            Send a newsroom tip, inquire about 980×90 &amp; 300×250 house banner
            sponsorships, or reach the broadcast desk.
          </p>
        </div>
      </section>

      <section className="np-wrap py-12 max-w-3xl">
        <div className="border border-black border-b-[4px] p-8 bg-white">
          {sent ? (
            <div className="py-8 text-center">
              <h2 className="np-head font-extrabold uppercase text-[34px] text-[#e04040]">
                ✓ DISPATCH RECEIVED
              </h2>
              <p className="mt-2 text-base np-slab">
                Thanks, {sender}. Our Vice City desk has logged your message.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setMsg("");
                }}
                className="mt-6 np-btn-box cursor-pointer"
              >
                SEND ANOTHER MESSAGE
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Your Name / Handle:*"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  className="np-input"
                />
                <input
                  type="email"
                  required
                  placeholder="Email Address:*"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="np-input"
                />
              </div>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="np-input"
              >
                <option>Story Tip / Leak Verification</option>
                <option>Advertise with Leonida Vice (980×90 / 300×250 Slots)</option>
                <option>Live Broadcast Clip Curation</option>
                <option>General Feedback</option>
              </select>
              <textarea
                rows={6}
                required
                placeholder="Your message..."
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                className="np-input"
              />
              <button
                type="submit"
                className="bg-[#e04040] hover:bg-black text-white px-7 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer np-ui"
              >
                SEND TO NEWSROOM →
              </button>
            </form>
          )}
        </div>
      </section>
    </NewspaperShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   8. PRIVACY & FAN-SITE POLICY VIEW (/privacy-policy)
   ════════════════════════════════════════════════════════════════════ */
export function PrivacyPolicyView() {
  return (
    <NewspaperShell>
      <section className="bg-[#eeeeee] border-b border-black py-12 px-4 text-center">
        <div className="np-wrap max-w-3xl">
          <h1 className="np-head font-extrabold uppercase text-[52px] leading-none">
            PRIVACY &amp; FAN-SITE POLICY
          </h1>
        </div>
      </section>

      <section className="np-wrap py-12 max-w-3xl np-article">
        <h2>1. Independent Non-Commercial Fan Publication</h2>
        <p>
          <strong>Leonida Vice</strong> is an independent community fan site
          operated in accordance with Rockstar Games’ non-commercial fan-content
          guidelines. Grand Theft Auto, Grand Theft Auto VI, Vice City, Leonida,
          RAGE, and all official promotional screenshots remain the intellectual
          property and trademarks of Rockstar Games and Take-Two Interactive.
          This publication is neither endorsed by nor affiliated with Rockstar
          Games or Take-Two Interactive.
        </p>
        <h2>2. No Hosting of Leaked Pre-Release Assets or Spoilers</h2>
        <p>
          While our editorial articles report journalistically on publicly
          documented gaming history (including press coverage of the September
          2022 security incident), Leonida Vice strictly prohibits uploading,
          hosting, or redistributing stolen pre-release builds, leaked source
          code, raw isolated extractions of in-game television or cinema
          programming, or unmarked campaign spoilers.
        </p>
        <h2>3. Rockstar Games &amp; Take-Two Compliance Matrix</h2>
        <div className="overflow-x-auto my-6">
          <table>
            <thead>
              <tr>
                <th>Compliance Area</th>
                <th>Governing Policy / Legal Precedent</th>
                <th>Leonida Vice Enforcement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Modded Accounts &amp; RMT</td>
                <td>
                  <em>Take-Two Interactive v. PlayerAuctions</em>
                </td>
                <td>
                  Zero tolerance for modded account sales, illicit currency
                  brokerage, or unauthorized cheat promotions anywhere on the
                  site or Citizen Wire
                </td>
              </tr>
              <tr>
                <td>Game Binary &amp; Memory Integrity</td>
                <td>Take-Two EULA &amp; <em>OpenIV</em> Modding Boundaries</td>
                <td>
                  Operates strictly as an out-of-game web publication and
                  broadcast companion; never hooks, reverse-engineers, or
                  modifies game memory
                </td>
              </tr>
              <tr>
                <td>Third-Party Likeness &amp; Art</td>
                <td>
                  <em>Alexander v. Take-Two Interactive</em>
                </td>
                <td>
                  Prohibits commercializing third-party copyrighted tattoos,
                  licensed music stems, or real-world celebrity likenesses on
                  merchandise
                </td>
              </tr>
              <tr>
                <td>Video Embeds &amp; Safe Harbor</td>
                <td>DMCA Safe Harbor (17 U.S.C. § 512)</td>
                <td>
                  Prioritizes official embed players and verified open-archive
                  streams with prompt takedown compliance upon rightsholder
                  request
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h2>4. Account, Chat &amp; Data Minimization (GDPR / CCPA)</h2>
        <p>
          Optional Citizen accounts authenticate securely through Supabase using
          strict data-minimization principles. Guest callsigns, article
          comments, and newsletter signups during local testing are stored in
          your browser’s local storage and are never sold or shared with
          third-party data brokers.
        </p>
      </section>
    </NewspaperShell>
  );
}
