// Note: deliberately no "server-only" import here — this module is also
// loaded directly by scripts/import-excel.ts, a plain Node script run via
// tsx outside of Next's build pipeline, where "server-only" always throws.
// lib/prayers.ts and lib/canva/connection.ts (which everything else in the
// app imports) still guard with "server-only", so this file can't end up in
// a client bundle by accident through the normal app code paths.
import * as XLSX from "xlsx";
import { readWorkbookBytes, writeWorkbookBytes } from "./blobStore";
import type { Prayer, PrayerHistoryEntry, CanvaConnectionStatus, CanvaSyncSummary } from "@/types/prayer";

/**
 * The whole "database" is one .xlsx workbook with three sheets. This module
 * is the only place that knows that — everything else (lib/prayers.ts,
 * lib/canva/connection.ts) works with plain arrays/objects, so swapping the
 * storage format later (a real DB, if the church ever outgrows this) only
 * means rewriting this file.
 */

export const SHEET_PRAYERS = "Prayers";
export const SHEET_HISTORY = "History";
export const SHEET_CANVA = "CanvaConnection";

export interface RawCanvaConnection {
  id: string;
  user_id: string;
  template_id: string | null;
  design_id: string | null;
  template_name: string | null;
  connection_status: CanvaConnectionStatus;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  field_mapping: Record<string, string>;
  last_synced_at: string | null;
  last_sync_summary: CanvaSyncSummary | null;
  created_at: string;
  updated_at: string;
}

export interface Db {
  prayers: Prayer[];
  history: PrayerHistoryEntry[];
  canva: RawCanvaConnection;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyCanva(): RawCanvaConnection {
  const ts = nowIso();
  return {
    id: "admin",
    user_id: "admin",
    template_id: null,
    design_id: null,
    template_name: null,
    connection_status: "DISCONNECTED",
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    field_mapping: {},
    last_synced_at: null,
    last_sync_summary: null,
    created_at: ts,
    updated_at: ts,
  };
}

function emptyDb(): Db {
  return { prayers: [], history: [], canva: emptyCanva() };
}

// --- number/date cells XLSX hands back need normalizing back to our types ---

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function strOrNull(value: unknown): string | null {
  const s = str(value).trim();
  return s.length > 0 ? s : null;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function jsonOrDefault<T>(value: unknown, fallback: T): T {
  const s = str(value).trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function sheetRows(sheet: XLSX.WorkSheet | undefined): Record<string, unknown>[] {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function rowToPrayer(row: Record<string, unknown>): Prayer {
  return {
    id: str(row.id),
    year: num(row.year, new Date().getFullYear()),
    name: str(row.name),
    prayer_request: str(row.prayer_request),
    requested_by: strOrNull(row.requested_by),
    category: str(row.category) || "General",
    assigned_ministry: strOrNull(row.assigned_ministry),
    status: (str(row.status) || "ACTIVE") as Prayer["status"],
    notes: strOrNull(row.notes),
    date_added: str(row.date_added) || nowIso().slice(0, 10),
    last_updated: str(row.last_updated) || nowIso(),
    date_answered: strOrNull(row.date_answered),
    source_status_raw: strOrNull(row.source_status_raw),
    created_at: str(row.created_at) || nowIso(),
    updated_at: str(row.updated_at) || nowIso(),
  };
}

function rowToHistory(row: Record<string, unknown>): PrayerHistoryEntry {
  return {
    id: str(row.id),
    prayer_id: str(row.prayer_id),
    previous_status: strOrNull(row.previous_status) as PrayerHistoryEntry["previous_status"],
    new_status: strOrNull(row.new_status) as PrayerHistoryEntry["new_status"],
    previous_request: strOrNull(row.previous_request),
    new_request: strOrNull(row.new_request),
    changed_at: str(row.changed_at) || nowIso(),
    changed_by: str(row.changed_by) || "admin",
  };
}

function rowToCanva(row: Record<string, unknown> | undefined): RawCanvaConnection {
  if (!row) return emptyCanva();
  return {
    id: str(row.id) || "admin",
    user_id: str(row.user_id) || "admin",
    template_id: strOrNull(row.template_id),
    design_id: strOrNull(row.design_id),
    template_name: strOrNull(row.template_name),
    connection_status: (str(row.connection_status) || "DISCONNECTED") as CanvaConnectionStatus,
    access_token: strOrNull(row.access_token),
    refresh_token: strOrNull(row.refresh_token),
    token_expires_at: strOrNull(row.token_expires_at),
    field_mapping: jsonOrDefault(row.field_mapping, {}),
    last_synced_at: strOrNull(row.last_synced_at),
    last_sync_summary: jsonOrDefault(row.last_sync_summary, null),
    created_at: str(row.created_at) || nowIso(),
    updated_at: str(row.updated_at) || nowIso(),
  };
}

function parseWorkbookBytes(bytes: Buffer): Db {
  const wb = XLSX.read(bytes, { type: "buffer" });
  const prayers = sheetRows(wb.Sheets[SHEET_PRAYERS]).map(rowToPrayer);
  const history = sheetRows(wb.Sheets[SHEET_HISTORY]).map(rowToHistory);
  const canvaRows = sheetRows(wb.Sheets[SHEET_CANVA]);
  const canva = rowToCanva(canvaRows[0]);

  return { prayers, history, canva };
}

export async function loadDb(): Promise<Db> {
  const bytes = await readWorkbookBytes();
  if (!bytes) return emptyDb();
  return parseWorkbookBytes(bytes);
}

/**
 * Replaces the ENTIRE database with the contents of an uploaded .xlsx file
 * (same three-sheet shape this app itself writes). Used by the Settings →
 * "Restore from Excel file" admin tool — e.g. to recover onto a freshly
 * connected Blob store from a known-good local copy.
 */
export async function restoreDbFromBytes(bytes: Buffer): Promise<Db> {
  const db = parseWorkbookBytes(bytes);
  const run = async () => {
    await saveDb(db);
    return db;
  };
  const scheduled = writeQueue.then(run, run);
  writeQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export async function saveDb(db: Db): Promise<void> {
  const wb = XLSX.utils.book_new();

  const prayerRows = db.prayers.map((p) => ({ ...p }));
  const historyRows = db.history.map((h) => ({ ...h }));
  const canvaRow = {
    ...db.canva,
    field_mapping: JSON.stringify(db.canva.field_mapping ?? {}),
    last_sync_summary: db.canva.last_sync_summary ? JSON.stringify(db.canva.last_sync_summary) : "",
  };

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(prayerRows.length > 0 ? prayerRows : [{}]),
    SHEET_PRAYERS
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(historyRows.length > 0 ? historyRows : [{}]),
    SHEET_HISTORY
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([canvaRow]), SHEET_CANVA);

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await writeWorkbookBytes(buffer);
}

// A same-process mutex: not a substitute for real transactions (two
// concurrent serverless instances could still race), but for a single-admin
// app clicking buttons one at a time on one machine, this is what keeps a
// double-click from reading-modifying-writing out of order.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function mutateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  };
  const scheduled = writeQueue.then(run, run);
  writeQueue = scheduled.catch(() => undefined);
  return scheduled;
}
