/**
 * Imports the church's existing Prayer List Excel workbook into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-excel.ts "/path/to/Prayer-list-Updated-08-09-2026.xlsx"
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
 * (e.g. `.env.local`, loaded automatically if you run via `npm run import`).
 *
 * This is a one-time / occasional admin tool, not part of the deployed app —
 * that's why `xlsx` lives in devDependencies rather than the app's runtime
 * dependencies (it has known advisories that don't matter for a local,
 * trusted-file import script, but shouldn't ship in the Vercel bundle).
 *
 * Nothing from the original spreadsheet is discarded: the raw "Status" text
 * is preserved in `source_status_raw` even after normalization, and every
 * row from every sheet becomes one `prayers` row.
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import path from "path";

interface ParsedRow {
  year: number;
  name: string;
  prayer_request: string;
  requested_by: string | null;
  category: string;
  assigned_ministry: string | null;
  status: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  date_answered: string | null;
  source_status_raw: string | null;
  notes: string | null;
}

/**
 * Normalizes the church's historical, free-text "Status" column into the
 * app's three statuses, per the mapping in the project brief:
 *   "Continues Prayer" / "Continue prayer" -> ACTIVE
 *   "Answered Prayer" / "Answered"          -> ANSWERED
 *   "No Update"                              -> ACTIVE (still surfaces as
 *                                               Needs Review once it's old)
 *   "With his/her Creator" (passed away)     -> ARCHIVED
 *   Anything else                            -> ACTIVE, kept verbatim in
 *                                               source_status_raw
 * A trailing "- Updated DD/MM/YYYY" or similar is extracted as the answered
 * date when the status is Answered; otherwise it's just noted.
 */
function normalizeStatus(raw: string | null | undefined): {
  status: ParsedRow["status"];
  dateAnswered: string | null;
} {
  const text = (raw ?? "").trim();
  if (!text || /no update/i.test(text)) return { status: "ACTIVE", dateAnswered: null };
  if (/answered/i.test(text)) {
    const dateMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    const dateAnswered = dateMatch ? toIsoDate(dateMatch) : null;
    return { status: "ANSWERED", dateAnswered };
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

function parseSheet(sheet: XLSX.WorkSheet, defaultCategory: string): ParsedRow[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // Header row is the first row that contains "Name" (both sheets have a
  // couple of title rows above the real header, per the source file).
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

  const parsed: ParsedRow[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const name = cellStr(row[idx.name]);
    if (!name) continue; // skip blank/spacer rows

    const rawStatus = cellStr(row[idx.status]);
    const { status, dateAnswered } = normalizeStatus(rawStatus);
    const explicitDateAnswered = cellStr(row[idx.dateAnswered]);

    parsed.push({
      year: Number(row[idx.year]) || new Date().getFullYear(),
      name,
      prayer_request: cellStr(row[idx.request]) ?? "",
      requested_by: cellStr(row[idx.requestedBy]),
      category: cellStr(row[idx.category]) ?? defaultCategory,
      assigned_ministry: cellStr(row[idx.ministry]),
      status,
      date_answered: explicitDateAnswered ?? dateAnswered,
      source_status_raw: rawStatus,
      notes: null,
    });
  }

  return parsed;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-excel.ts <path-to-xlsx>");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const workbook = XLSX.readFile(path.resolve(filePath));
  const allRows: ParsedRow[] = [];

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

  const supabase = createClient(url, key);
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);
    const { error } = await supabase.from("prayers").insert(batch);
    if (error) {
      console.error("Insert failed:", error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${allRows.length}`);
  }

  console.log(`\nDone. Imported ${inserted} prayers.`);
  const answered = allRows.filter((r) => r.status === "ANSWERED").length;
  const archived = allRows.filter((r) => r.status === "ARCHIVED").length;
  console.log(`  Active: ${allRows.length - answered - archived}, Answered: ${answered}, Archived: ${archived}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
