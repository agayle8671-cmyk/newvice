import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getPublishedArticlesServer } from "@/lib/newspaper/store.server";

export async function GET() {
  await connection();
  const articles = await getPublishedArticlesServer();
  return NextResponse.json(
    { ok: true, articles },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
