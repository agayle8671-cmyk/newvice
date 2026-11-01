import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface MediaAssetItem {
  url: string;
  name: string;
  folder: "uploads" | "gta";
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif)$/i;
const SUPABASE_BUCKET = "article-images";

function slugifyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

async function scanPublicSubdir(
  folder: "uploads" | "gta"
): Promise<MediaAssetItem[]> {
  try {
    const dir = path.join(process.cwd(), "public", "images", folder);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && IMAGE_EXT_RE.test(e.name))
      .map((e) => e.name);

    // Newest uploads first; alphabetical for stock archives
    if (folder === "uploads") {
      files.sort((a, b) => b.localeCompare(a));
    } else {
      files.sort((a, b) => a.localeCompare(b));
    }

    return files.map((name) => ({
      url: `/images/${folder}/${name}`,
      name,
      folder,
    }));
  } catch {
    return [];
  }
}

async function scanSupabaseBucketUploads(): Promise<MediaAssetItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("articles", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((item) => item.name && IMAGE_EXT_RE.test(item.name))
      .map((item) => {
        const { data: pub } = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(`articles/${item.name}`);
        return {
          url: pub.publicUrl,
          name: item.name,
          folder: "uploads" as const,
        };
      });
  } catch {
    return [];
  }
}

async function getAllMediaAssets(): Promise<MediaAssetItem[]> {
  const [localUploads, cloudUploads, gta] = await Promise.all([
    scanPublicSubdir("uploads"),
    scanSupabaseBucketUploads(),
    scanPublicSubdir("gta"),
  ]);

  const seenNames = new Set<string>();
  const mergedUploads: MediaAssetItem[] = [];

  for (const item of [...localUploads, ...cloudUploads]) {
    if (seenNames.has(item.name)) continue;
    seenNames.add(item.name);
    mergedUploads.push(item);
  }

  return [...mergedUploads, ...gta];
}

interface CandidatePhoto {
  imageUrl: string;
  title: string;
  source: string;
  width?: number;
  height?: number;
}

/**
 * Fetch high-resolution (width >= 1080) GTA 6 photography candidates from Reddit r/GTA6
 */
async function discoverRedditHiResPhotos(): Promise<CandidatePhoto[]> {
  const candidates: CandidatePhoto[] = [];
  const endpoints = [
    "https://www.reddit.com/r/GTA6/top.json?t=month&limit=50",
    "https://www.reddit.com/r/GTA6/hot.json?limit=50",
    "https://www.reddit.com/r/GTA6/top.json?t=year&limit=50",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent": "LeonidaViceNewsroom/2.0 (Editorial Photo Archiver)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const children = json?.data?.children;
      if (!Array.isArray(children)) continue;

      for (const child of children) {
        const d = child?.data;
        if (!d || d.over_18) continue;

        const flair = String(d.link_flair_text || "").toLowerCase();
        if (flair.includes("meme") || flair.includes("humor") || flair.includes("shitpost")) {
          continue;
        }

        const title = String(d.title || "gta6_still").trim();

        // 1. Direct i.redd.it image post
        const directUrl = String(d.url_overridden_by_dest || d.url || "");
        const previewSource = d.preview?.images?.[0]?.source;
        const width = Number(previewSource?.width || 0);
        const height = Number(previewSource?.height || 0);

        if (
          /^https:\/\/i\.redd\.it\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(directUrl) &&
          (width === 0 || width >= 1080) &&
          (height === 0 || width >= height * 0.85)
        ) {
          candidates.push({
            imageUrl: directUrl,
            title,
            source: "reddit",
            width,
            height,
          });
          continue;
        }

        // 2. Reddit multi-image gallery with high-res media_metadata
        if (d.is_gallery && d.media_metadata && typeof d.media_metadata === "object") {
          for (const meta of Object.values(d.media_metadata) as Array<Record<string, unknown>>) {
            if (!meta || meta.status !== "valid" || meta.e !== "Image") continue;
            const s = meta.s as { u?: string; x?: number; y?: number } | undefined;
            if (!s?.u) continue;
            const w = Number(s.x || 0);
            const h = Number(s.y || 0);
            if (w >= 1200 && w >= h * 0.9) {
              const cleanUrl = String(s.u).replace(/&amp;/g, "&");
              candidates.push({
                imageUrl: cleanUrl,
                title,
                source: "reddit-gallery",
                width: w,
                height: h,
              });
            }
          }
        }
      }
    } catch {
      // continue to next endpoint
    }
  }

  return candidates;
}

/**
 * Fetch high-res GTA VI image items from Internet Archive
 */
async function discoverArchiveHiResPhotos(): Promise<CandidatePhoto[]> {
  const candidates: CandidatePhoto[] = [];
  try {
    const searchUrl =
      'https://archive.org/advancedsearch.php?q=(title:("GTA+6"+OR+"GTA+VI"+OR+"Grand+Thft+Auto+VI"+OR+"Grand+Theft+Auto+VI"))+AND+mediatype:(image)&fl[]=identifier,title&sort[]=downloads+desc&rows=20&page=1&output=json';
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "LeonidaViceNewsroom/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return candidates;
    const data = await res.json();
    const docs = data?.response?.docs;
    if (!Array.isArray(docs)) return candidates;

    for (const doc of docs.slice(0, 8)) {
      const identifier = String(doc?.identifier || "");
      const title = String(doc?.title || identifier);
      if (!identifier) continue;

      try {
        const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();
        const files: Array<Record<string, unknown>> = Array.isArray(meta?.files)
          ? meta.files
          : [];
        const imgFile = files.find((f) => {
          const name = String(f.name || "");
          const size = Number(f.size || 0);
          return (
            /\.(jpe?g|png|webp)$/i.test(name) &&
            !name.includes("thumb") &&
            !name.includes("__ia_thumb") &&
            size >= 65000
          );
        });
        if (imgFile?.name) {
          candidates.push({
            imageUrl: `https://archive.org/download/${identifier}/${encodeURIComponent(
              String(imgFile.name)
            )}`,
            title,
            source: "archive",
          });
        }
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return candidates;
}

async function downloadPhotoToLibrary(
  candidate: CandidatePhoto,
  uploadsDir: string,
  existingFiles: Set<string>
): Promise<MediaAssetItem | null> {
  const urlHash = crypto
    .createHash("sha1")
    .update(candidate.imageUrl)
    .digest("hex")
    .slice(0, 8);

  for (const existing of existingFiles) {
    if (existing.includes(urlHash)) {
      return null; // Already downloaded previously
    }
  }

  try {
    const res = await fetch(candidate.imageUrl, {
      headers: {
        "User-Agent": "LeonidaViceNewsroom/2.0 (Editorial Photo Archiver)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Quality gate: ignore tiny/broken thumbnails (< 55 KB)
    if (buffer.byteLength < 55_000) return null;

    let ext = ".jpg";
    let mime = "image/jpeg";
    if (contentType.includes("png") || candidate.imageUrl.toLowerCase().endsWith(".png")) {
      ext = ".png";
      mime = "image/png";
    } else if (
      contentType.includes("webp") ||
      candidate.imageUrl.toLowerCase().endsWith(".webp")
    ) {
      ext = ".webp";
      mime = "image/webp";
    }

    const baseSlug = slugifyName(candidate.title) || "leonida_still";
    const fileName = `gta6_${baseSlug}_${urlHash}${ext}`;

    // 1. Save to local disk (public/images/uploads/) when writable
    let finalUrl: string | null = null;
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, fileName), buffer);
      finalUrl = `/images/uploads/${fileName}`;
    } catch {
      // Read-only serverless runtime on Vercel — rely on Supabase Storage below
    }

    // 2. Also upload to Supabase Storage ("article-images") so Vercel production persists scraped photos
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        await supabase.storage
          .createBucket(SUPABASE_BUCKET, {
            public: true,
            fileSizeLimit: 12 * 1024 * 1024,
          })
          .catch(() => {});

        const storagePath = `articles/${fileName}`;
        const { error: upErr } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(storagePath, buffer, {
            contentType: mime,
            upsert: true,
          });
        if (!upErr && !finalUrl) {
          const { data: pub } = supabase.storage
            .from(SUPABASE_BUCKET)
            .getPublicUrl(storagePath);
          finalUrl = pub.publicUrl;
        }
      } catch {
        // ignore cloud error if local succeeded
      }
    }

    if (!finalUrl) return null;

    existingFiles.add(fileName);
    return {
      url: finalUrl,
      name: fileName,
      folder: "uploads",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const assets = await getAllMediaAssets();

  return NextResponse.json(
    {
      ok: true,
      assets,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "scrape_photos" | "import_url";
      imageUrl?: string;
      customTitle?: string;
      maxCount?: number;
    };

    const uploadsDir = path.join(process.cwd(), "public", "images", "uploads");
    const existingAssets = await getAllMediaAssets();
    const existingFiles = new Set<string>(existingAssets.map((a) => a.name));

    // ── ACTION 1: IMPORT SINGLE DIRECT IMAGE URL ──────────────────────────
    if (body.action === "import_url") {
      const targetUrl = String(body.imageUrl || "").trim();
      if (!targetUrl.startsWith("http")) {
        return NextResponse.json(
          { ok: false, error: "Please provide a valid http(s) image URL." },
          { status: 400 }
        );
      }

      const item = await downloadPhotoToLibrary(
        {
          imageUrl: targetUrl,
          title: body.customTitle || "custom_gta6_photo",
          source: "manual-url",
        },
        uploadsDir,
        existingFiles
      );

      if (!item) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Could not download a high-resolution image from that URL (must be a direct image ≥55KB or not already downloaded).",
          },
          { status: 422 }
        );
      }

      const assets = await getAllMediaAssets();

      return NextResponse.json({
        ok: true,
        addedCount: 1,
        added: [item],
        assets,
      });
    }

    // ── ACTION 2: SCRAPE BATCH OF FRESH HI-RES GTA 6 PHOTOS ───────────────
    const targetMax = Math.min(Math.max(body.maxCount ?? 8, 1), 16);
    const [redditPhotos, archivePhotos] = await Promise.all([
      discoverRedditHiResPhotos(),
      discoverArchiveHiResPhotos(),
    ]);

    const allCandidates = [...redditPhotos, ...archivePhotos];
    const added: MediaAssetItem[] = [];

    for (const candidate of allCandidates) {
      if (added.length >= targetMax) break;
      const saved = await downloadPhotoToLibrary(candidate, uploadsDir, existingFiles);
      if (saved) {
        added.push(saved);
      }
    }

    const assets = await getAllMediaAssets();

    return NextResponse.json({
      ok: true,
      scannedCandidates: allCandidates.length,
      addedCount: added.length,
      added,
      assets,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to scrape photos",
      },
      { status: 500 }
    );
  }
}
