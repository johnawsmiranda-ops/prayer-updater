/**
 * Imports the church's original Prayer List Excel workbook (two sheets:
 * "Healing" and "General Prayer", the church's own column names) into this
 * app's canonical single-sheet workbook — the app's actual "database" file.
 *
 * Usage:
 *   npm run import:excel -- "/path/to/Prayer-list-Updated-08-09-2026.xlsx"
 *
 * This writes to the SAME storage the running app reads from (a local file
 * under data/ by default, or Vercel Blob if BLOB_READ_WRITE_TOKEN is set in
 * your environment) — so run it once against local storage before your
 * first `npm run dev`, and once with BLOB_READ_WRITE_TOKEN set (or from a
 * Vercel deployment's environment) to seed production.
 *
 * Nothing from the original spreadsheet is discarded: the raw "Status" text
 * is preserved in `source_status_raw` even after normalization.
 */
import * as XLSX from "xlsx";
import path from "path";
import crypto from "crypto";
import { loadDb, saveDb } from "@/lib/store/workbook";
import type { Prayer } from "@/types/prayer";

/**
 * Normalizes the church's historical, free-text "Status" column into the
 * app's three statuses:
 *   "Continues Prayer" / "Continue prayer" -> ACTIVE
 *   "Answered Prayer" / "Answered"          -> ANSWERED (date extracted if present)
 *   "No Update"                              -> ACTIVE (surfaces as Needs
 *                                               Review once it's old)
 *   "With his/her Creator" (passed away)     -> ARCHIVED
 *   Anything else                            -> ACTIVE, kept verbatim in
 *                                               source_status_raw
 */
function normalizeStatus(raw: string | null | undefined): {
  status: Prayer["status"];
  dateAnswered: string | null;
} {
  const text = (raw ?? "").trim();
  if (!text || /no update/i.test(text)) return { status: "ACTIVE", dateAnswered: null };
  if (/answered/i.test(text)) {
    const dateMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    return { status: "ANSWERED", dateAnswered: dateMatch ? toIsoDate(dateMatch) : null };
  }
  if (/with (his|her|the lord|creator)/i.test(text)) return { status: "ARCHIVED", dateAnswered: null };
  if (/continue/i.test(text)) return { status: "ACTIVE", dateAnswered: null };
  return { status: "ACTIVE", dateAnswered: null };
}

function toIsoDate(match: RegExpMatchArray): string {
  // The workbook uses DD/MM/YYYY.
  const [, dd, mm, yyRaw] = match;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function cellStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function parseSheet(sheet: XLSX.WorkSheet, defaultCategory: string): Prayer[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const headerIndex = rows.findIndex((row) => row.some((cell) => /name/i.test(String(cell ?? ""))));
  if (headerIndex === -1) return [];

  const header = rows[headerIndex].map((h) => String(h ?? "").trim().toLowerCase());
  const colIndex = (...names: string[]) => header.findIndex((h) => names.some((n) => h.startsWith(n)));

  const idx = {
    year: colIndex("year"),
    name: colIndex("name"),
    request: colIndex("request", "prayer request"),
    requestedBy: colIndex("requested by"),
    category: colIndex("category"),
    ministry: colIndex("assigned ministry", "ministry"),
    dateAnswered: colIndex("date answered"),
    status: colIndex("status"),
  };

  const parsed: Prayer[] = [];
  const ts = new Date().toISOString();

  for (const row of rows.slice(headerIndex + 1)) {
    const name = cellStr(row[idx.name]);
    if (!name) continue; // skip blank/spacer rows

    const rawStatus = cellStr(row[idx.status]);
    const { status, dateAnswered } = normalizeStatus(rawStatus);
    const explicitDateAnswered = cellStr(row[idx.dateAnswered]);
    const dateAdded = `${Number(row[idx.year]) || new Date().getFullYear()}-01-01`;

    parsed.push({
      id: crypto.randomUUID(),
      year: Number(row[idx.year]) || new Date().getFullYear(),
      name,
      prayer_request: cellStr(row[idx.request]) ?? "",
      requested_by: cellStr(row[idx.requestedBy]),
      category: cellStr(row[idx.category]) ?? defaultCategory,
      assigned_ministry: cellStr(row[idx.ministry]),
      status,
      notes: null,
      date_added: dateAdded,
      last_updated: ts,
      date_answered: explicitDateAnswered ?? dateAnswered,
      source_status_raw: rawStatus,
      created_at: ts,
      updated_at: ts,
    });
  }

  return parsed;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import:excel -- <path-to-xlsx>");
    process.exit(1);
  }

  const workbook = XLSX.readFile(path.resolve(filePath));
  const allRows: Prayer[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const defaultCategory = /healing/i.test(sheetName) ? "General Healing, Strength, and Wellness" : "General";
    const rows = parseSheet(sheet, defaultCategory);
    console.log(`Parsed ${rows.length} rows from sheet "${sheetName}"`);
    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    console.error("No rows found — check that the workbook has a header row containing 'Name'.");
    process.exit(1);
  }

  const db = await loadDb();
  const existingCount = db.prayers.length;
  db.prayers.push(...allRows);
  await saveDb(db);

  console.log(`\nDone. Imported ${allRows.length} prayers (${existingCount} were already in the app's data).`);
  const answered = allRows.filter((r) => r.status === "ANSWERED").length;
  const archived = allRows.filter((r) => r.status === "ARCHIVED").length;
  console.log(`  Active: ${allRows.length - answered - archived}, Answered: ${answered}, Archived: ${archived}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
