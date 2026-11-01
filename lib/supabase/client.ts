import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (
    !url ||
    !key ||
    url === "undefined" ||
    key === "undefined" ||
    !url.startsWith("https://")
  ) {
    throw new Error("Supabase not configured — running in demo mode");
  }

  return createBrowserClient(url, key);
}
