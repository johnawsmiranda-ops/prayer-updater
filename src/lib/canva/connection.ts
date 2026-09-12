import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { refreshCanvaToken } from "./oauth";
import type { CanvaConnection, CanvaConnectionStatus, CanvaSyncSummary } from "@/types/prayer";
import type { Database } from "@/lib/supabase/database.types";

const ADMIN_USER_ID = "admin";

interface RawConnection extends Omit<CanvaConnection, "field_mapping" | "last_sync_summary"> {
  access_token: string | null;
  refresh_token: string | null;
  field_mapping: Record<string, string> | null;
  last_sync_summary: CanvaSyncSummary | null;
}

/** Fetches (or lazily creates) the single admin's Canva connection row. */
async function getOrCreateRawConnection(): Promise<RawConnection> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("canva_connections")
    .select("*")
    .eq("user_id", ADMIN_USER_ID)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as RawConnection;

  const { data: created, error: createError } = await supabase
    .from("canva_connections")
    .insert({ user_id: ADMIN_USER_ID })
    .select("*")
    .single();
  if (createError) throw createError;
  return created as RawConnection;
}

/** Public shape — never includes access_token / refresh_token. */
export function toPublicConnection(raw: RawConnection): CanvaConnection {
  const { access_token: _at, refresh_token: _rt, ...rest } = raw;
  void _at;
  void _rt;
  return { ...rest, field_mapping: rest.field_mapping ?? {} };
}

export async function getCanvaConnection(): Promise<CanvaConnection> {
  return toPublicConnection(await getOrCreateRawConnection());
}

export async function saveOAuthTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const existing = await getOrCreateRawConnection();
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();

  const { error } = await supabase
    .from("canva_connections")
    .update({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: expiresAt,
      connection_status: "CONNECTED",
    })
    .eq("id", existing.id);
  if (error) throw error;
}

export async function saveTemplateSelection(input: {
  templateId?: string | null;
  designId?: string | null;
  templateName?: string | null;
  fieldMapping?: Record<string, string>;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const existing = await getOrCreateRawConnection();

  const patch: Database["public"]["Tables"]["canva_connections"]["Update"] = {};
  if (input.templateId !== undefined) patch.template_id = input.templateId;
  if (input.designId !== undefined) patch.design_id = input.designId;
  if (input.templateName !== undefined) patch.template_name = input.templateName;
  if (input.fieldMapping !== undefined) patch.field_mapping = input.fieldMapping;

  const { error } = await supabase.from("canva_connections").update(patch).eq("id", existing.id);
  if (error) throw error;
}

export async function disconnectCanva(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const existing = await getOrCreateRawConnection();
  const { error } = await supabase
    .from("canva_connections")
    .update({
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      connection_status: "DISCONNECTED",
    })
    .eq("id", existing.id);
  if (error) throw error;
}

export async function recordSync(summary: CanvaSyncSummary): Promise<void> {
  const supabase = getSupabaseServerClient();
  const existing = await getOrCreateRawConnection();
  const { error } = await supabase
    .from("canva_connections")
    .update({ last_synced_at: summary.syncedAt, last_sync_summary: summary })
    .eq("id", existing.id);
  if (error) throw error;
}

export async function setConnectionError(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const existing = await getOrCreateRawConnection();
  const { error } = await supabase
    .from("canva_connections")
    .update({ connection_status: "ERROR" as CanvaConnectionStatus })
    .eq("id", existing.id);
  if (error) throw error;
}

/**
 * Returns a valid (non-expired) access token, refreshing it first if needed.
 * Returns null if there's no connection to refresh (never connected, or the
 * admin disconnected) — callers should fall back to the "Copy for Canva"
 * text-export flow in that case.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const raw = await getOrCreateRawConnection();
  if (!raw.access_token || !raw.refresh_token) return null;

  const expiresAt = raw.token_expires_at ? new Date(raw.token_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 60_000; // 60s safety margin
  if (stillValid) return raw.access_token;

  try {
    const refreshed = await refreshCanvaToken(raw.refresh_token);
    await saveOAuthTokens({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresInSeconds: refreshed.expires_in,
    });
    return refreshed.access_token;
  } catch {
    await setConnectionError();
    return null;
  }
}
