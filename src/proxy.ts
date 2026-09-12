import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function is
// now `proxy`, not `middleware`). It always runs on the Node.js runtime, so
// we can reuse plain `node:crypto` here — no edge-runtime workaround needed.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function verifyToken(token: string | undefined, secret: string | undefined): boolean {
  if (!token || !secret) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(issuedAt).digest("hex");
  if (expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;

  const ageSeconds = (Date.now() - parseInt(issuedAt, 10)) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_TTL_SECONDS;
}

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = verifyToken(token, process.env.SESSION_SECRET);

  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
