import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken } from "@/lib/canva/oauth";
import { saveOAuthTokens } from "@/lib/canva/connection";
import { VERIFIER_COOKIE_NAME, STATE_COOKIE_NAME } from "../start/route";

function redirectToCanvaPage(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/canva", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE_NAME)?.value;
  const verifier = store.get(VERIFIER_COOKIE_NAME)?.value;
  store.delete(VERIFIER_COOKIE_NAME);
  store.delete(STATE_COOKIE_NAME);

  if (oauthError) {
    return redirectToCanvaPage(request, { error: `Canva declined the connection: ${oauthError}` });
  }
  if (!code || !state || !verifier || state !== expectedState) {
    return redirectToCanvaPage(request, { error: "Canva sign-in expired or was invalid. Please try again." });
  }

  try {
    const token = await exchangeCodeForToken(code, verifier);
    await saveOAuthTokens({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresInSeconds: token.expires_in,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return redirectToCanvaPage(request, { error: `Couldn't finish connecting Canva: ${message}` });
  }

  return redirectToCanvaPage(request, { connected: "1" });
}
