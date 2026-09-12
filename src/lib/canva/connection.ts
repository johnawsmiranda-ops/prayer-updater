import "server-only";
import { loadDb, mutateDb, type RawCanvaConnection } from "@/lib/store/workbook";
import { refreshCanvaToken } from "./oauth";
import type { CanvaConnection, CanvaConnectionStatus, CanvaSyncSummary } from "@/types/prayer";

/** Public shape — never includes access_token / refresh_token. */
export function toPublicConnection(raw: RawCanvaConnection): CanvaConnection {
  const { access_token: _at, refresh_token: _rt, ...rest } = raw;
  void _at;
  void _rt;
  return { ...rest, field_mapping: rest.field_mapping ?? {} };
}

export async function getCanvaConnection(): Promise<CanvaConnection> {
  const db = await loadDb();
  return toPublicConnection(db.canva);
}

export async function saveOAuthTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}): Promise<void> {
  await mutateDb((db) => {
    db.canva.access_token = input.accessToken;
    db.canva.refresh_token = input.refreshToken;
    db.canva.token_expires_at = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
    db.canva.connection_status = "CONNECTED";
    db.canva.updated_at = new Date().toISOString();
  });
}

export async function saveTemplateSelection(input: {
  templateId?: string | null;
  designId?: string | null;
  templateName?: string | null;
  fieldMapping?: Record<string, string>;
}): Promise<void> {
  await mutateDb((db) => {
    if (input.templateId !== undefined) db.canva.template_id = input.templateId;
    if (input.designId !== undefined) db.canva.design_id = input.designId;
    if (input.templateName !== undefined) db.canva.template_name = input.templateName;
    if (input.fieldMapping !== undefined) db.canva.field_mapping = input.fieldMapping;
    db.canva.updated_at = new Date().toISOString();
  });
}

export async function disconnectCanva(): Promise<void> {
  await mutateDb((db) => {
    db.canva.access_token = null;
    db.canva.refresh_token = null;
    db.canva.token_expires_at = null;
    db.canva.connection_status = "DISCONNECTED";
    db.canva.updated_at = new Date().toISOString();
  });
}

export async function recordSync(summary: CanvaSyncSummary): Promise<void> {
  await mutateDb((db) => {
    db.canva.last_synced_at = summary.syncedAt;
    db.canva.last_sync_summary = summary;
    db.canva.updated_at = new Date().toISOString();
  });
}

export async function setConnectionError(): Promise<void> {
  await mutateDb((db) => {
    db.canva.connection_status = "ERROR" as CanvaConnectionStatus;
    db.canva.updated_at = new Date().toISOString();
  });
}

/**
 * Returns a valid (non-expired) access token, refreshing it first if needed.
 * Returns null if there's no connection to refresh (never connected, or the
 * admin disconnected) — callers should fall back to the "Copy for Canva"
 * text-export flow in that case.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const db = await loadDb();
  const raw = db.canva;
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
