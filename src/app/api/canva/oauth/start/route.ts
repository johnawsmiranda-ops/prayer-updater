import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { buildAuthorizationUrl, generatePkcePair } from "@/lib/canva/oauth";

// Short-lived cookies that only carry the PKCE verifier + CSRF state across
// the redirect to Canva and back. Never contain any Canva credentials.
const VERIFIER_COOKIE = "canva_oauth_verifier";
const STATE_COOKIE = "canva_oauth_state";

export async function GET() {
  let url: string;
  let verifier: string;
  let state: string;

  try {
    const pkce = generatePkcePair();
    verifier = pkce.verifier;
    state = crypto.randomBytes(16).toString("hex");
    url = buildAuthorizationUrl({ state, codeChallenge: pkce.challenge });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Canva is not configured.";
    return NextResponse.redirect(
      new URL(`/canva?error=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    );
  }

  const store = await cookies();
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set(VERIFIER_COOKIE, verifier, cookieOpts);
  store.set(STATE_COOKIE, state, cookieOpts);

  return NextResponse.redirect(url);
}

export const VERIFIER_COOKIE_NAME = VERIFIER_COOKIE;
export const STATE_COOKIE_NAME = STATE_COOKIE;
