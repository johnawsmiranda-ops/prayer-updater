import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Server-only Supabase client using the service role key.
 *
 * This app has exactly one admin user and no browser-side database access —
 * every read/write goes through a Next.js server action or route handler, so
 * we use the service role key (bypasses RLS) instead of juggling per-row
 * policies for a single user. The service role key must never be exposed to
 * the browser; importing "server-only" makes any accidental client import a
 * build error.
 */
let client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseServerClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
        "See .env.example for setup instructions."
    );
  }

  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
