import crypto from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ADMIN_COOKIE_NAME = "lv_admin_token";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

function getPasscode(): string {
  const configured = (process.env.ADMIN_PASSCODE ?? "").trim();
  if (configured.length > 0) return configured;
  return "leonida305";
}

function getSigningSecret(): string {
  const pass = getPasscode();
  const supa = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "lv-local-secret";
  return `${pass}::${supa.slice(0, 24)}::leonida-vice-newsroom`;
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPasscodeInput(candidate: string): boolean {
  const expected = getPasscode();
  if (!expected) return false;
  return safeCompare(candidate.trim(), expected);
}

export function createAdminSessionToken(): string {
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = `admin.${exp}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expStr, sig] = parts;
  if (role !== "admin") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(`${role}.${expStr}`)
    .digest("hex");
  return safeCompare(sig, expectedSig);
}

export interface AdminVerifyResult {
  authorized: boolean;
  method?: "cookie" | "passcode-header" | "supabase-admin";
  adminEmail?: string;
}

/**
 * Verifies admin authorization via EITHER:
 *  1. Signed HttpOnly Admin Passcode session cookie (lv_admin_token)
 *  2. Direct x-admin-passcode header
 *  3. Supabase Bearer access token belonging to a user with profiles.role === "admin"
 */
export async function verifyAdminRequest(
  request: NextRequest
): Promise<AdminVerifyResult> {
  // 1. Check signed session cookie
  const cookieToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (verifyAdminSessionToken(cookieToken)) {
    return { authorized: true, method: "cookie" };
  }

  // 2. Check x-admin-passcode header
  const headerPass = request.headers.get("x-admin-passcode") ?? "";
  if (headerPass && verifyPasscodeInput(headerPass)) {
    return { authorized: true, method: "passcode-header" };
  }

  // 3. Check Supabase Auth JWT + profiles.role === "admin"
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (bearer) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(bearer);
        if (!error && user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (profile?.role === "admin") {
            return {
              authorized: true,
              method: "supabase-admin",
              adminEmail: user.email,
            };
          }
        }
      } catch {
        // Fall through to unauthorized
      }
    }
  }

  return { authorized: false };
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}
