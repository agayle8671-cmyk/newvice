import fs from "fs/promises";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const SUPABASE_BUCKET = "article-images";

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No image file provided." },
        { status: 400 }
      );
    }

    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported image format. Use JPG, PNG, WEBP, AVIF, or GIF.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image exceeds 12 MB size limit." },
        { status: 400 }
      );
    }

    const baseName = path
      .basename(file.name, path.extname(file.name))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "leonida-dispatch";

    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const filename = `${stamp}-${baseName}${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    // 1. Save locally to public/images/uploads/<filename> when filesystem is writable
    let localUrl: string | null = null;
    try {
      const uploadDir = path.join(process.cwd(), "public", "images", "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, filename), bytes);
      localUrl = `/images/uploads/${filename}`;
    } catch {
      // Read-only serverless runtime (Vercel) — rely on Supabase Storage URL
      localUrl = null;
    }

    // 2. Upload to Supabase Storage bucket ("article-images") when configured
    let cloudUrl: string | null = null;
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        // Ensure public bucket exists (no-op if already created)
        await supabase.storage
          .createBucket(SUPABASE_BUCKET, {
            public: true,
            fileSizeLimit: MAX_BYTES,
          })
          .catch(() => {});

        const storagePath = `articles/${filename}`;
        const { error: upErr } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(storagePath, bytes, {
            contentType: file.type,
            upsert: true,
          });

        if (!upErr) {
          const { data: pub } = supabase.storage
            .from(SUPABASE_BUCKET)
            .getPublicUrl(storagePath);
          cloudUrl = pub?.publicUrl ?? null;
        }
      } catch {
        // Ignore cloud storage failure if local write succeeded
      }
    }

    const primaryUrl = localUrl ?? cloudUrl;
    if (!primaryUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Failed to store uploaded image locally or in Supabase Storage.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: primaryUrl,
      localUrl,
      cloudUrl,
      filename,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Image upload failed.",
      },
      { status: 500 }
    );
  }
}
