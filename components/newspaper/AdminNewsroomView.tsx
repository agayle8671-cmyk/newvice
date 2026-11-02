"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./paper.css";
import { useAuth } from "@/lib/auth/context";
import AuthModal from "@/components/auth/AuthModal";
import { AUTHORS, CATEGORIES, SITE, getAuthor } from "@/lib/newspaper/categories";
import {
  articleHref,
  categoryName,
  formatDate,
  refreshLiveArticles,
} from "@/lib/newspaper/content";
import {
  PRESET_CONFIGS,
  buildUniformArticleBlocks,
  computeReadMins,
  decomposeArticleForEditor,
  deriveExcerpt,
  slugifyTitle,
  type InlineImageDraft,
} from "@/lib/newspaper/auto-layout";
import type {
  Article,
  ArticlePreset,
  ArticleStatus,
  Block,
  CategorySlug,
} from "@/lib/newspaper/types";
import { CategoryPipe, CutoutCard } from "./ArticleWidgets";
import AdminBroadcastQueueTab from "./AdminBroadcastQueueTab";
import AdminAiTeamTab from "./AdminAiTeamTab";
import { getSavedForensicFrames } from "@/lib/video/xray-telemetry";

interface StorageHealth {
  localWritable: boolean;
  localArticleCount: number;
  supabaseConfigured: boolean;
  supabaseTableReady: boolean;
  supabaseArticleCount: number;
  supabaseNote?: string;
}

interface MediaAssetItem {
  url: string;
  name: string;
  folder: "uploads" | "gta" | "forensic";
}

const SUPABASE_SQL_SNIPPET = `-- Run once in Supabase SQL Editor to enable cloud article sync on Vercel:
CREATE TABLE IF NOT EXISTS public.newspaper_articles (
  slug          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT 'marco-reyes',
  date          TEXT NOT NULL,
  image         TEXT NOT NULL,
  excerpt       TEXT NOT NULL,
  read_mins     INTEGER NOT NULL DEFAULT 4,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  body          JSONB NOT NULL DEFAULT '[]'::jsonb,
  preset        TEXT NOT NULL DEFAULT 'standard-feature',
  status        TEXT NOT NULL DEFAULT 'published',
  featured_rank INTEGER,
  kicker        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newspaper_articles_status_date
  ON public.newspaper_articles (status, date DESC, updated_at DESC);

ALTER TABLE public.newspaper_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published newspaper articles"
  ON public.newspaper_articles FOR SELECT
  USING (status = 'published');`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminNewsroomView() {
  const { session, profile, setShowAuthModal } = useAuth();

  // ── Auth State ──
  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [authMethod, setAuthMethod] = useState<string | null>(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Studio Workspace State ──
  const [studioTab, setStudioTab] = useState<"compose" | "desk" | "broadcast" | "cloud" | "ai-team">("compose");
  const [broadcastClipCount, setBroadcastClipCount] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<"article" | "card">("article");
  const [editorMode, setEditorMode] = useState<"auto" | "blocks">("auto");

  // ── Articles & Storage Health ──
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [deskSearch, setDeskSearch] = useState("");
  const [deskFilter, setDeskFilter] = useState<"all" | "custom" | "published" | "draft" | "archived">("all");

  // ── Media Library Modal ──
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<
    { kind: "hero" } | { kind: "inline-new" } | { kind: "inline-edit"; id: string } | { kind: "block-img"; index: number }
  >({ kind: "hero" });
  const [mediaAssets, setMediaAssets] = useState<MediaAssetItem[]>([]);
  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaFolder, setMediaFolder] = useState<"all" | "uploads" | "forensic" | "gta">("all");
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingInline, setUploadingInline] = useState(false);
  const [scrapingPhotos, setScrapingPhotos] = useState(false);
  const [photoScrapeNotice, setPhotoScrapeNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [remoteImageUrl, setRemoteImageUrl] = useState("");
  const [importingRemoteUrl, setImportingRemoteUrl] = useState(false);

  // ── Article Form Fields ──
  const [editingOriginalSlug, setEditingOriginalSlug] = useState<string | null>(null);
  const [preset, setPreset] = useState<ArticlePreset>("standard-feature");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<CategorySlug>("story");
  const [author, setAuthor] = useState<string>("marco-reyes");
  const [date, setDate] = useState<string>("");
  const [kicker, setKicker] = useState<string>("");
  const [featuredRank, setFeaturedRank] = useState<string>("");
  const [heroImage, setHeroImage] = useState<string>("/images/gta/official_cover_art_landscape.jpg");
  const [excerpt, setExcerpt] = useState<string>("");
  const [tagsText, setTagsText] = useState<string>("Leonida, Vice City, GTA VI");

  // ── Auto-Weave Composer Inputs ──
  const [rawText, setRawText] = useState<string>("");
  const [autoGenerateSubheads, setAutoGenerateSubheads] = useState<boolean>(true);
  const [inlineImages, setInlineImages] = useState<InlineImageDraft[]>([]);
  const [pullQuote, setPullQuote] = useState<string>("");
  const [pullQuoteCite, setPullQuoteCite] = useState<string>("");
  const [specTableText, setSpecTableText] = useState<string>("");

  // Preset-Specific Quick Inputs
  const [blotterDistrict, setBlotterDistrict] = useState("Vice Beach — Ocean Drive");
  const [blotterWantedStars, setBlotterWantedStars] = useState(4);
  const [blotterSuspect, setBlotterSuspect] = useState("@LeonidaCitizen");
  const [blotterIncident, setBlotterIncident] = useState("High-Speed Pursuit & Property Damage");
  const [blotterClipSource, setBlotterClipSource] = useState("");

  const [guideLocation, setGuideLocation] = useState("");
  const [guideReward, setGuideReward] = useState("");
  const [guideRequirement, setGuideRequirement] = useState("Free Roam — Available Day 1");
  const [guideStepsText, setGuideStepsText] = useState("");

  const [briefBulletsText, setBriefBulletsText] = useState("");

  // ── Manual Block Fine-Tuner State ──
  const [manualBlocks, setManualBlocks] = useState<Block[]>([]);

  // ── Save / Status Feedback ──
  const [savingStatus, setSavingStatus] = useState<ArticleStatus | null>(null);
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    text: string;
    publishedSlug?: string;
  } | null>(null);
  const [sqlCopied, setSqlCopied] = useState(false);

  const heroFileRef = useRef<HTMLInputElement>(null);
  const inlineFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (session?.access_token) {
      h["Authorization"] = `Bearer ${session.access_token}`;
    }
    return h;
  }, [session?.access_token]);

  // ── Check Admin Session ──
  const checkAuth = useCallback(async () => {
    setAuthChecking(true);
    try {
      const res = await fetch("/api/admin/auth", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.authorized) {
        setAuthorized(true);
        setAuthMethod(data.method ?? "cookie");
      } else {
        setAuthorized(false);
      }
    } catch {
      setAuthorized(false);
    } finally {
      setAuthChecking(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    setDate((prev) => prev || todayIso());
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth, profile?.role]);

  const loadAdminDesk = useCallback(async () => {
    if (!authorized) return;
    try {
      const res = await fetch("/api/admin/articles", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok) {
        setAllArticles(data.articles ?? []);
        setHealth(data.health ?? null);
      }
    } catch {
      // ignore
    }
  }, [authorized, authHeaders]);

  const loadMediaLibrary = useCallback(async () => {
    if (!authorized) return;
    const forensicItems: MediaAssetItem[] = getSavedForensicFrames().map((f) => ({
      url: f.dataUrl,
      name: `${f.regionName} • ${f.timestampFormatted} (#${f.frameNumber})`,
      folder: "forensic" as const,
    }));
    try {
      const res = await fetch("/api/admin/media", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.assets)) {
        setMediaAssets([...forensicItems, ...data.assets]);
        return;
      }
    } catch {
      // ignore
    }
    setMediaAssets((prev) => [
      ...forensicItems,
      ...prev.filter((item) => item.folder !== "forensic"),
    ]);
  }, [authorized, authHeaders]);

  useEffect(() => {
    if (authorized && mediaOpen) {
      void loadMediaLibrary();
    }
  }, [authorized, mediaOpen, loadMediaLibrary]);

  const handleScrapeFreshPhotos = async () => {
    setScrapingPhotos(true);
    setPhotoScrapeNotice(null);
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ action: "scrape_photos", maxCount: 8 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setPhotoScrapeNotice({
          kind: "err",
          text: data?.error || "Photo scraper encountered an error.",
        });
        return;
      }
      await loadMediaLibrary();
      if (data.addedCount > 0) {
        setMediaFolder("uploads");
        setPhotoScrapeNotice({
          kind: "ok",
          text: `✓ Downloaded ${data.addedCount} fresh high-resolution GTA 6 photo(s) directly to public/images/uploads/!`,
        });
      } else {
        setPhotoScrapeNotice({
          kind: "ok",
          text: `Scanned ${data.scannedCandidates ?? 0} high-res sources — all top photos are already in your local library.`,
        });
      }
    } catch (err) {
      setPhotoScrapeNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to scrape photos.",
      });
    } finally {
      setScrapingPhotos(false);
    }
  };

  const handleImportRemoteImageUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteImageUrl.trim()) return;
    setImportingRemoteUrl(true);
    setPhotoScrapeNotice(null);
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          action: "import_url",
          imageUrl: remoteImageUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setPhotoScrapeNotice({
          kind: "err",
          text: data?.error || "Could not download image from URL.",
        });
        return;
      }
      setRemoteImageUrl("");
      await loadMediaLibrary();
      setMediaFolder("uploads");
      setPhotoScrapeNotice({
        kind: "ok",
        text: `✓ Saved high-res image to public/images/uploads/${data.added?.[0]?.name || ""}!`,
      });
    } catch (err) {
      setPhotoScrapeNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to import image URL.",
      });
    } finally {
      setImportingRemoteUrl(false);
    }
  };

  useEffect(() => {
    if (authorized) {
      loadAdminDesk();
      loadMediaLibrary();
    }
  }, [authorized, loadAdminDesk, loadMediaLibrary]);

  // Auto-update slug when title changes unless user manually edited slug or is editing an existing post
  useEffect(() => {
    if (!slugTouched && !editingOriginalSlug) {
      setSlug(slugifyTitle(title));
    }
  }, [title, slugTouched, editingOriginalSlug]);

  // ── Handle Preset Selection ──
  const handleSelectPreset = (nextPreset: ArticlePreset) => {
    setPreset(nextPreset);
    const cfg = PRESET_CONFIGS[nextPreset];
    if (!editingOriginalSlug) {
      setCategory(cfg.defaultCategory);
      setKicker(cfg.defaultKicker);
    }
    setEditorMode("auto");
  };

  // ── Load a 1-Click Sample Template so the user can see exact auto-formatting immediately ──
  const handleLoadSample = () => {
    setEditorMode("auto");
    if (preset === "police-blotter") {
      setTitle("Four-Star Airboat Chase Tears Through Grassrivers Marina at Dawn");
      setCategory("leonida");
      setKicker("LEONIDA POLICE BLOTTER • GRASSRIVERS");
      setHeroImage("/images/gta/grassrivers_01.jpg");
      setTagsText("Police Blotter, Grassrivers, Airboat, VCPD, Leonida");
      setBlotterDistrict("Grassrivers — Gator Keys Channel");
      setBlotterWantedStars(4);
      setBlotterSuspect("@SwampThrottle305");
      setBlotterIncident("Grand Theft Watercraft & Reckless Evasion");
      setBlotterClipSource("Leonida Live Broadcast Feed");
      setRawText(`Deputies patrolling the northern reed beds of the Grassrivers were forced to abandon cruiser pursuit early Sunday after a suspect hijacked a twin-propeller tour airboat and blasted straight across three mangrove sandbars.

## Mangrove Shortcuts & Helicopter Searchlights
Witness footage submitted to the Citizen Wire shows a Leonida Sheriff aviation unit struggling to hold spotlight lock through low coastal fog while wake turbulence scattered sunbathers along the dock.

Authorities eventually lost visual contact south of Kelly County after the suspect cut engine power and drifted silently into submerged cypress cover.`);
      setInlineImages([
        {
          id: "sample_1",
          src: "/images/gta/grassrivers_03.jpg",
          caption: "Wetland patrol units cordoned off adjoining Grassrivers causeway ramps during the search.",
        },
        {
          id: "sample_2",
          src: "/images/gta/leonida_keys_02.jpg",
          caption: "Marine interdiction patrols expanded southward toward the Leonida Keys channel markers.",
        },
      ]);
      setPullQuote("Never bring a standard patrol cruiser to a fan-boat fight in three inches of swamp water.");
      setPullQuoteCite("Leonida Vice Crime Desk");
    } else if (preset === "utility-guide") {
      setTitle("Port Gellhorn Contraband Dock: Fast Early-Game Cash & Boat Stash Guide");
      setCategory("vehicles-weapons");
      setKicker("VERIFIED FIELD GUIDE");
      setHeroImage("/images/gta/port_gellhorn_01.jpg");
      setTagsText("Field Guide, Port Gellhorn, Money Guide, Boats, Leonida");
      setGuideLocation("Port Gellhorn — Pier 7 Industrial Slip");
      setGuideReward("High-Speed Smuggler Rib + $18,500 Stash");
      setGuideRequirement("Night Window (22:00 – 04:00 In-Game)");
      setGuideStepsText(`Approach Pier 7 from the northern warehouse alley without drawing patrol attention
Cut power at the rusted junction box behind Container Stack B to disable dock floodlights
Secure the lockbox inside the dry-dock office before boarding the fueled speedboat
Exit west into open Gulf water to clear the harbor radius cleanly`);
      setRawText(`Players looking to bankroll upgrades without grinding low-tier street jobs can hit Port Gellhorn’s derelict shipping slips as soon as free roam opens across western Leonida.

## Navigating Patrol Sightlines on Pier 7
Unlike Vice Beach’s heavily monitored marinas, Port Gellhorn relies on private dock security with predictable two-minute patrol loops and blind spots behind stacked cargo containers.

Once you clear the outer seawall, keep throttle steady along the unlit coastline rather than cutting back toward main highway bridges where helicopters respond fastest.`);
      setInlineImages([
        {
          id: "sample_u1",
          src: "/images/gta/port_gellhorn_03.jpg",
          caption: "Approach via the industrial perimeter road for a fast land getaway backup.",
        },
        {
          id: "sample_u2",
          src: "/images/gta/ultimate_edition_squalo_01.jpg",
          caption: "Open Gulf channels west of Port Gellhorn give high-speed Squalo hulls clean escape lines.",
        },
      ]);
      setPullQuote("Stash a secondary getaway bike outside the chain-link gate in case harbor patrol blocks the slipway.");
      setPullQuoteCite("Leonida Vice Field Guide Pro-Tip");
    } else if (preset === "breaking-brief") {
      setTitle("Rockstar Updates Official Leonida Portal With High-Bitrate District Stills");
      setCategory("trailers-media");
      setKicker("BREAKING NEWS WIRE");
      setHeroImage("/images/gta/vice_city_01.jpg");
      setTagsText("Breaking, Rockstar Games, Vice City, Screenshots");
      setBriefBulletsText(`Uncompressed 4K captures highlight denser Ocean Drive neon reflections
Updated county descriptions confirm six distinct regional ecosystems
All captures remain verified on base PlayStation 5 hardware`);
      setRawText(`A quiet asset refresh across Rockstar’s official Grand Theft Auto VI portal delivered cleaner, higher-bitrate captures of Vice City’s coastal skyline and surrounding counties this morning.

## Cleaner Compression Exposes New Street-Level Signage
Side-by-side inspection reveals sharper storefront typography along Ocean Drive, legible bumper stickers on stalled traffic, and clearer volumetric cloud layering over the bay.`);
      setInlineImages([
        {
          id: "sample_b1",
          src: "/images/gta/vice_city_04.jpg",
          caption: "Refreshed nighttime captures show crisp ray-traced neon bounce across parked classics.",
        },
      ]);
      setPullQuote("");
    } else {
      setTitle("Ocean Drive After Midnight: How Vice City’s Neon Strip Transforms Hour by Hour");
      setCategory("leonida");
      setKicker("");
      setHeroImage("/images/gta/vice_city_04.jpg");
      setTagsText("Vice City, Ocean Drive, World Design, RAGE, Leonida");
      setRawText(`Long after sunbathers pack up their umbrellas along Vice Beach, Ocean Drive shifts into a completely different simulation loop powered by dynamic crowd schedules, cruising lowriders, and club promoters spilling across Art Deco sidewalks.

## Dynamic Crowd Schedules & Street Culture
Unlike older open worlds where nighttime simply dimmed the skybox and halved pedestrian density, Leonida swaps daytime tourists for nightlife crowds, valet queues, and cruising custom coupes with trunk audio echoing down the block.

## Ray-Traced Neon Across Wet Asphalt
Passing coastal squalls leave irregular puddles across the boulevard that mirror hotel signage in real time, turning every intersection into a postcard straight out of modern South Florida.

## How Law Enforcement Response Escalates on the Strip
Starting trouble in front of packed beachfront hotels triggers rapid VCPD cruiser convergence within seconds, forcing smart crews to plan alley cut-throughs toward the bay bridges before drawing heat.`);
      setInlineImages([
        {
          id: "sample_s1",
          src: "/images/gta/vice_city_02.jpg",
          caption: "By daylight, the same Art Deco blocks bustle with rollerbladers, cafés, and beachgoers.",
        },
        {
          id: "sample_s2",
          src: "/images/gta/ultimate_edition_rideout_customs_01.jpg",
          caption: "Custom car meets take over coastal lots once the neon signs flicker on.",
        },
      ]);
      setPullQuote("Vice Beach doesn’t go to sleep at midnight — it just changes its wardrobe and turns up the bass.");
      setPullQuoteCite("Marco Reyes, Editor-in-Chief");
      setSpecTableText(`Time Window | Dominant Street Activity | VCPD Patrol Density
08:00 – 18:00 | Beachgoers, joggers, delivery vans | Moderate bicycle & cruiser patrol
19:00 – 02:00 | Club queues, cruising classics, nightlife | High intersection presence
02:30 – 06:00 | Street racers, late-night diners, fog | Rapid highway interceptor response`);
    }
  };

  // ── Live Auto-Generated Blocks ──
  const autoBlocks = useMemo(
    () =>
      buildUniformArticleBlocks({
        preset,
        title,
        rawText,
        inlineImages,
        autoGenerateSubheads,
        pullQuote,
        pullQuoteCite,
        specTableText,
        blotterDistrict,
        blotterWantedStars,
        blotterSuspect,
        blotterIncident,
        blotterClipSource,
        guideLocation,
        guideReward,
        guideRequirement,
        guideStepsText,
        briefBulletsText,
      }),
    [
      preset,
      title,
      rawText,
      inlineImages,
      autoGenerateSubheads,
      pullQuote,
      pullQuoteCite,
      specTableText,
      blotterDistrict,
      blotterWantedStars,
      blotterSuspect,
      blotterIncident,
      blotterClipSource,
      guideLocation,
      guideReward,
      guideRequirement,
      guideStepsText,
      briefBulletsText,
    ]
  );

  const activeBlocks = editorMode === "blocks" ? manualBlocks : autoBlocks;

  const computedExcerpt = useMemo(
    () =>
      excerpt.trim()
        ? excerpt.trim()
        : deriveExcerpt(activeBlocks, title || "Leonida Vice Dispatch"),
    [excerpt, activeBlocks, title]
  );

  const computedReadMins = useMemo(
    () => computeReadMins(activeBlocks, computedExcerpt),
    [activeBlocks, computedExcerpt]
  );

  const parsedTags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText]
  );

  const previewArticle: Article = useMemo(
    () => ({
      slug: slug || slugifyTitle(title) || "preview-dispatch",
      title: title.trim() || "Your Broadsheet Headline Appears Here",
      category,
      author,
      date: date || "2026-11-01",
      image: heroImage || "/images/gta/official_cover_art_landscape.jpg",
      excerpt: computedExcerpt,
      readMins: computedReadMins,
      tags: parsedTags.length > 0 ? parsedTags : ["Leonida", "GTA VI"],
      body:
        activeBlocks.length > 0
          ? activeBlocks
          : [
              {
                type: "p",
                text: "Start typing or paste your story in the composer on the left. Your paragraphs, H2 section headings, and inline scroll images will render here in real time using the exact Urban Observer PRO broadsheet layout.",
              },
            ],
      preset,
      kicker: kicker.trim() || undefined,
      featuredRank: featuredRank ? Number(featuredRank) : undefined,
    }),
    [
      slug,
      title,
      category,
      author,
      date,
      heroImage,
      computedExcerpt,
      computedReadMins,
      parsedTags,
      activeBlocks,
      preset,
      kicker,
      featuredRank,
    ]
  );

  // ── Reset Form for New Story ──
  const resetComposer = () => {
    setEditingOriginalSlug(null);
    setPreset("standard-feature");
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setCategory("story");
    setAuthor("marco-reyes");
    setDate(todayIso());
    setKicker("");
    setFeaturedRank("");
    setHeroImage("/images/gta/official_cover_art_landscape.jpg");
    setExcerpt("");
    setTagsText("Leonida, Vice City, GTA VI");
    setRawText("");
    setInlineImages([]);
    setPullQuote("");
    setPullQuoteCite("");
    setSpecTableText("");
    setGuideStepsText("");
    setBriefBulletsText("");
    setManualBlocks([]);
    setEditorMode("auto");
    setBanner(null);
  };

  // ── Load Existing Article Into Editor ──
  const handleEditArticle = (art: Article) => {
    setEditingOriginalSlug(art.slug);
    setPreset(art.preset ?? "standard-feature");
    setTitle(art.title);
    setSlug(art.slug);
    setSlugTouched(true);
    setCategory(art.category);
    setAuthor(art.author);
    setDate(art.date);
    setKicker(art.kicker ?? "");
    setFeaturedRank(art.featuredRank ? String(art.featuredRank) : "");
    setHeroImage(art.image);
    setExcerpt(art.excerpt);
    setTagsText(art.tags.join(", "));
    setPullQuote("");
    setPullQuoteCite("");
    setSpecTableText("");
    setGuideStepsText("");
    setBriefBulletsText("");

    const decomposed = decomposeArticleForEditor(art);
    setRawText(decomposed.rawText);
    setInlineImages(decomposed.inlineImages);
    // Open directly in Fine-Tune Block mode so existing block order is preserved 1:1, with 1-click access to Auto-Weave!
    setManualBlocks(art.body);
    setEditorMode("blocks");
    setBanner(null);
    setStudioTab("compose");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Upload Image Helper ──
  const uploadSingleFile = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Image upload failed");
    }
    return data.url as string;
  };

  const handleHeroFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    setBanner(null);
    try {
      const url = await uploadSingleFile(file);
      if (url) {
        setHeroImage(url);
        loadMediaLibrary();
      }
    } catch (err: unknown) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Hero image upload failed.",
      });
    } finally {
      setUploadingHero(false);
      e.target.value = "";
    }
  };

  const handleInlineFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadingInline(true);
    setBanner(null);
    try {
      const uploadedDrafts: InlineImageDraft[] = [];
      for (const file of files) {
        const url = await uploadSingleFile(file);
        if (url) {
          uploadedDrafts.push({
            id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            src: url,
            caption: "",
          });
        }
      }
      if (uploadedDrafts.length > 0) {
        if (editorMode === "blocks") {
          setManualBlocks((prev) => [
            ...prev,
            ...uploadedDrafts.map((d) => ({
              type: "img" as const,
              src: d.src,
              caption: undefined,
            })),
          ]);
        } else {
          setInlineImages((prev) => [...prev, ...uploadedDrafts]);
        }
        loadMediaLibrary();
      }
    } catch (err: unknown) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Inline image upload failed.",
      });
    } finally {
      setUploadingInline(false);
      e.target.value = "";
    }
  };

  // ── Media Picker Selection ──
  const handleSelectMediaAsset = (url: string) => {
    if (mediaTarget.kind === "hero") {
      setHeroImage(url);
      setMediaOpen(false);
    } else if (mediaTarget.kind === "inline-new") {
      // Allow multi-picking scroll images without closing the modal after every single click
      setInlineImages((prev) => {
        const exists = prev.some((it) => it.src === url);
        if (exists) {
          return prev.filter((it) => it.src !== url);
        }
        return [
          ...prev,
          {
            id: `lib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            src: url,
            caption: "",
          },
        ];
      });
    } else if (mediaTarget.kind === "inline-edit") {
      setInlineImages((prev) =>
        prev.map((img) => (img.id === mediaTarget.id ? { ...img, src: url } : img))
      );
      setMediaOpen(false);
    } else if (mediaTarget.kind === "block-img") {
      setManualBlocks((prev) =>
        prev.map((b, idx) =>
          idx === mediaTarget.index && b.type === "img" ? { ...b, src: url } : b
        )
      );
      setMediaOpen(false);
    }
  };

  // ── Save / Publish Handler ──
  const handleSaveArticle = async (targetStatus: ArticleStatus) => {
    setBanner(null);
    if (title.trim().length < 4) {
      setBanner({
        kind: "err",
        text: "Please enter an article headline (at least 4 characters).",
      });
      return;
    }
    if (activeBlocks.length === 0) {
      setBanner({
        kind: "err",
        text: "Please add story text or at least one content block before saving.",
      });
      return;
    }

    setSavingStatus(targetStatus);
    try {
      const finalSlug = slug.trim() ? slugifyTitle(slug) : slugifyTitle(title);
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          slug: finalSlug,
          title: title.trim(),
          category,
          author,
          date: date || todayIso(),
          image: heroImage.trim() || "/images/gta/official_cover_art_landscape.jpg",
          excerpt: computedExcerpt,
          readMins: computedReadMins,
          tags: parsedTags.length > 0 ? parsedTags : ["Leonida", "GTA VI"],
          body: activeBlocks,
          preset,
          status: targetStatus,
          featuredRank: featuredRank ? Number(featuredRank) : null,
          kicker: kicker.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save article.");
      }

      setEditingOriginalSlug(data.article.slug);
      setSlug(data.article.slug);
      await Promise.all([loadAdminDesk(), refreshLiveArticles(true)]);

      const syncSummary = [
        data.savedLocal ? "Local Store ✓" : null,
        data.savedSupabase ? "Supabase Cloud ✓" : null,
      ]
        .filter(Boolean)
        .join(" • ");

      setBanner({
        kind: "ok",
        text:
          targetStatus === "published"
            ? `Published live! "${data.article.title}" (${syncSummary || "Saved"})`
            : `Draft saved! "${data.article.title}" (${syncSummary || "Saved"})`,
        publishedSlug: targetStatus === "published" ? data.article.slug : undefined,
      });
    } catch (err: unknown) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not save article.",
      });
    } finally {
      setSavingStatus(null);
    }
  };

  // ── Desk Actions (Delete / Archive / Restore) ──
  const handleDeskAction = async (
    art: Article,
    action: "delete" | "archive" | "restore"
  ) => {
    if (
      action === "delete" &&
      !window.confirm(
        art.source === "builtin"
          ? `Archive built-in article "${art.title}" so it is hidden from public pages?`
          : `Permanently delete "${art.title}"?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/articles?slug=${encodeURIComponent(art.slug)}&action=${action}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );
      if (res.ok) {
        await Promise.all([loadAdminDesk(), refreshLiveArticles(true)]);
      }
    } catch {
      // ignore
    }
  };

  // ── 1-Click Approve & Publish Draft Live ──
  const handleQuickPublishDraft = async (art: Article) => {
    try {
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          ...art,
          status: "published",
        }),
      });
      if (res.ok) {
        await Promise.all([loadAdminDesk(), refreshLiveArticles(true)]);
        setBanner({
          kind: "ok",
          text: `✓ Published live to Front Page! "${art.title}"`,
          publishedSlug: art.slug,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setBanner({ kind: "err", text: data.error || "Could not publish draft." });
      }
    } catch (err: unknown) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not publish draft.",
      });
    }
  };

  // ── Passcode Login Submit ──
  const handlePasscodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (!res.ok || !data?.authorized) {
        setAuthError(data?.error || "Invalid passcode.");
        return;
      }
      setPasscodeInput("");
      setAuthorized(true);
      setAuthMethod("cookie");
    } catch {
      setAuthError("Could not verify passcode.");
    }
  };

  const handleLogoutAdmin = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthorized(false);
  };

  // ── Filtered Desk List ──
  const filteredDeskArticles = useMemo(() => {
    const q = deskSearch.trim().toLowerCase();
    return allArticles.filter((a) => {
      const st = a.status ?? "published";
      if (deskFilter === "custom" && a.source !== "custom") return false;
      if (deskFilter === "published" && st !== "published") return false;
      if (deskFilter === "draft" && st !== "draft") return false;
      if (deskFilter === "archived" && st !== "archived") return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allArticles, deskSearch, deskFilter]);

  const filteredMedia = useMemo(() => {
    const q = mediaQuery.trim().toLowerCase();
    return mediaAssets.filter((m) => {
      if (mediaFolder !== "all" && m.folder !== mediaFolder) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q);
    });
  }, [mediaAssets, mediaQuery, mediaFolder]);

  // ── Manual Block Helpers ──
  const switchToManualBlocks = () => {
    setManualBlocks(autoBlocks);
    setEditorMode("blocks");
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    setManualBlocks((prev) => {
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const removeBlock = (idx: number) => {
    setManualBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const insertBlockAfter = (idx: number, type: Block["type"]) => {
    const blank: Block =
      type === "h2"
        ? { type: "h2", text: "New Section Heading" }
        : type === "img"
        ? { type: "img", src: "/images/gta/vice_city_01.jpg", caption: "Photo caption" }
        : type === "quote"
        ? { type: "quote", text: "Key pull-quote or desk verdict.", cite: "Leonida Vice Desk" }
        : type === "list"
        ? { type: "list", items: ["First verified detail", "Second verified detail"] }
        : type === "table"
        ? { type: "table", head: ["Field", "Detail"], rows: [["Location", "Vice City"]] }
        : { type: "p", text: "New paragraph copy..." };

    setManualBlocks((prev) => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, blank);
      return copy;
    });
  };

  const previewAuthor = getAuthor(previewArticle.author);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LOADING / AUTH GATE SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (authChecking) {
    return (
      <div className="np-root min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e04040] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold uppercase tracking-widest np-ui">
            Opening Leonida Vice Newsroom Studio...
          </p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="np-root min-h-screen bg-[#f4f4f4] flex flex-col">
        <AuthModal />
        <div className="border-b border-black bg-white py-4">
          <div className="np-wrap flex items-center justify-between">
            <Link href="/" className="np-logo text-[36px]">
              {SITE.name}
            </Link>
            <Link
              href="/"
              className="text-xs font-bold uppercase tracking-wider hover:text-[#e04040] np-ui"
            >
              ← Return to Front Page
            </Link>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-black border-b-[4px] shadow-xl">
            <div className="h-1.5 bg-[#e04040]" />
            <div className="p-7">
              <span className="inline-block bg-[#e04040] text-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest np-ui mb-2">
                EDITORIAL DESK ACCESS
              </span>
              <h1 className="np-head font-extrabold uppercase text-[34px] leading-none">
                NEWSROOM STUDIO LOGIN
              </h1>
              <p className="mt-2 text-xs text-black/75 np-slab leading-relaxed">
                Unlock the uniform broadsheet publisher with your{" "}
                <strong>Admin Passcode</strong> (configured in{" "}
                <code>.env.local</code>) or a signed-in Supabase{" "}
                <code>admin</code> account.
              </p>

              <form onSubmit={handlePasscodeLogin} className="mt-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Newsroom Passcode
                  </label>
                  <input
                    type="password"
                    autoFocus
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="Enter ADMIN_PASSCODE..."
                    className="np-input"
                  />
                </div>

                {authError && (
                  <div className="text-xs font-semibold text-[#e04040] bg-[#e04040]/10 border border-[#e04040] px-3 py-2 np-ui">
                    ⚠ {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer np-ui"
                >
                  UNLOCK NEWSROOM STUDIO →
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-black/15 text-center">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="text-xs font-bold uppercase tracking-wider text-black/75 hover:text-[#e04040] cursor-pointer np-ui"
                >
                  Or Sign In With Supabase Admin Account →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. UNLOCKED NEWSROOM STUDIO WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="np-root min-h-screen bg-[#f5f5f5]">
      <AuthModal />

      {/* ── TOP STUDIO HEADER RIBBON ── */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-black shadow-sm">
        <div className="max-w-[1640px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" className="np-logo text-[30px] sm:text-[36px]">
              {SITE.name}
            </Link>
            <span className="bg-black text-white px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest np-ui">
              NEWSROOM STUDIO
            </span>

            {/* Hybrid Storage Health Pills */}
            {health && (
              <div className="hidden xl:flex items-center gap-2 text-[11px] font-bold np-ui">
                <span
                  className={`px-2 py-0.5 border ${
                    health.localWritable
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-black/30 bg-[#f4f4f4] text-black/70"
                  }`}
                >
                  ● LOCAL JSON ({health.localArticleCount} custom)
                </span>
                <button
                  type="button"
                  onClick={() => setStudioTab("cloud")}
                  className={`px-2 py-0.5 border cursor-pointer ${
                    health.supabaseTableReady
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  }`}
                  title={
                    health.supabaseTableReady
                      ? "Supabase cloud table synced"
                      : "Click for 1-step Supabase SQL setup for Vercel deploys"
                  }
                >
                  ● SUPABASE{" "}
                  {health.supabaseTableReady
                    ? `SYNCED (${health.supabaseArticleCount})`
                    : "SETUP SQL"}
                </button>
              </div>
            )}
          </div>

          {/* Studio Navigation Tabs + Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setStudioTab("compose")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border border-black cursor-pointer transition-colors np-ui ${
                studioTab === "compose"
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-white text-black hover:bg-black hover:text-white"
              }`}
            >
              ⚡ Composer
            </button>
            <button
              type="button"
              onClick={() => setStudioTab("desk")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border border-black cursor-pointer transition-colors np-ui ${
                studioTab === "desk"
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-white text-black hover:bg-black hover:text-white"
              }`}
            >
              📚 Article Desk ({allArticles.length})
            </button>
            <button
              type="button"
              onClick={() => setStudioTab("broadcast")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border border-black cursor-pointer transition-colors np-ui ${
                studioTab === "broadcast"
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-white text-black hover:bg-black hover:text-white"
              }`}
            >
              📺 Broadcast &amp; Scraper
              {broadcastClipCount !== null ? ` (${broadcastClipCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setStudioTab("cloud")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-black cursor-pointer transition-colors np-ui ${
                studioTab === "cloud"
                  ? "bg-[#e04040] text-white border-[#e04040]"
                  : "bg-white text-black hover:bg-black hover:text-white"
              }`}
            >
              ☁️ Cloud Sync
            </button>
            <button
              type="button"
              onClick={() => setStudioTab("ai-team")}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border border-black cursor-pointer transition-colors np-ui ${
                studioTab === "ai-team"
                  ? "bg-[#831843] text-white border-[#831843]"
                  : "bg-white text-black hover:bg-[#831843] hover:text-white"
              }`}
            >
              ⚡ Consensus Room
            </button>
            <Link
              href="/admin/consensus"
              target="_blank"
              title="Open dedicated full-page Consensus Room"
              className="px-2 py-1.5 text-[11px] font-mono text-[#831843] hover:text-black hover:bg-[#831843]/10 border border-dashed border-[#831843]/60 rounded transition-colors hidden md:inline-flex items-center gap-1"
            >
              <span>Page ↗</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                resetComposer();
                setStudioTab("compose");
              }}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-[#e04040] transition-colors cursor-pointer np-ui"
            >
              + New Story
            </button>

            <Link
              href="/"
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-black bg-white hover:bg-[#f4f4f4] np-ui"
            >
              Front Page ↗
            </Link>

            {authMethod === "cookie" && (
              <button
                type="button"
                onClick={handleLogoutAdmin}
                className="text-[11px] font-bold uppercase text-black/55 hover:text-[#e04040] cursor-pointer np-ui ml-1"
                title="Lock Newsroom Studio"
              >
                Lock
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── STATUS BANNER ── */}
      {banner && (
        <div
          className={`border-b border-black px-4 py-3 ${
            banner.kind === "ok"
              ? "bg-emerald-50 text-emerald-950"
              : "bg-[#e04040]/10 text-[#b01c1c]"
          }`}
        >
          <div className="max-w-[1640px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-bold np-ui">
            <span>
              {banner.kind === "ok" ? "✓ " : "⚠ "}
              {banner.text}
            </span>
            <div className="flex items-center gap-3">
              {banner.publishedSlug && (
                <>
                  <Link
                    href={`/article/${banner.publishedSlug}`}
                    target="_blank"
                    className="bg-black text-white px-3 py-1 uppercase tracking-wider hover:bg-[#e04040] transition-colors"
                  >
                    View Published Article ↗
                  </Link>
                  <Link
                    href="/"
                    target="_blank"
                    className="border border-black bg-white text-black px-3 py-1 uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
                  >
                    Open Front Page ↗
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-black/60 hover:text-black cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: SPLIT-SCREEN UNIFORM COMPOSER + LIVE BROADSHEET PREVIEW
      ═══════════════════════════════════════════════════════════════════════ */}
      {studioTab === "compose" && (
        <div className="max-w-[1640px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* ── LEFT 6 COLUMNS: COMPOSER FORM ── */}
          <div className="lg:col-span-6 space-y-6">
            {/* 1. PRESET SELECTOR */}
            <section className="bg-white border border-black border-b-[4px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-black">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    STEP 1 • UNIFORM LAYOUT ENGINE
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[26px] leading-none">
                    {editingOriginalSlug
                      ? `EDITING: ${editingOriginalSlug}`
                      : "CHOOSE ARTICLE FORMAT PRESET"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 border border-black hover:bg-black hover:text-white transition-colors cursor-pointer np-ui"
                >
                  ✨ Fill Sample {PRESET_CONFIGS[preset].badge}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(PRESET_CONFIGS) as ArticlePreset[]).map((key) => {
                  const cfg = PRESET_CONFIGS[key];
                  const active = preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectPreset(key)}
                      className={`text-left p-3.5 border transition-all cursor-pointer ${
                        active
                          ? "border-black border-b-[3px] bg-[#fdf2f2]"
                          : "border-black/25 bg-white hover:border-black"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="np-head font-extrabold uppercase text-[20px] leading-none">
                          {cfg.label}
                        </span>
                        <span
                          className={`text-[9.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 np-ui ${
                            active
                              ? "bg-[#e04040] text-white"
                              : "bg-black/10 text-black"
                          }`}
                        >
                          {cfg.badge}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-black/75 leading-snug np-ui">
                        {cfg.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. HEADLINE, BYLINE, CATEGORY & PINNING */}
            <section className="bg-white border border-black border-b-[4px] p-5 space-y-4">
              <div className="pb-2.5 border-b border-black">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                  STEP 2 • MASTHEAD &amp; PLACEMENT
                </span>
                <h2 className="np-head font-extrabold uppercase text-[24px] leading-none">
                  HEADLINE, CATEGORY &amp; BYLINE
                </h2>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                  Broadsheet Headline *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Four-Star Airboat Chase Tears Through Grassrivers Marina at Dawn"
                  className="np-input font-semibold text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Section / Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategorySlug)}
                    className="np-input bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.parent ? `↳ ${c.name} (${categoryName(c.parent)})` : c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Author Byline *
                  </label>
                  <select
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="np-input bg-white"
                  >
                    {AUTHORS.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.name} — {a.role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Publish Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="np-input"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Crimson Eyebrow Kicker
                  </label>
                  <input
                    type="text"
                    value={kicker}
                    onChange={(e) => setKicker(e.target.value)}
                    placeholder="Optional (e.g. POLICE BLOTTER)"
                    className="np-input"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Pin to Top 5 Sidebar
                  </label>
                  <select
                    value={featuredRank}
                    onChange={(e) => setFeaturedRank(e.target.value)}
                    className="np-input bg-white"
                  >
                    <option value="">Normal (Newest First)</option>
                    <option value="1">Pin #1 in Top 5</option>
                    <option value="2">Pin #2 in Top 5</option>
                    <option value="3">Pin #3 in Top 5</option>
                    <option value="4">Pin #4 in Top 5</option>
                    <option value="5">Pin #5 in Top 5</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    URL Slug (/article/...)
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugifyTitle(e.target.value));
                    }}
                    placeholder="auto-generated-from-headline"
                    className="np-input text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                    Topic Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="Vice Beach, Police Blotter, Vehicles"
                    className="np-input text-xs"
                  />
                </div>
              </div>
            </section>

            {/* 3. HERO LEAD PHOTO & EXCERPT */}
            <section className="bg-white border border-black border-b-[4px] p-5 space-y-4">
              <div className="pb-2.5 border-b border-black flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    STEP 3 • ABOVE-THE-FOLD VISUAL
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[24px] leading-none">
                    HERO IMAGE &amp; LEAD DECK
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={heroFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleHeroFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingHero}
                    onClick={() => heroFileRef.current?.click()}
                    className="px-3 py-1.5 bg-[#e04040] hover:bg-black text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                  >
                    {uploadingHero ? "Uploading..." : "⬆ Upload Photo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaTarget({ kind: "hero" });
                      setMediaOpen(true);
                    }}
                    className="px-3 py-1.5 border border-black bg-white hover:bg-black hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                  >
                    🖼 Media Library ({mediaAssets.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-full sm:w-44 aspect-[16/10] border border-black/25 bg-[#eee] overflow-hidden shrink-0">
                  {heroImage && (
                    <img
                      src={heroImage}
                      alt="Hero preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 w-full space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                      Hero Image Path or URL
                    </label>
                    <input
                      type="text"
                      value={heroImage}
                      onChange={(e) => setHeroImage(e.target.value)}
                      placeholder="/images/uploads/... or https://..."
                      className="np-input text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                      Lead Excerpt Deck{" "}
                      <span className="font-normal text-black/55">
                        (leave blank to auto-extract from opening paragraph)
                      </span>
                    </label>
                    <textarea
                      rows={2}
                      value={excerpt}
                      onChange={(e) => setExcerpt(e.target.value)}
                      placeholder={computedExcerpt}
                      className="np-input text-xs resize-y"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 4. PRESET-SPECIFIC STRUCTURED MODULE (POLICE BLOTTER / UTILITY / BREAKING) */}
            {preset === "police-blotter" && editorMode === "auto" && (
              <section className="bg-[#fff9f9] border border-black border-b-[4px] p-5 space-y-3.5">
                <div className="pb-2 border-b border-black">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    PRESET MODULE • AUTO-BUILDS INCIDENT DOSSIER TABLE
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[23px] leading-none">
                    🚨 LEONIDA PD BLOTTER DETAILS
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      District / Sector
                    </label>
                    <input
                      type="text"
                      value={blotterDistrict}
                      onChange={(e) => setBlotterDistrict(e.target.value)}
                      placeholder="Vice Beach — Ocean Drive"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Wanted Level (1–6 Stars)
                    </label>
                    <select
                      value={blotterWantedStars}
                      onChange={(e) => setBlotterWantedStars(Number(e.target.value))}
                      className="np-input bg-white text-xs"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {"★".repeat(n) + "☆".repeat(6 - n)} ({n}-Star Response)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Suspect / Clip Creator Handle
                    </label>
                    <input
                      type="text"
                      value={blotterSuspect}
                      onChange={(e) => setBlotterSuspect(e.target.value)}
                      placeholder="@ViceDriver305"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Charges / Incident Type
                    </label>
                    <input
                      type="text"
                      value={blotterIncident}
                      onChange={(e) => setBlotterIncident(e.target.value)}
                      placeholder="High-Speed Airboat Evasion"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                    Broadcast / Clip Source Credit (Optional)
                  </label>
                  <input
                    type="text"
                    value={blotterClipSource}
                    onChange={(e) => setBlotterClipSource(e.target.value)}
                    placeholder="Aired on Leonida Vice Live Broadcast / Medal.tv clip"
                    className="np-input bg-white text-xs"
                  />
                </div>
              </section>
            )}

            {preset === "utility-guide" && editorMode === "auto" && (
              <section className="bg-[#f8fafc] border border-black border-b-[4px] p-5 space-y-3.5">
                <div className="pb-2 border-b border-black">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    PRESET MODULE • AUTO-BUILDS SPECS BOX &amp; CHECKLIST
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[23px] leading-none">
                    🗺️ FIELD GUIDE QUICK SPECS &amp; STEPS
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Map Location / Sector
                    </label>
                    <input
                      type="text"
                      value={guideLocation}
                      onChange={(e) => setGuideLocation(e.target.value)}
                      placeholder="Port Gellhorn — Pier 7"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Reward / Payout / Item
                    </label>
                    <input
                      type="text"
                      value={guideReward}
                      onChange={(e) => setGuideReward(e.target.value)}
                      placeholder="Smuggler Speedboat + $18.5K"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                      Requirement / Window
                    </label>
                    <input
                      type="text"
                      value={guideRequirement}
                      onChange={(e) => setGuideRequirement(e.target.value)}
                      placeholder="Free Roam • Night Window"
                      className="np-input bg-white text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 np-ui">
                    Step-by-Step Checklist (one step per line)
                  </label>
                  <textarea
                    rows={3}
                    value={guideStepsText}
                    onChange={(e) => setGuideStepsText(e.target.value)}
                    placeholder={`Approach Pier 7 from the northern alley\nCut floodlight power at Junction Box B\nExit west into open Gulf water`}
                    className="np-input bg-white text-xs resize-y"
                  />
                </div>
              </section>
            )}

            {preset === "breaking-brief" && editorMode === "auto" && (
              <section className="bg-[#fffbeb] border border-black border-b-[4px] p-5 space-y-3">
                <div className="pb-2 border-b border-black">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    PRESET MODULE • RAPID WIRE SUMMARY
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[23px] leading-none">
                    ⚡ KEY DEVELOPMENTS BULLETS
                  </h2>
                </div>
                <textarea
                  rows={3}
                  value={briefBulletsText}
                  onChange={(e) => setBriefBulletsText(e.target.value)}
                  placeholder={`One key confirmed takeaway per line...\nSecond confirmed detail...\nThird takeaway...`}
                  className="np-input bg-white text-xs resize-y"
                />
              </section>
            )}

            {/* 5. STORY COPY + INLINE SCROLL IMAGES TRAY (OR BLOCK FINE-TUNER) */}
            <section className="bg-white border border-black border-b-[4px] p-5 space-y-5">
              <div className="pb-3 border-b border-black flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                    STEP 4 • BODY &amp; IN-SCROLL PHOTOGRAPHY
                  </span>
                  <h2 className="np-head font-extrabold uppercase text-[24px] leading-none">
                    {editorMode === "auto"
                      ? "STORY COPY & AUTO-WOVEN SCROLL IMAGES"
                      : `FINE-TUNE INDIVIDUAL BLOCKS (${manualBlocks.length})`}
                  </h2>
                </div>

                {editorMode === "auto" ? (
                  <button
                    type="button"
                    onClick={switchToManualBlocks}
                    className="px-3 py-1 border border-black bg-[#f4f4f4] hover:bg-black hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                  >
                    🧱 Fine-Tune Exact Block Order ({autoBlocks.length}) →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditorMode("auto")}
                    className="px-3 py-1 border border-black bg-[#fdf2f2] text-[#e04040] hover:bg-[#e04040] hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                  >
                    ↺ Switch Back to Auto-Weave Composer
                  </button>
                )}
              </div>

              {editorMode === "auto" ? (
                <>
                  {/* Main Story Paste Area */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider np-ui">
                        Article Story Copy *
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-black/75 cursor-pointer np-ui">
                        <input
                          type="checkbox"
                          checked={autoGenerateSubheads}
                          onChange={(e) => setAutoGenerateSubheads(e.target.checked)}
                          className="accent-[#e04040]"
                        />
                        <span>Auto-add uniform H2 subheads if plain text has none</span>
                      </label>
                    </div>
                    <textarea
                      rows={11}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={PRESET_CONFIGS[preset].bodyPlaceholder}
                      className="np-input text-[14px] leading-relaxed resize-y"
                      style={{ fontFamily: "var(--f-slab)" }}
                    />
                    <p className="mt-1 text-[11px] text-black/55 np-ui">
                      Tip: Separate paragraphs with a blank line. Optional cues:{" "}
                      <code>## Heading</code> for subheads, <code>- item</code>{" "}
                      for bullet lists, <code>&gt; quote</code> for pull-quotes.
                    </p>
                  </div>

                  {/* INLINE SCROLL IMAGES TRAY */}
                  <div className="border-t border-black pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <h3 className="np-head font-extrabold uppercase text-[21px] leading-none">
                          IMAGES THROUGHOUT THE SCROLL ({inlineImages.length})
                        </h3>
                        <p className="text-[11.5px] text-black/65 np-ui mt-0.5">
                          Every image added here is automatically woven evenly between sections with uniform broadsheet captions.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          ref={inlineFileRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleInlineFilesUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingInline}
                          onClick={() => inlineFileRef.current?.click()}
                          className="px-3 py-1.5 bg-[#e04040] hover:bg-black text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                        >
                          {uploadingInline ? "Uploading..." : "⬆ Upload Scroll Image(s)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMediaTarget({ kind: "inline-new" });
                            setMediaOpen(true);
                          }}
                          className="px-3 py-1.5 border border-black bg-white hover:bg-black hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                        >
                          + From Media Library
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setInlineImages((prev) => [
                              ...prev,
                              {
                                id: `url_${Date.now()}`,
                                src: "",
                                caption: "",
                              },
                            ])
                          }
                          className="px-2.5 py-1.5 border border-black/40 bg-white hover:border-black text-[11px] font-bold uppercase tracking-wider cursor-pointer np-ui"
                        >
                          + Paste URL
                        </button>
                      </div>
                    </div>

                    {inlineImages.length === 0 ? (
                      <div className="border border-dashed border-black/35 bg-[#fafafa] p-5 text-center text-xs text-black/65 np-ui">
                        No inline scroll photos added yet. Upload 1–4 screenshots or pick from the Media Library and they will automatically space themselves down the article as the reader scrolls.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {inlineImages.map((img, idx) => (
                          <div
                            key={img.id}
                            className="border border-black/25 bg-[#fafafa] p-3 flex flex-col sm:flex-row gap-3 items-start"
                          >
                            <div className="w-full sm:w-32 aspect-[16/10] bg-[#e5e5e5] border border-black/20 overflow-hidden shrink-0 relative">
                              {img.src ? (
                                <img
                                  src={img.src}
                                  alt={`Scroll ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-black/40 np-ui">
                                  NO IMAGE
                                </div>
                              )}
                              <span className="absolute top-1 left-1 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 np-ui">
                                #{idx + 1}
                              </span>
                            </div>

                            <div className="flex-1 w-full space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={img.src}
                                  onChange={(e) =>
                                    setInlineImages((prev) =>
                                      prev.map((it) =>
                                        it.id === img.id
                                          ? { ...it, src: e.target.value }
                                          : it
                                      )
                                    )
                                  }
                                  placeholder="Image path or https:// URL..."
                                  className="np-input bg-white text-xs font-mono py-1.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMediaTarget({
                                      kind: "inline-edit",
                                      id: img.id,
                                    });
                                    setMediaOpen(true);
                                  }}
                                  className="px-2.5 border border-black bg-white hover:bg-black hover:text-white text-[10.5px] font-bold uppercase shrink-0 cursor-pointer np-ui"
                                >
                                  Pick
                                </button>
                              </div>
                              <input
                                type="text"
                                value={img.caption}
                                onChange={(e) =>
                                  setInlineImages((prev) =>
                                    prev.map((it) =>
                                      it.id === img.id
                                        ? { ...it, caption: e.target.value }
                                        : it
                                    )
                                  )
                                }
                                placeholder="Editorial photo caption (appears in italics beneath image)..."
                                className="np-input bg-white text-xs py-1.5"
                              />
                            </div>

                            <div className="flex sm:flex-col gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  setInlineImages((prev) => {
                                    const copy = [...prev];
                                    const [it] = copy.splice(idx, 1);
                                    copy.splice(idx - 1, 0, it);
                                    return copy;
                                  })
                                }
                                className="px-2 py-1 border border-black/30 bg-white hover:border-black text-xs font-bold disabled:opacity-30 cursor-pointer"
                                title="Move earlier in scroll"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={idx === inlineImages.length - 1}
                                onClick={() =>
                                  setInlineImages((prev) => {
                                    const copy = [...prev];
                                    const [it] = copy.splice(idx, 1);
                                    copy.splice(idx + 1, 0, it);
                                    return copy;
                                  })
                                }
                                className="px-2 py-1 border border-black/30 bg-white hover:border-black text-xs font-bold disabled:opacity-30 cursor-pointer"
                                title="Move later in scroll"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setInlineImages((prev) =>
                                    prev.filter((it) => it.id !== img.id)
                                  )
                                }
                                className="px-2 py-1 border border-black/30 bg-white hover:bg-[#e04040] hover:text-white text-xs font-bold cursor-pointer"
                                title="Remove image"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* OPTIONAL PULL-QUOTE & DATA TABLE */}
                  <div className="border-t border-black pt-4 grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                          {preset === "police-blotter"
                            ? "Crime Desk Verdict / Roast Pull-Quote (Optional)"
                            : preset === "utility-guide"
                            ? "Highlighted Field Pro-Tip Callout (Optional)"
                            : "Broadsheet Pull-Quote Callout (Optional)"}
                        </label>
                        <input
                          type="text"
                          value={pullQuote}
                          onChange={(e) => setPullQuote(e.target.value)}
                          placeholder="Highlighted crimson-bordered callout quote inside the article..."
                          className="np-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                          Quote Attribution
                        </label>
                        <input
                          type="text"
                          value={pullQuoteCite}
                          onChange={(e) => setPullQuoteCite(e.target.value)}
                          placeholder="Leonida Vice Editorial Desk"
                          className="np-input text-xs"
                        />
                      </div>
                    </div>

                    {preset === "standard-feature" && (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 np-ui">
                          Optional Data / Comparison Table{" "}
                          <span className="font-normal text-black/55">
                            (use <code>|</code> between columns, first row = headers)
                          </span>
                        </label>
                        <textarea
                          rows={3}
                          value={specTableText}
                          onChange={(e) => setSpecTableText(e.target.value)}
                          placeholder={`Category | Confirmed Detail | Notes\nSetting | State of Leonida | Vice City, Keys, Grassrivers & more`}
                          className="np-input text-xs font-mono resize-y"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ── MANUAL BLOCK FINE-TUNER VIEW ── */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-black/15">
                    <span className="text-[11px] font-bold uppercase mr-2 np-ui">
                      Append Block:
                    </span>
                    {(["p", "h2", "img", "quote", "list", "table"] as Block["type"][]).map(
                      (t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => insertBlockAfter(manualBlocks.length - 1, t)}
                          className="px-2.5 py-1 border border-black bg-white hover:bg-black hover:text-white text-[10.5px] font-bold uppercase cursor-pointer np-ui"
                        >
                          + {t.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>

                  {manualBlocks.map((blk, idx) => (
                    <div
                      key={idx}
                      className="border border-black/30 bg-[#fafafa] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="bg-black text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest np-ui">
                          #{idx + 1} • {blk.type.toUpperCase()}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveBlock(idx, -1)}
                            className="px-2 py-0.5 border border-black/30 bg-white text-xs font-bold disabled:opacity-30 cursor-pointer"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={idx === manualBlocks.length - 1}
                            onClick={() => moveBlock(idx, 1)}
                            className="px-2 py-0.5 border border-black/30 bg-white text-xs font-bold disabled:opacity-30 cursor-pointer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => insertBlockAfter(idx, "img")}
                            className="px-2 py-0.5 border border-black/30 bg-white hover:bg-black hover:text-white text-[10px] font-bold uppercase cursor-pointer np-ui"
                            title="Insert image below this block"
                          >
                            + IMG Below
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(idx)}
                            className="px-2 py-0.5 border border-black/30 bg-white hover:bg-[#e04040] hover:text-white text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {blk.type === "h2" && (
                        <input
                          type="text"
                          value={blk.text}
                          onChange={(e) =>
                            setManualBlocks((prev) =>
                              prev.map((b, i) =>
                                i === idx ? { type: "h2", text: e.target.value } : b
                              )
                            )
                          }
                          className="np-input bg-white font-bold text-sm"
                        />
                      )}

                      {blk.type === "p" && (
                        <textarea
                          rows={3}
                          value={blk.text}
                          onChange={(e) =>
                            setManualBlocks((prev) =>
                              prev.map((b, i) =>
                                i === idx ? { type: "p", text: e.target.value } : b
                              )
                            )
                          }
                          className="np-input bg-white text-xs resize-y"
                        />
                      )}

                      {blk.type === "img" && (
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                          <img
                            src={blk.src}
                            alt=""
                            className="w-28 aspect-[16/10] object-cover border border-black/20 shrink-0"
                          />
                          <div className="flex-1 w-full space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={blk.src}
                                onChange={(e) =>
                                  setManualBlocks((prev) =>
                                    prev.map((b, i) =>
                                      i === idx && b.type === "img"
                                        ? { ...b, src: e.target.value }
                                        : b
                                    )
                                  )
                                }
                                className="np-input bg-white text-xs font-mono py-1.5"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setMediaTarget({ kind: "block-img", index: idx });
                                  setMediaOpen(true);
                                }}
                                className="px-2.5 border border-black bg-white hover:bg-black hover:text-white text-[10.5px] font-bold uppercase cursor-pointer np-ui"
                              >
                                Pick
                              </button>
                            </div>
                            <input
                              type="text"
                              value={blk.caption ?? ""}
                              onChange={(e) =>
                                setManualBlocks((prev) =>
                                  prev.map((b, i) =>
                                    i === idx && b.type === "img"
                                      ? { ...b, caption: e.target.value }
                                      : b
                                  )
                                )
                              }
                              placeholder="Caption..."
                              className="np-input bg-white text-xs py-1.5"
                            />
                          </div>
                        </div>
                      )}

                      {blk.type === "quote" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={blk.text}
                            onChange={(e) =>
                              setManualBlocks((prev) =>
                                prev.map((b, i) =>
                                  i === idx && b.type === "quote"
                                    ? { ...b, text: e.target.value }
                                    : b
                                )
                              )
                            }
                            placeholder="Quote text..."
                            className="np-input bg-white text-xs sm:col-span-2"
                          />
                          <input
                            type="text"
                            value={blk.cite ?? ""}
                            onChange={(e) =>
                              setManualBlocks((prev) =>
                                prev.map((b, i) =>
                                  i === idx && b.type === "quote"
                                    ? { ...b, cite: e.target.value }
                                    : b
                                )
                              )
                            }
                            placeholder="Citation..."
                            className="np-input bg-white text-xs"
                          />
                        </div>
                      )}

                      {blk.type === "list" && (
                        <textarea
                          rows={3}
                          value={blk.items.join("\n")}
                          onChange={(e) =>
                            setManualBlocks((prev) =>
                              prev.map((b, i) =>
                                i === idx
                                  ? {
                                      type: "list",
                                      items: e.target.value
                                        .split("\n")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : b
                              )
                            )
                          }
                          className="np-input bg-white text-xs resize-y"
                        />
                      )}

                      {blk.type === "table" && (
                        <textarea
                          rows={4}
                          value={[
                            blk.head.join(" | "),
                            ...blk.rows.map((r) => r.join(" | ")),
                          ].join("\n")}
                          onChange={(e) => {
                            const lines = e.target.value
                              .split("\n")
                              .filter((l) => l.trim().length > 0);
                            if (lines.length >= 1) {
                              const head = lines[0].split("|").map((c) => c.trim());
                              const rows = lines
                                .slice(1)
                                .map((l) => l.split("|").map((c) => c.trim()));
                              setManualBlocks((prev) =>
                                prev.map((b, i) =>
                                  i === idx
                                    ? {
                                        type: "table",
                                        head,
                                        rows: rows.length > 0 ? rows : [head.map(() => "—")],
                                      }
                                    : b
                                )
                              );
                            }
                          }}
                          className="np-input bg-white text-xs font-mono resize-y"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* PUBLISH ACTION BAR */}
              <div className="pt-4 border-t-2 border-black flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-black/70 np-ui">
                  <strong>{activeBlocks.length}</strong> blocks •{" "}
                  <strong>
                    {activeBlocks.filter((b) => b.type === "img").length + 1}
                  </strong>{" "}
                  total photos • <strong>{computedReadMins} min.</strong> read
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingStatus !== null}
                    onClick={() => handleSaveArticle("draft")}
                    className="px-4 py-3 border border-black bg-white hover:bg-[#f4f4f4] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer np-ui"
                  >
                    {savingStatus === "draft" ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    disabled={savingStatus !== null}
                    onClick={() => handleSaveArticle("published")}
                    className="px-6 py-3 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer np-ui"
                  >
                    {savingStatus === "published"
                      ? "Publishing..."
                      : editingOriginalSlug
                      ? "Update Published Story →"
                      : "Publish Live Now →"}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ── RIGHT 6 COLUMNS: REAL-TIME BROADSHEET PREVIEW ── */}
          <div className="lg:col-span-6 lg:sticky lg:top-[68px]">
            <div className="bg-white border border-black border-b-[4px]">
              <div className="px-5 py-3 bg-black text-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="np-live-dot" />
                  <span className="text-xs font-bold uppercase tracking-widest np-ui">
                    LIVE URBAN OBSERVER PRO PREVIEW
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("article")}
                    className={`px-2.5 py-1 text-[10.5px] font-bold uppercase cursor-pointer np-ui ${
                      previewMode === "article"
                        ? "bg-[#e04040] text-white"
                        : "bg-white/15 text-white hover:bg-white/25"
                    }`}
                  >
                    Full Article Scroll
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("card")}
                    className={`px-2.5 py-1 text-[10.5px] font-bold uppercase cursor-pointer np-ui ${
                      previewMode === "card"
                        ? "bg-[#e04040] text-white"
                        : "bg-white/15 text-white hover:bg-white/25"
                    }`}
                  >
                    Front-Page Card
                  </button>
                </div>
              </div>

              {previewMode === "card" ? (
                <div className="p-8 bg-[#f9f9f9]">
                  <div className="max-w-md mx-auto bg-white p-5 border border-black/15">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] mb-3 np-ui">
                      FRONT-PAGE HERO CUTOUT CARD PREVIEW
                    </div>
                    <CutoutCard
                      article={previewArticle}
                      aspect="aspect-[4/3]"
                      titleSize="text-[28px]"
                      showExcerpt
                      showDate
                    />
                  </div>
                </div>
              ) : (
                <div className="p-6 sm:p-8 max-h-[calc(100vh-140px)] overflow-y-auto bg-white">
                  {previewArticle.kicker && (
                    <div className="mb-2.5">
                      <span className="inline-block bg-[#e04040] text-white px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-widest np-ui">
                        {previewArticle.kicker}
                      </span>
                    </div>
                  )}

                  <h1 className="np-head font-extrabold text-black leading-[1.06] text-[34px] sm:text-[42px]">
                    {previewArticle.title}
                  </h1>

                  <div className="mt-3">
                    <CategoryPipe slug={previewArticle.category} size={15} />
                  </div>

                  <div className="mt-4 pb-4 flex items-center gap-2.5 flex-wrap text-xs np-ui border-b border-black/15">
                    <span className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center font-bold text-[11px]">
                      {previewAuthor.initials}
                    </span>
                    <span>
                      <span className="text-black/65">AUTHOR: </span>
                      <strong>{previewAuthor.name}</strong>
                    </span>
                    <span className="text-black/35">|</span>
                    <span>{formatDate(previewArticle.date)}</span>
                    <span className="text-black/35">|</span>
                    <span>{previewArticle.readMins} min. read</span>
                  </div>

                  {/* Hero Image */}
                  <div className="mt-5 mb-6 border border-black/15 overflow-hidden">
                    <img
                      src={previewArticle.image}
                      alt={previewArticle.title}
                      className="w-full max-h-[380px] object-cover"
                    />
                  </div>

                  {/* Lead Excerpt */}
                  <p className="text-[17px] leading-[1.6] font-medium text-black mb-6 pb-5 border-b border-black/20 np-slab">
                    {previewArticle.excerpt}
                  </p>

                  {/* Uniform Broadsheet Body */}
                  <div className="np-article">
                    {previewArticle.body.map((block, i) => {
                      if (block.type === "h2") return <h2 key={i}>{block.text}</h2>;
                      if (block.type === "p") return <p key={i}>{block.text}</p>;
                      if (block.type === "img") {
                        return (
                          <figure key={i}>
                            <img
                              src={block.src}
                              alt={block.caption || previewArticle.title}
                              className="w-full max-h-[400px] object-cover border border-black/15"
                            />
                            {block.caption && (
                              <figcaption>{block.caption}</figcaption>
                            )}
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
                          <div key={i} className="overflow-x-auto my-5">
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

                  {/* Tags */}
                  <div className="mt-8 pt-5 border-t border-black flex flex-wrap items-center gap-1.5">
                    <span className="bg-black text-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui">
                      TAGS
                    </span>
                    {previewArticle.tags.map((t) => (
                      <span
                        key={t}
                        className="border border-black px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider np-ui"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: ARTICLE DESK (MANAGE ALL BUILT-IN + CUSTOM POSTS)
      ═══════════════════════════════════════════════════════════════════════ */}
      {studioTab === "desk" && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white border border-black border-b-[4px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-5 border-b border-black">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                  EDITORIAL ARCHIVE &amp; LAUNCH CONTENT CONTROL
                </span>
                <h1 className="np-head font-extrabold uppercase text-[34px] leading-none">
                  ALL NEWSPAPER DISPATCHES ({filteredDeskArticles.length})
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["custom", "Custom / Edited"],
                    ["published", "Published"],
                    ["draft", "Drafts"],
                    ["archived", "Archived / Hidden"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDeskFilter(id)}
                    className={`px-3 py-1.5 text-xs font-bold uppercase border border-black cursor-pointer np-ui ${
                      deskFilter === id
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-[#f4f4f4]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <input
                type="text"
                value={deskSearch}
                onChange={(e) => setDeskSearch(e.target.value)}
                placeholder="Filter by headline, slug, category, or tag..."
                className="np-input"
              />
            </div>

            <div className="divide-y divide-black/15">
              {filteredDeskArticles.map((art) => {
                const st = art.status ?? "published";
                return (
                  <div
                    key={art.slug}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <img
                        src={art.image}
                        alt=""
                        className="w-24 h-16 object-cover border border-black/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 np-ui ${
                              st === "published"
                                ? "bg-emerald-700 text-white"
                                : st === "draft"
                                ? "bg-amber-600 text-white"
                                : "bg-black/40 text-white"
                            }`}
                          >
                            {st}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 border np-ui ${
                              art.source === "custom"
                                ? "border-[#e04040] text-[#e04040]"
                                : "border-black/30 text-black/65"
                            }`}
                          >
                            {art.source === "custom" ? "ADMIN CUSTOM" : "BUILT-IN"}
                          </span>
                          {art.featuredRank && (
                            <span className="bg-black text-white text-[10px] font-bold uppercase px-2 py-0.5 np-ui">
                              ★ TOP 5 PIN #{art.featuredRank}
                            </span>
                          )}
                          <span className="text-xs font-bold uppercase text-[#e04040] np-head">
                            | {categoryName(art.category)} |
                          </span>
                          <span className="text-xs text-black/55 np-ui">
                            {art.date} • {art.body.filter((b) => b.type === "img").length + 1} imgs
                          </span>
                        </div>

                        <h3 className="np-head font-bold text-[22px] leading-tight truncate">
                          {art.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {st === "draft" && (
                        <button
                          type="button"
                          onClick={() => handleQuickPublishDraft(art)}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold uppercase transition-colors cursor-pointer np-ui flex items-center gap-1 shadow-sm"
                          title="Instantly publish this draft live to the front page without editing"
                        >
                          ✓ 1-Click Publish
                        </button>
                      )}
                      {st === "published" && (
                        <Link
                          href={articleHref(art)}
                          target="_blank"
                          className="px-3 py-1.5 border border-black text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors np-ui"
                        >
                          View ↗
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditArticle(art)}
                        className="px-3 py-1.5 bg-black text-white hover:bg-[#e04040] text-xs font-bold uppercase transition-colors cursor-pointer np-ui"
                      >
                        Edit
                      </button>
                      {st === "archived" ? (
                        <button
                          type="button"
                          onClick={() => handleDeskAction(art, "restore")}
                          className="px-3 py-1.5 border border-emerald-700 text-emerald-800 hover:bg-emerald-700 hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer np-ui"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeskAction(art, "archive")}
                          className="px-3 py-1.5 border border-black/40 text-black/75 hover:border-black hover:text-black text-xs font-bold uppercase transition-colors cursor-pointer np-ui"
                        >
                          Archive
                        </button>
                      )}
                      {art.source === "custom" && (
                        <button
                          type="button"
                          onClick={() => handleDeskAction(art, "delete")}
                          className="px-3 py-1.5 border border-[#e04040] text-[#e04040] hover:bg-[#e04040] hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer np-ui"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2.5: LIVE BROADCAST QUEUE & 20-PLATFORM SCRAPER COMMAND DECK
      ═══════════════════════════════════════════════════════════════════════ */}
      {studioTab === "broadcast" && (
        <AdminBroadcastQueueTab
          authHeaders={authHeaders}
          onCatalogCountChange={setBroadcastClipCount}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: HYBRID STORAGE & SUPABASE CLOUD SQL
      ═══════════════════════════════════════════════════════════════════════ */}
      {studioTab === "cloud" && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white border border-black border-b-[4px] p-7 space-y-5">
            <div className="pb-4 border-b border-black">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#e04040] np-ui block">
                HYBRID STORAGE ENGINE (LOCAL + VERCEL PRODUCTION)
              </span>
              <h1 className="np-head font-extrabold uppercase text-[34px] leading-none">
                STORAGE &amp; SUPABASE CLOUD SYNC
              </h1>
            </div>

            {health && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-black p-4 bg-[#fafafa]">
                  <div className="text-xs font-bold uppercase tracking-wider np-ui">
                    1. Local Disk Store (Immediate)
                  </div>
                  <div className="mt-1 text-lg font-extrabold np-head uppercase text-emerald-800">
                    {health.localWritable
                      ? `✓ ACTIVE (${health.localArticleCount} Custom Posts Saved)`
                      : "Read-Only Serverless Runtime"}
                  </div>
                  <p className="mt-1 text-xs text-black/70 np-slab">
                    Articles save directly to <code>data/newspaper-store.json</code> and uploaded photos save to <code>public/images/uploads/</code>.
                  </p>
                </div>

                <div className="border border-black p-4 bg-[#fafafa]">
                  <div className="text-xs font-bold uppercase tracking-wider np-ui">
                    2. Supabase Cloud Store (For Vercel Live Deploys)
                  </div>
                  <div
                    className={`mt-1 text-lg font-extrabold np-head uppercase ${
                      health.supabaseTableReady ? "text-emerald-800" : "text-amber-700"
                    }`}
                  >
                    {health.supabaseTableReady
                      ? `✓ CONNECTED & SYNCING (${health.supabaseArticleCount} Rows)`
                      : "Table Not Initialized Yet (Run SQL Below Once)"}
                  </div>
                  <p className="mt-1 text-xs text-black/70 np-slab">
                    Uploaded images automatically create and sync to the public{" "}
                    <code>article-images</code> Supabase Storage bucket.
                  </p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider np-ui">
                  One-Time Supabase SQL Migration (<code>supabase/newspaper_articles.sql</code>)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(SUPABASE_SQL_SNIPPET);
                    setSqlCopied(true);
                    setTimeout(() => setSqlCopied(false), 2200);
                  }}
                  className="px-3 py-1 bg-black hover:bg-[#e04040] text-white text-xs font-bold uppercase tracking-wider cursor-pointer np-ui"
                >
                  {sqlCopied ? "✓ Copied SQL" : "Copy SQL"}
                </button>
              </div>
              <pre className="bg-[#111] text-white p-4 text-xs overflow-x-auto font-mono leading-relaxed">
                {SUPABASE_SQL_SNIPPET}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 5: AI EDITORIAL TEAM WAR ROOM (GROQ LPU)
      ═══════════════════════════════════════════════════════════════════════ */}
      {studioTab === "ai-team" && (
        <AdminAiTeamTab
          authHeaders={authHeaders}
          onLoadDraftIntoComposer={(draftTitle, bodyMarkdown) => {
            setTitle(draftTitle);
            setRawText(bodyMarkdown);
            setEditorMode("auto");
            setStudioTab("compose");
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VISUAL MEDIA LIBRARY PICKER MODAL (UPLOADS + 150+ GTA ASSETS)
      ═══════════════════════════════════════════════════════════════════════ */}
      {mediaOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
          onClick={() => setMediaOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl h-[86vh] bg-white border border-black border-b-[4px] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="h-1.5 bg-[#e04040] shrink-0" />
            <div className="px-6 py-4 border-b border-black flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="np-head font-extrabold uppercase text-[28px] leading-none">
                  LEONIDA VICE PHOTO &amp; UPLOAD LIBRARY ({filteredMedia.length})
                </h3>
                <p className="text-xs text-black/65 np-ui mt-0.5">
                  {mediaTarget.kind === "inline-new"
                    ? "Click as many photos as you want to add/remove them from your article scroll, then click DONE."
                    : "Click any image to place it directly into your article."}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                {mediaTarget.kind === "inline-new" && (
                  <button
                    type="button"
                    onClick={() => setMediaOpen(false)}
                    className="px-4 py-1.5 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-wider cursor-pointer np-ui"
                  >
                    DONE ({inlineImages.length} IN SCROLL) →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMediaOpen(false)}
                  className="text-lg font-bold text-black/60 hover:text-[#e04040] cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-6 py-3 bg-[#f4f4f4] border-b border-black/20 space-y-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      ["all", "All Photos"],
                      ["uploads", "My Uploads & Scraped"],
                      ["forensic", "🔬 Forensic Captures"],
                      ["gta", "GTA VI Archive"],
                    ] as const
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setMediaFolder(f)}
                      className={`px-3 py-1 text-xs font-bold uppercase border border-black cursor-pointer np-ui ${
                        mediaFolder === f
                          ? "bg-black text-white"
                          : "bg-white text-black hover:bg-black/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      mediaTarget.kind === "hero"
                        ? heroFileRef.current?.click()
                        : inlineFileRef.current?.click()
                    }
                    className="px-3 py-1 text-xs font-bold uppercase bg-[#e04040] hover:bg-black text-white cursor-pointer np-ui ml-1"
                  >
                    ⬆ Upload From PC
                  </button>
                  <button
                    type="button"
                    disabled={scrapingPhotos}
                    onClick={handleScrapeFreshPhotos}
                    className="px-3 py-1 text-xs font-bold uppercase bg-black hover:bg-[#e04040] disabled:opacity-50 text-white cursor-pointer np-ui flex items-center gap-1.5"
                    title="Automatically scrape & download fresh high-resolution (≥1080p) GTA 6 stills from r/GTA6 & Archive.org into your local library"
                  >
                    <span>{scrapingPhotos ? "⏳" : "🔄"}</span>
                    <span>
                      {scrapingPhotos
                        ? "Scraping Hi-Res Stills..."
                        : "Scrape Fresh Hi-Res Photos"}
                    </span>
                  </button>
                </div>
                <input
                  type="text"
                  value={mediaQuery}
                  onChange={(e) => setMediaQuery(e.target.value)}
                  placeholder="Search filename (e.g. lucia, vice_city, squalo, grassrivers)..."
                  className="np-input bg-white max-w-xs text-xs py-1.5"
                />
              </div>

              {/* Direct Remote Image URL Downloader Row */}
              <form
                onSubmit={handleImportRemoteImageUrl}
                className="flex flex-wrap items-center gap-2 pt-1 border-t border-black/10"
              >
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-black/75 np-ui">
                  ⬇ Save Image URL to Local Library:
                </span>
                <input
                  type="url"
                  value={remoteImageUrl}
                  onChange={(e) => setRemoteImageUrl(e.target.value)}
                  placeholder="Paste any direct .jpg / .png / .webp URL (Rockstar CDN, GTABase, i.redd.it)..."
                  className="np-input bg-white flex-1 min-w-[240px] text-xs py-1 px-2.5"
                />
                <button
                  type="submit"
                  disabled={importingRemoteUrl || !remoteImageUrl.trim()}
                  className="px-3 py-1 bg-black hover:bg-[#e04040] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer np-ui"
                >
                  {importingRemoteUrl ? "Downloading..." : "+ Download to Library"}
                </button>
              </form>

              {photoScrapeNotice && (
                <div
                  className={`px-3 py-1.5 text-xs font-bold border flex items-center justify-between gap-2 np-ui ${
                    photoScrapeNotice.kind === "ok"
                      ? "bg-emerald-50 border-emerald-700 text-emerald-950"
                      : "bg-red-50 border-[#e04040] text-[#b01c1c]"
                  }`}
                >
                  <span>{photoScrapeNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setPhotoScrapeNotice(null)}
                    className="text-xs font-extrabold cursor-pointer px-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Dedicated scrollable wrapper (flex-1 min-h-0) separate from CSS Grid so rows never collapse */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-white">
              {filteredMedia.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <p className="text-sm font-bold uppercase tracking-wider text-black/65 np-ui">
                    {mediaFolder === "uploads"
                      ? "No custom uploaded photos yet."
                      : `No images matched "${mediaQuery}".`}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      mediaTarget.kind === "hero"
                        ? heroFileRef.current?.click()
                        : inlineFileRef.current?.click()
                    }
                    className="px-4 py-2 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-wider cursor-pointer np-ui"
                  >
                    ⬆ Upload Photo From Your Computer
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredMedia.map((asset) => {
                    const isSelected =
                      mediaTarget.kind === "hero"
                        ? heroImage === asset.url
                        : mediaTarget.kind === "inline-new"
                        ? inlineImages.some((it) => it.src === asset.url)
                        : false;

                    return (
                      <button
                        key={asset.url}
                        type="button"
                        onClick={() => handleSelectMediaAsset(asset.url)}
                        className={`group block w-full text-left border-2 bg-white cursor-pointer transition-all ${
                          isSelected
                            ? "border-[#e04040] ring-2 ring-[#e04040]/30"
                            : "border-black/20 hover:border-black"
                        }`}
                      >
                        <div className="relative w-full h-32 sm:h-36 bg-[#eee] overflow-hidden">
                          <img
                            src={asset.url}
                            alt={asset.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          {isSelected && (
                            <span className="absolute top-1.5 right-1.5 bg-[#e04040] text-white text-[10px] font-bold uppercase px-2 py-0.5 shadow np-ui">
                              ✓ SELECTED
                            </span>
                          )}
                        </div>
                        <div className="p-2.5 border-t border-black/10">
                          <div className="text-[10px] font-bold uppercase text-[#e04040] np-ui">
                            {asset.folder === "forensic"
                              ? "🔬 FORENSIC LOUPE CAPTURE"
                              : asset.folder === "uploads"
                              ? "MY UPLOAD"
                              : "GTA VI ARCHIVE"}
                          </div>
                          <div className="text-[11px] font-mono truncate text-black/85 mt-0.5">
                            {asset.name}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
