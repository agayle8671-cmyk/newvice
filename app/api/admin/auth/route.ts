import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  verifyAdminRequest,
  verifyPasscodeInput,
} from "@/lib/newspaper/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  return NextResponse.json({
    ok: true,
    authorized: auth.authorized,
    method: auth.method ?? null,
    adminEmail: auth.adminEmail ?? null,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";

  if (!passcode || !verifyPasscodeInput(passcode)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Newsroom Admin passcode." },
      { status: 401 }
    );
  }

  const token = createAdminSessionToken();
  const res = NextResponse.json({ ok: true, authorized: true, method: "cookie" });
  res.cookies.set(ADMIN_COOKIE_NAME, token, getAdminCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
  return res;
}
