import "server-only";
import crypto from "crypto";

/**
 * Canva Connect API — OAuth 2.0 Authorization Code + PKCE.
 * Reference: https://www.canva.dev/docs/connect/authentication/
 *
 * Canva requires PKCE (S256), and token exchange must happen from a backend —
 * the client secret can never be used from the browser (Canva blocks it via
 * CORS on purpose). All functions in this file are server-only.
 */

const AUTH_BASE = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

// Scopes needed for: reading/writing design content, reading brand template
// metadata + content (required for Autofill), and uploading image assets.
// https://www.canva.dev/docs/connect/appendix/scopes/
export const CANVA_SCOPES = [
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
  "asset:read",
  "asset:write",
  "profile:read",
].join(" ");

export function getRedirectUri(): string {
  const uri = process.env.CANVA_REDIRECT_URI;
  if (!uri) {
    throw new Error("Missing CANVA_REDIRECT_URI environment variable.");
  }
  return uri;
}

export function generatePkcePair() {
  const verifier = crypto.randomBytes(64).toString("base64url").slice(0, 128);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string }): string {
  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) throw new Error("Missing CANVA_CLIENT_ID environment variable.");

  const url = new URL(AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("scope", CANVA_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface CanvaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

function basicAuthHeader(): string {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing CANVA_CLIENT_ID / CANVA_CLIENT_SECRET environment variables.");
  }
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<CanvaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function refreshCanvaToken(refreshToken: string): Promise<CanvaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}
