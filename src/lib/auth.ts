import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Minimal single-admin auth. There is only one role in this app (the church
 * administrator), so a full auth system would be overkill: the admin signs
 * in with a password (ADMIN_PASSWORD env var) and gets a signed session
 * cookie. Swap this for Supabase Auth / NextAuth later if multi-user support
 * is ever needed — the rest of the app doesn't care how the session is
 * established.
 */

const COOKIE_NAME = "prayer_updater_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET environment variable. See .env.example.");
  }
  return secret;
}

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(value);
  return hmac.digest("hex");
}

function makeToken(): string {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;
  if (sign(issuedAt) !== signature) return false;

  const ageSeconds = (Date.now() - parseInt(issuedAt, 10)) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_TTL_SECONDS;
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("Missing ADMIN_PASSWORD environment variable. See .env.example.");
  }
  // constant-time comparison
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
