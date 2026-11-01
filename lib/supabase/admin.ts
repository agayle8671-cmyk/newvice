import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Trusted server-side Supabase clients. Never imported from client components.
// Neither touches cookies(), so both are safe inside prerender-aware route handlers
// under Next.js 16 cacheComponents.

let adminClient: SupabaseClient | null = null;
let readerClient: SupabaseClient | null = null;

function baseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") ? url : "";
}

/** Service-role client (bypasses RLS) — writes and privileged reads. Null if the key isn't configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = baseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || key.length < 20) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/**
 * Read-only client: uses the service role when available, otherwise the public anon key
 * (RLS still allows reading active+approved catalog rows). Null if Supabase isn't configured.
 */
export function getSupabaseReader(): SupabaseClient | null {
  const admin = getSupabaseAdmin();
  if (admin) return admin;
  const url = baseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || key.length < 20) return null;
  if (!readerClient) {
    readerClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return readerClient;
}
